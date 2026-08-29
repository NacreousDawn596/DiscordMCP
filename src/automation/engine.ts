import { automationRepository } from '../database/repositories/automationRepository.js';
import { notebookRepository } from '../database/repositories/notebookRepository.js';
import { getLogger } from '../logging/logger.js';

export interface EventPayload {
  guild: {
    id: string;
    roles?: {
      cache:
        | Map<string, { id: string; name: string }>
        | { get(id: string): unknown; find(fn: (r: { name: string }) => boolean): unknown };
    };
  };
  member?: {
    id?: string;
    roles?: { add(role: unknown): Promise<unknown>; remove(role: unknown): Promise<unknown> };
    user?: { bot?: boolean };
  } | null;
  message?: {
    id?: string;
    content?: string | null;
    author?: { id?: string; bot?: boolean } | null;
    delete?: () => Promise<unknown>;
  } | null;
  messageId?: string | null;
  channelId?: string | null;
  channelName?: string | null;
  user?: { id?: string; bot?: boolean } | null;
  emoji?: { name?: string | null; id?: string | null; identifier?: string } | null;
  [key: string]: unknown;
}

export type AutomationRunner = (
  guildId: string,
  actionDescription: string,
  channelId: string | null,
) => Promise<void>;

const DEDUP_TTL_MS = 5000;
const CLEANUP_INTERVAL_MS = 60_000;

const DEFAULT_OFFENSIVE_WORDS = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'cunt',
  'dick',
  'nigger',
  'retard',
  'pussy',
  'whore',
  'slut',
  'scam',
  'free nitro',
];

/**
 * Event-driven automation engine with broad semantic matching, word lists,
 * offensive/toxic detection, notebook state updates, and instant fast-path actions.
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

    const isReactionEvent = trigger.startsWith('reaction_');

    for (const automation of automations) {
      // Skip if the actor who triggered the event is a bot (prevents self‑loops).
      const isActorBot = isReactionEvent
        ? Boolean(payload.user?.bot || payload.member?.user?.bot)
        : Boolean(payload.message?.author?.bot || payload.member?.user?.bot || payload.user?.bot);

      if (isActorBot) {
        continue;
      }

      // Deduplication check
      if (this.isDuplicate(guildId, automation.id, trigger, payload)) {
        continue;
      }

      const conditions = this.parseConditions(automation.conditions);
      if (!this.matchesConditions(conditions, payload, trigger)) continue;

      const action = this.parseAction(automation.action);
      getLogger().info(
        { guildId, trigger, automationId: automation.id },
        'automation triggered',
      );

      // Fast-path execution for reaction roles, notebook updates, and instant moderation actions
      const handledFastAction = await this.tryExecuteFastAction(
        trigger,
        action.description,
        payload,
      );
      if (handledFastAction) continue;

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

  private async tryExecuteFastAction(
    trigger: string,
    actionDesc: string,
    payload: EventPayload,
  ): Promise<boolean> {
    const lowerAction = actionDesc.toLowerCase().trim();
    const guildId = payload.guild.id;
    const memberId = payload.user?.id ?? payload.member?.id ?? null;

    // 1. Reaction Role Fast Action
    if (
      (trigger === 'reaction_add' || trigger === 'reaction_remove') &&
      payload.member
    ) {
      const handledRole = await this.tryExecuteReactionRole(trigger, actionDesc, payload);
      if (handledRole) return true;
    }

    // 2-a. Pure xp/coins/points/level increment — e.g. "add 10 xp", "increment user's xp", "give coins"
    // Detect any action that is PRIMARILY about incrementing notebook data (even if described verbosely)
    // These keywords in the description signal that this is a pure notebook update
    const isNotebookAction =
      lowerAction.includes('increment') ||
      lowerAction.includes('add xp') ||
      lowerAction.includes('give xp') ||
      lowerAction.includes('user\'s xp') ||
      lowerAction.includes("user's xp") ||
      lowerAction.includes('add coins') ||
      lowerAction.includes('give coins') ||
      lowerAction.includes('add points') ||
      lowerAction.includes('give points') ||
      lowerAction.includes('grant xp') ||
      lowerAction.includes('earn xp') ||
      lowerAction.includes('accumulate xp');

    if (isNotebookAction) {
      // Extract how much to increment
      const amountMatch = lowerAction.match(/(?:by|of|add|give|grant)?\s*(\d+)\s*(?:xp|coins?|points?|exp)?/i);
      const amount = amountMatch ? Number(amountMatch[1]) : 10;

      // Extract which key to update
      let key = 'xp';
      if (/coins?/.test(lowerAction)) key = 'coins';
      else if (/points?/.test(lowerAction)) key = 'points';
      else if (/exp\b/.test(lowerAction)) key = 'xp';

      notebookRepository.updateEntry({
        guildId,
        key,
        operation: 'increment',
        value: amount,
        memberId,
      });
      getLogger().info({ guildId, key, amount, memberId }, 'fast notebook increment executed');
      return true;
    }

    // 2-b. Level threshold check + congratulations — detect by keywords
    // e.g. "check if new total XP crosses the threshold for the next level ... and sends a congratulatory message"
    const isLevelCheckAction =
      (lowerAction.includes('level') &&
        (lowerAction.includes('threshold') ||
          lowerAction.includes('formulat') ||
          lowerAction.includes('level up') ||
          lowerAction.includes('cross') ||
          lowerAction.includes('reach') ||
          lowerAction.includes('congratulat') ||
          lowerAction.includes('leveling') ||
          lowerAction.includes('levelling') ||
          lowerAction.includes('checks')
        )
      );

    if (isLevelCheckAction) {
      // Run the level progression check entirely in fast-path
      await this.tryExecuteLevelCheck(payload, actionDesc);
      return true;
    }

    // 3. Explicit notebook set (e.g. "set notebook key to value", "set xp to 0")
    const setMatch = lowerAction.match(/set\s+(?:notebook\s+)?([a-zA-Z0-9_-]+)\s+to\s+(-?\d+(?:\.\d+)?)/i);
    if (setMatch && setMatch[1]) {
      notebookRepository.setEntry({
        guildId,
        key: setMatch[1].toLowerCase(),
        value: setMatch[2],
        memberId,
      });
      return true;
    }

    // 4. Generic "add N <key>" or "increment <key> by N" (original simple matcher)
    const notebookIncrementMatch = lowerAction.match(
      /(?:add|increment|give|grant)\s+(?:(\d+)\s+)?(?:notebook\s+)?([a-zA-Z0-9_-]+)/i,
    );
    if (notebookIncrementMatch && notebookIncrementMatch[2]) {
      const amount = Number(notebookIncrementMatch[1]) || 1;
      const key = notebookIncrementMatch[2].toLowerCase();

      notebookRepository.updateEntry({
        guildId,
        key,
        operation: 'increment',
        value: amount,
        memberId,
      });
      getLogger().info({ guildId, key, amount, memberId }, 'fast notebook increment executed');
      return true;
    }

    // 5. Instant Message Deletion
    if (
      (lowerAction.includes('delete message') || lowerAction.includes('remove message')) &&
      payload.message &&
      typeof payload.message.delete === 'function'
    ) {
      try {
        await payload.message.delete();
        getLogger().info({ guildId, messageId: payload.message.id }, 'fast message delete executed');
        return true;
      } catch (err) {
        getLogger().warn({ err }, 'failed fast message delete');
      }
    }

    // 6. Instant Member Warning
    if (lowerAction.includes('warn user') || lowerAction.includes('warn member')) {
      if (memberId) {
        notebookRepository.updateEntry({
          guildId,
          category: 'moderation',
          key: 'warnings',
          memberId,
          operation: 'increment',
          value: 1,
        });
        getLogger().info({ guildId, memberId }, 'fast member warning recorded');
        return true;
      }
    }

    return false;
  }

  /**
   * Fast-path level-up check: reads current XP from notebook, calculates the expected level
   * using the configured formula (Level n = Level(n-1) + n*100), and if the user crossed a
   * threshold, updates their level and sends a congratulatory channel message autonomously
   * WITHOUT calling the LLM.
   */
  private async tryExecuteLevelCheck(
    payload: EventPayload,
    actionDesc: string,
  ): Promise<void> {
    const guildId = payload.guild.id;
    const memberId = payload.user?.id ?? payload.member?.id ?? null;
    if (!memberId) return;

    const xpEntry = notebookRepository.getEntry({ guildId, key: 'xp', memberId });
    const currentXp = xpEntry ? Number(xpEntry.value) || 0 : 0;

    const levelEntry = notebookRepository.getEntry({ guildId, key: 'level', memberId });
    const currentLevel = levelEntry ? Number(levelEntry.value) || 1 : 1;

    // Compute XP required for next level: threshold(n) = sum(i*100 for i in 1..n) = n*(n+1)/50
    // i.e., Level n requires n*(n+1)*50 total XP
    const xpForLevel = (n: number): number => n * (n + 1) * 50;

    let newLevel = currentLevel;
    // Walk forward until XP no longer meets the next threshold
    while (currentXp >= xpForLevel(newLevel + 1)) {
      newLevel++;
    }

    if (newLevel <= currentLevel) return; // No level-up

    // Update stored level
    notebookRepository.setEntry({ guildId, key: 'level', value: String(newLevel), memberId });
    getLogger().info({ guildId, memberId, oldLevel: currentLevel, newLevel }, 'fast level-up executed');

    // Send congratulatory message to the channel if we have a channel
    const channelId = payload.channelId;
    if (!channelId) return;

    try {
      const guild = payload.guild as unknown as import('discord.js').Guild;
      const channel = guild.channels?.cache?.get(channelId) as
        | { send(opts: unknown): Promise<unknown> }
        | undefined;

      if (channel && 'send' in channel) {
        const member = payload.member as unknown as import('discord.js').GuildMember | null;
        const displayName =
          member?.displayName ?? payload.user?.id ?? 'Member';
        await channel.send({
          embeds: [
            {
              title: '🎉 Level Up!',
              description: `Congrats **${displayName}**! You've reached **Level ${newLevel}**!`,
              color: 0xf1c40f,
              fields: [
                { name: 'Total XP', value: `${currentXp}`, inline: true },
                { name: 'New Level', value: `${newLevel}`, inline: true },
              ],
              timestamp: new Date().toISOString(),
            },
          ],
        });
      }
    } catch (err) {
      getLogger().warn({ err, guildId }, 'failed to send level-up message');
    }
  }


  private async tryExecuteReactionRole(
    trigger: string,
    actionDesc: string,
    payload: EventPayload,
  ): Promise<boolean> {
    const roleMatch = actionDesc.match(/(?:add|give|assign|remove|take)\s+role\s+["']?([^"']+)["']?/i);
    if (!roleMatch || !roleMatch[1]) return false;

    const roleNameOrId = roleMatch[1].trim().toLowerCase();
    const guild = payload.guild as unknown as import('discord.js').Guild;
    const member = payload.member as unknown as import('discord.js').GuildMember;

    if (!guild?.roles?.cache || !member?.roles) return false;

    let role =
      guild.roles.cache.get(roleNameOrId) ??
      guild.roles.cache.find(
        (r) => r.name.toLowerCase() === roleNameOrId || r.name.toLowerCase() === `#${roleNameOrId}`,
      );

    if (!role && 'fetch' in guild.roles) {
      try {
        await (guild.roles as unknown as { fetch: () => Promise<unknown> }).fetch();
        role =
          guild.roles.cache.get(roleNameOrId) ??
          guild.roles.cache.find(
            (r) => r.name.toLowerCase() === roleNameOrId || r.name.toLowerCase() === `#${roleNameOrId}`,
          );
      } catch {
        // ignore fetch error
      }
    }

    if (!role) {
      getLogger().warn({ roleNameOrId, guildId: guild.id }, 'reaction role target role not found');
      return false;
    }

    const isRemove =
      trigger === 'reaction_remove' ||
      actionDesc.toLowerCase().includes('remove') ||
      actionDesc.toLowerCase().includes('take');

    try {
      if (isRemove) {
        await member.roles.remove(role);
        getLogger().info({ roleId: role.id, userId: member.id }, 'removed reaction role from member');
      } else {
        await member.roles.add(role);
        getLogger().info({ roleId: role.id, userId: member.id }, 'added reaction role to member');
      }
      return true;
    } catch (err) {
      getLogger().error({ err, roleId: role.id, userId: member.id }, 'failed to toggle reaction role');
      return false;
    }
  }

  private isDuplicate(
    guildId: string,
    automationId: number,
    trigger: string,
    payload: EventPayload,
  ): boolean {
    const targetId =
      payload.messageId ??
      payload.message?.id ??
      payload.member?.id ??
      payload.channelId ??
      Date.now().toString();
    const userId = payload.user?.id ?? payload.member?.id ?? '';
    const emojiIdent = payload.emoji?.identifier ?? payload.emoji?.name ?? '';
    const key = `${guildId}:${automationId}:${trigger}:${targetId}:${userId}:${emojiIdent}`;
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
    trigger?: string,
  ): boolean {
    if (!conditions || conditions.length === 0) return true;

    for (const condition of conditions) {
      const desc = condition.description?.trim();
      if (!desc) continue;

      if (!this.matchesSingleCondition(desc, payload, trigger)) {
        return false;
      }
    }
    return true;
  }

  private matchesSingleCondition(desc: string, payload: EventPayload, trigger?: string): boolean {
    const lowerDesc = desc.toLowerCase().trim();

    // 1. Bot / Human status check
    const isReactionEvent = trigger ? trigger.startsWith('reaction_') : false;
    const isBotAuthor = isReactionEvent
      ? Boolean(payload.user?.bot || payload.member?.user?.bot)
      : Boolean(payload.message?.author?.bot || payload.member?.user?.bot || payload.user?.bot);

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

    // 2. Channel check
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

    // 3. Message ID check
    const messageIdMatch = lowerDesc.match(/message(?:\s+id)?[:\s]+([0-9]{15,22})/i);
    let msgIdChecked = false;
    if (messageIdMatch && messageIdMatch[1]) {
      msgIdChecked = true;
      const targetMsgId = messageIdMatch[1];
      const currentMsgId = payload.messageId ?? payload.message?.id;
      if (currentMsgId !== targetMsgId) return false;
    }

    // 4. Emoji / Reaction check
    const emojiMatch = lowerDesc.match(/(?:emoji|reaction|react\s+with)\s+[:\s]*([^\s,]+)/i);
    let emojiChecked = false;
    if (emojiMatch && emojiMatch[1]) {
      emojiChecked = true;
      const targetEmoji = emojiMatch[1].trim().toLowerCase();
      const currentEmojiName = payload.emoji?.name?.toLowerCase();
      const currentEmojiId = payload.emoji?.id?.toLowerCase();
      const currentEmojiIdent = payload.emoji?.identifier?.toLowerCase();

      const matchesEmoji =
        currentEmojiName === targetEmoji ||
        currentEmojiId === targetEmoji ||
        currentEmojiIdent === targetEmoji ||
        (currentEmojiName && targetEmoji.includes(currentEmojiName)) ||
        (currentEmojiIdent && targetEmoji.includes(currentEmojiIdent));

      if (!matchesEmoji) return false;
    }

    // 5. Notebook State check (e.g. "notebook xp >= 100" or "coins >= 50")
    const notebookStateMatch = lowerDesc.match(
      /(?:notebook\s+)?([a-zA-Z0-9_-]+)\s*(>=|<=|>|<|==|=)\s*(\d+)/i,
    );
    if (notebookStateMatch && notebookStateMatch[1] && notebookStateMatch[3]) {
      const key = notebookStateMatch[1].toLowerCase();
      const op = notebookStateMatch[2];
      const targetVal = Number(notebookStateMatch[3]);
      const memberId = payload.user?.id ?? payload.member?.id ?? null;

      const entry = notebookRepository.getEntry({
        guildId: payload.guild.id,
        key,
        memberId,
      });

      const currentVal = entry ? Number(entry.value) || 0 : 0;

      if (op === '>=' && !(currentVal >= targetVal)) return false;
      if (op === '<=' && !(currentVal <= targetVal)) return false;
      if (op === '>' && !(currentVal > targetVal)) return false;
      if (op === '<' && !(currentVal < targetVal)) return false;
      if ((op === '==' || op === '=') && !(currentVal === targetVal)) return false;
    }

    // 6. Message Content & Semantic Checks
    if (payload.message && typeof payload.message.content === 'string') {
      const msgContent = payload.message.content.trim();
      const msgLower = msgContent.toLowerCase();

      // Offensive / Toxic Content Detection
      if (
        lowerDesc.includes('is offensive') ||
        lowerDesc.includes('contains offensive') ||
        lowerDesc.includes('is toxic') ||
        lowerDesc.includes('is profanity') ||
        lowerDesc.includes('is inappropriate') ||
        lowerDesc.includes('is bad word')
      ) {
        const isOffensive = DEFAULT_OFFENSIVE_WORDS.some((word) => msgLower.includes(word));
        if (!isOffensive) return false;
        return true;
      }

      // Spam / Link Detection
      if (lowerDesc.includes('is spam') || lowerDesc.includes('is scam')) {
        const isSpam =
          msgLower.includes('free nitro') ||
          msgLower.includes('steamgift') ||
          msgLower.includes('discord.gg/') ||
          /(http|https):\/\/[^\s]+/i.test(msgContent);
        if (!isSpam) return false;
        return true;
      }

      if (lowerDesc.includes('contains link') || lowerDesc.includes('contains invite')) {
        const hasLink = /(http|https):\/\/[^\s]+/i.test(msgContent) || msgLower.includes('discord.gg/');
        if (!hasLink) return false;
        return true;
      }

      // Question detection
      if (lowerDesc.includes('is a question') || lowerDesc.includes('asks a question')) {
        const isQuestion =
          msgContent.endsWith('?') ||
          /^(how|what|why|where|when|who|can|is|are|do|does)\b/i.test(msgContent);
        if (!isQuestion) return false;
        return true;
      }

      // Word list matching (e.g. "contains any of [foo, bar, baz]" or "contains words foo, bar")
      const wordListMatch = desc.match(/(?:contains|includes)\s+(?:any\s+of\s+)?(?:words\s+)?\[?([a-zA-Z0-9_\s,-]+)\]?/i);
      if (wordListMatch && wordListMatch[1]) {
        const words = wordListMatch[1]
          .split(/[\s,]+/)
          .map((w) => w.trim().toLowerCase())
          .filter((w) => w.length > 0 && w !== 'any' && w !== 'of' && w !== 'words');

        if (words.length > 0) {
          const matchedAny = words.some((w) => msgLower.includes(w));
          if (!matchedAny) return false;
          return true;
        }
      }

      // Quoted string matching
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

      // Command tokens starting with !, /, $, ., or ?
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

      // Keyword matches without quotes
      const startsWithMatch = desc.match(/(?:starts\s+with|prefix)\s+([^\s,]+)/i);
      if (startsWithMatch && startsWithMatch[1]) {
        return msgLower.startsWith(startsWithMatch[1].toLowerCase());
      }

      const endsWithMatch = desc.match(/ends\s+with\s+([^\s,]+)/i);
      if (endsWithMatch && endsWithMatch[1]) {
        return msgLower.endsWith(endsWithMatch[1].toLowerCase());
      }

      const equalsMatch = desc.match(/(?:message|content)\s+(?:is|equals)\s+([^\s,]+)/i);
      if (equalsMatch && equalsMatch[1]) {
        return msgLower === equalsMatch[1].toLowerCase();
      }

      const containsMatch = desc.match(/(?:contains|includes)\s+([^\s,]+)/i);
      if (containsMatch && containsMatch[1]) {
        return msgLower.includes(containsMatch[1].toLowerCase());
      }

      const isMetaOnly =
        channelChecked ||
        msgIdChecked ||
        emojiChecked ||
        lowerDesc.includes('bot') ||
        lowerDesc.includes('human') ||
        lowerDesc.includes('channel') ||
        lowerDesc.includes('non-bot');
      if (isMetaOnly) {
        return true;
      }

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