import { randomUUID } from 'node:crypto';
import { getDatabase } from '../index.js';

export interface AgentRunInput {
  guildId: string;
  userId: string | null;
  channelId: string | null;
  request: string;
  mode: string;
}

export interface AgentRun extends AgentRunInput {
  id: string;
  plan: string | null;
  toolsUsed: string[];
  actions: string;
  result: string | null;
  durationMs: number | null;
  success: boolean;
  createdAt: number;
}

export interface AgentActionInput {
  runId: string | null;
  guildId: string;
  tool: string;
  inputSummary: string;
  target: string;
  permissionCheck: string;
  risk: string;
  result: string;
  success: boolean;
}

export const runRepository = {
  createRun(input: AgentRunInput): AgentRun {
    const id = randomUUID();
    getDatabase()
      .prepare(
        `INSERT INTO agent_runs (id, guild_id, user_id, channel_id, request, mode, plan, tools_used, actions, result, duration_ms, success, created_at)
         VALUES (@id, @guildId, @userId, @channelId, @request, @mode, NULL, '[]', '[]', NULL, NULL, 0, @now)`,
      )
      .run({ ...input, id, now: Date.now() });

    return {
      ...input,
      id,
      plan: null,
      toolsUsed: [],
      actions: '[]',
      result: null,
      durationMs: null,
      success: false,
      createdAt: Date.now(),
    };
  },

  finalizeRun(
    id: string,
    data: {
      result: string;
      success: boolean;
      durationMs: number;
      plan?: string;
      toolsUsed?: string[];
      actions?: unknown[];
    },
  ): void {
    getDatabase()
      .prepare(
        `UPDATE agent_runs SET
           result = @result,
           success = @success,
           duration_ms = @durationMs,
           plan = @plan,
           tools_used = @toolsUsed,
           actions = @actions
         WHERE id = @id`,
      )
      .run({
        id,
        result: data.result,
        success: data.success ? 1 : 0,
        durationMs: data.durationMs,
        plan: data.plan ?? null,
        toolsUsed: JSON.stringify(data.toolsUsed ?? []),
        actions: JSON.stringify(data.actions ?? []),
      });
  },

  recordAction(input: AgentActionInput): void {
    getDatabase()
      .prepare(
        `INSERT INTO agent_actions (run_id, guild_id, tool, input_summary, target, permission_check, risk, result, success, timestamp)
         VALUES (@runId, @guildId, @tool, @inputSummary, @target, @permissionCheck, @risk, @result, @success, @now)`,
      )
      .run({ ...input, success: input.success ? 1 : 0, now: Date.now() });
  },

  listRecentRuns(guildId: string, limit = 25): AgentRun[] {
    const rows = getDatabase()
      .prepare(
        'SELECT * FROM agent_runs WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?',
      )
      .all(guildId, limit) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: r.id as string,
      guildId: r.guild_id as string,
      userId: r.user_id as string | null,
      channelId: r.channel_id as string | null,
      request: r.request as string,
      mode: r.mode as string,
      plan: r.plan as string | null,
      toolsUsed: JSON.parse((r.tools_used as string) || '[]') as string[],
      actions: r.actions as string,
      result: r.result as string | null,
      durationMs: r.duration_ms as number | null,
      success: (r.success as number) === 1,
      createdAt: r.created_at as number,
    }));
  },

  listRecentActions(guildId: string, limit = 100): Array<Record<string, unknown>> {
    return getDatabase()
      .prepare(
        'SELECT * FROM agent_actions WHERE guild_id = ? ORDER BY timestamp DESC LIMIT ?',
      )
      .all(guildId, limit) as Array<Record<string, unknown>>;
  },
};
