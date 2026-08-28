import { automationRepository } from '../database/repositories/automationRepository.js';
import { getLogger } from '../logging/logger.js';

export interface EventPayload {
  guild: { id: string };
  member?: { id?: string; user?: { bot?: boolean } } | null;
  message?: { id?: string; content?: string; author?: { bot?: boolean } } | null;
  channelId?: string | null;
  channelName?: string | null;
  [key: string]: unknown;
}

export type AutomationRunner = (
  guildId: string,
  actionDescription: string,
  channelId: string | null,
) => Promise<void>;

const DEDUP_TTL_MS = 5000;
const CLEANUP_INTERVAL_MS = 60_000;

/**
 * Event-driven automation engine. It does NOT invoke the LLM on every event —
 * only when a configured automation's trigger and conditions match.
 */
export class AutomationEngine {
  private runner: AutomationRunner | null = null;
  private recentExecutions = new Map<string, number>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupTimer();
  }

  setRunner(runner: AutomationRunner): void {
    this.runner = runner;
  }

  async handleEvent(trigger: string, payload: EventPayload): Promise<void> {
    if (!this.runner) return;

    const guildId = payload.guild.id;
    const automations = automationRepository.listAutomations(guildId, trigger);
    if (automations.length === 0) return;

    for (const automation of automations) {
      // Skip if the event originated from a bot (prevents self‑loops)
      if (payload.message?.author?.bot || payload.member?.user?.bot) {
        continue;
      }

      // Deduplication check
      if (this.isDuplicate(guildId, automation.id, trigger, payload)) {
        continue;
      }

      const conditions = this.parseConditions(automation.conditions);
      if (!this.matchesConditions(conditions, payload)) continue;

      const action = this.parseAction(automation.action);
      getLogger().info(
        { guildId, trigger, automationId: automation.id },
        'automation triggered',
      );

      try {
        await this.runner(guildId, action.description, payload.channelId ?? null);
      } catch (err) {
        getLogger().error(
          { err, guildId, automationId: automation.id },
          'automation failed',
        );
      }
    }
  }

  private isDuplicate(
    guildId: string,
    automationId: number,
    trigger: string,
    payload: EventPayload,
  ): boolean {
    const key = `${guildId}:${automationId}:${trigger}:${payload.message?.id ?? payload.member?.id ?? payload.channelId ?? Date.now().toString()}`;
    const now = Date.now();
    const last = this.recentExecutions.get(key);

    if (last && now - last < DEDUP_TTL_MS) {
      return true;
    }

    this.recentExecutions.set(key, now);
    return false;
  }

  private parseConditions(raw: string): Array<{ description: string }> {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private parseAction(raw: string): { description: string } {
    try {
      const parsed = JSON.parse(raw);
      return { description: String(parsed.description ?? '') };
    } catch {
      return { description: '' };
    }
  }

  public matchesConditions(
    conditions: Array<{ description: string }>,
    payload: EventPayload,
  ): boolean {
    if (!conditions || conditions.length === 0) return true;

    for (const condition of conditions) {
      const desc = condition.description?.trim();
      if (!desc) continue;

      if (!this.matchesSingleCondition(desc, payload)) {
        return false;
      }
    }
    return true;
  }

  private matchesSingleCondition(desc: string, payload: EventPayload): boolean {
    const lowerDesc = desc.toLowerCase().trim();

    // 1. Bot / Human status check
    const isBotAuthor = Boolean(payload.message?.author?.bot || payload.member?.user?.bot);
    if (
      lowerDesc.includes('not a bot') ||
      lowerDesc.includes('non-bot') ||
      lowerDesc.includes('human') ||
      lowerDesc.includes('users only')
    ) {
      if (isBotAuthor) return false;
    }

    if (
      lowerDesc.includes('only bots') ||
      lowerDesc.includes('bot only') ||
      lowerDesc.includes('is bot')
    ) {
      if (!isBotAuthor) return false;
    }

    // 2. Channel check (if condition specifies channel name or id)
    const channelMatch = lowerDesc.match(/(?:\bin\b|\bchannel\s+(?:is\s+)?)\s*#?([a-zA-Z0-9_-]+)/i);
    let channelChecked = false;
    if (channelMatch && channelMatch[1]) {
      channelChecked = true;
      const targetChannel = channelMatch[1].toLowerCase();
      const currentChannelId = payload.channelId?.toLowerCase();
      const currentChannelName = (payload.channelName as string | undefined)?.toLowerCase();
      const rawChannelName = currentChannelName?.replace(/^#/, '');

      const isChannelMatch =
        currentChannelId === targetChannel ||
        currentChannelName === targetChannel ||
        currentChannelName === `#${targetChannel}` ||
        rawChannelName === targetChannel;

      if (!isChannelMatch) return false;
    }

    // 3. Message Content checks (when payload has message content)
    if (payload.message && typeof payload.message.content === 'string') {
      const msgContent = payload.message.content.trim();
      const msgLower = msgContent.toLowerCase();

      // Check for quoted strings (e.g. "message content is '!fact'" or 'when user types "!fact"')
      const quotes = Array.from(desc.matchAll(/["'`]([^"'`]+)["'`]/g)).map((m) => m[1]!);
      if (quotes.length > 0) {
        for (const q of quotes) {
          const qLower = q.toLowerCase();
          if (lowerDesc.includes('starts with') || lowerDesc.includes('prefix')) {
            if (!msgLower.startsWith(qLower)) return false;
          } else if (
            lowerDesc.includes('equals') ||
            lowerDesc.includes('message is') ||
            lowerDesc.includes('content is')
          ) {
            if (msgLower !== qLower) return false;
          } else if (lowerDesc.includes('ends with')) {
            if (!msgLower.endsWith(qLower)) return false;
          } else {
            if (!msgLower.includes(qLower)) return false;
          }
        }
        return true;
      }

      // Check for command tokens starting with !, /, $, ., or ? (e.g., !fact, /help, $price)
      const commandTokens = Array.from(desc.matchAll(/([!/$.?][a-zA-Z0-9_-]+)/g)).map((m) => m[1]!);
      if (commandTokens.length > 0) {
        for (const token of commandTokens) {
          const tokenLower = token.toLowerCase();
          const firstWord = msgLower.split(/\s+/)[0];
          const matchedToken =
            firstWord === tokenLower ||
            msgLower.startsWith(tokenLower + ' ') ||
            msgLower === tokenLower ||
            msgLower.includes(tokenLower);
          if (!matchedToken) return false;
        }
        return true;
      }

      // Explicit keywords without quotes:
      // "starts with <text>" or "prefix <text>"
      const startsWithMatch = desc.match(/(?:starts\s+with|prefix)\s+([^\s,]+)/i);
      if (startsWithMatch && startsWithMatch[1]) {
        return msgLower.startsWith(startsWithMatch[1].toLowerCase());
      }

      // "ends with <text>"
      const endsWithMatch = desc.match(/ends\s+with\s+([^\s,]+)/i);
      if (endsWithMatch && endsWithMatch[1]) {
        return msgLower.endsWith(endsWithMatch[1].toLowerCase());
      }

      // "message is <text>", "content is <text>", "equals <text>"
      const equalsMatch = desc.match(/(?:message|content)\s+(?:is|equals)\s+([^\s,]+)/i);
      if (equalsMatch && equalsMatch[1]) {
        return msgLower === equalsMatch[1].toLowerCase();
      }

      // "contains <text>" or "includes <text>"
      const containsMatch = desc.match(/(?:contains|includes)\s+([^\s,]+)/i);
      if (containsMatch && containsMatch[1]) {
        return msgLower.includes(containsMatch[1].toLowerCase());
      }

      // Check if description specifies a trigger phrase requirement (e.g. "when user types hello")
      const triggerPhraseMatch = desc.match(/(?:when|if)\s+(?:someone|user|person|a user)?\s*(?:sends|types|says)\s+(.+)/i);
      if (triggerPhraseMatch && triggerPhraseMatch[1]) {
        const phrase = triggerPhraseMatch[1].replace(/message|content/gi, '').trim().toLowerCase();
        if (phrase.length > 0) {
          return msgLower.includes(phrase) || msgLower.startsWith(phrase);
        }
      }

      // If condition text is purely metadata (bot/channel check only), message content check is satisfied
      const isMetaOnly =
        channelChecked ||
        lowerDesc.includes('bot') ||
        lowerDesc.includes('human') ||
        lowerDesc.includes('channel') ||
        lowerDesc.includes('non-bot');
      if (isMetaOnly) {
        return true;
      }

      // Fallback for short direct condition descriptions (e.g., desc = "hello world")
      return msgLower.startsWith(lowerDesc) || msgLower.includes(lowerDesc);
    }

    return true;
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, timestamp] of this.recentExecutions.entries()) {
        if (now - timestamp > DEDUP_TTL_MS) {
          this.recentExecutions.delete(key);
        }
      }
    }, CLEANUP_INTERVAL_MS);
    // Prevent the timer from keeping the process alive
    this.cleanupTimer.unref?.();
  }

  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

export const automationEngine = new AutomationEngine();