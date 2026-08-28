import { automationRepository } from '../database/repositories/automationRepository.js';
import { getLogger } from '../logging/logger.js';

export interface EventPayload {
  guild: { id: string };
  member?: { id?: string; user?: { bot?: boolean } } | null;
  message?: { id?: string; author?: { bot?: boolean } } | null;
  channelId?: string | null;
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

  private matchesConditions(
    conditions: Array<{ description: string }>,
    payload: EventPayload,
  ): boolean {
    for (const condition of conditions) {
      const text = condition.description.toLowerCase();
      if (text.includes('not a bot') || text.includes('non-bot') || text.includes('human')) {
        if (payload.member?.user?.bot) return false;
      }
      if (text.includes('only bots')) {
        if (!payload.member?.user?.bot) return false;
      }
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