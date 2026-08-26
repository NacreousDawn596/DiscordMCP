import type { Guild, GuildMember, Message } from 'discord.js';
import { automationRepository } from '../database/repositories/automationRepository.js';
import { getLogger } from '../logging/logger.js';

export interface EventPayload {
  guild: Guild;
  member?: GuildMember | null;
  message?: Message | null;
  channelId?: string | null;
  [key: string]: unknown;
}

export type AutomationRunner = (
  guildId: string,
  actionDescription: string,
  channelId: string | null,
) => Promise<void>;

/**
 * Event-driven automation engine. It does NOT invoke the LLM on every event —
 * only when a configured automation's trigger and conditions match.
 */
export class AutomationEngine {
  private runner: AutomationRunner | null = null;

  setRunner(runner: AutomationRunner): void {
    this.runner = runner;
  }

  async handleEvent(trigger: string, payload: EventPayload): Promise<void> {
    if (!this.runner) return;
    const guildId = payload.guild.id;

    const automations = automationRepository.listAutomations(guildId, trigger);
    if (automations.length === 0) return;

    for (const automation of automations) {
      const conditions = parseConditions(automation.conditions);
      if (!matchesConditions(conditions, payload)) continue;

      const action = parseAction(automation.action);
      getLogger().info(
        { guildId, trigger, automationId: automation.id },
        'automation triggered',
      );

      try {
        await this.runner(guildId, action.description, payload.channelId ?? null);
      } catch (err) {
        getLogger().error({ err, guildId, automationId: automation.id }, 'automation failed');
      }
    }
  }
}

interface Condition {
  description: string;
}

function parseConditions(raw: string): Condition[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function parseAction(raw: string): { description: string } {
  try {
    const v = JSON.parse(raw);
    return { description: String(v.description ?? '') };
  } catch {
    return { description: '' };
  }
}

function matchesConditions(conditions: Condition[], payload: EventPayload): boolean {
  for (const c of conditions) {
    const text = c.description.toLowerCase();
    if (text.includes('not a bot') || text.includes('non-bot') || text.includes('human')) {
      if (payload.member?.user.bot) return false;
    }
    if (text.includes('only bots')) {
      if (!payload.member?.user.bot) return false;
    }
  }
  return true;
}

export const automationEngine = new AutomationEngine();
