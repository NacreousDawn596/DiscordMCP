import type { AppConfig } from '../../config/env.js';
import type { GuildConfig } from '../../database/repositories/guildRepository.js';
import { runRepository } from '../../database/repositories/runRepository.js';
import type { ExecutionContext } from '../../discord/types.js';
import type { ChatMessage, LLMProvider, ToolCall, ToolDefinition } from '../../llm/types.js';
import type { ToolExecutor } from '../../mcp/executor.js';
import { allTools, descriptorsToLLMTools, toLLMTools } from '../../mcp/registry.js';
import { getLogger } from '../../logging/logger.js';
import type { MemoryManager } from '../memory/memoryManager.js';
import { buildMemoryBlock, buildSystemPrompt, buildUntrustedContextBlock } from './prompts.js';

export type RuntimeMode = 'normal' | 'planning' | 'admin' | 'moderation' | 'analysis';

export interface RuntimeDeps {
  config: AppConfig;
  llm: LLMProvider;
  executor: ToolExecutor;
  getGuildConfig: (guildId: string) => GuildConfig;
  memory: MemoryManager;
}

export interface RunOutcome {
  response: string;
  success: boolean;
  needsConfirmation: boolean;
  pendingActions: string[];
  runId: string;
}

interface PendingEntry {
  ctx: ExecutionContext;
  messages: ChatMessage[];
  pending: ToolCall[];
  mode: RuntimeMode;
  createdAt: number;
}

const PENDING_TTL_MS = 10 * 60 * 1000;

export class AgentRuntime {
  private readonly pending = new Map<string, PendingEntry>();

  constructor(private readonly deps: RuntimeDeps) {}

  async run(ctx: ExecutionContext, requestText: string, mode: RuntimeMode): Promise<RunOutcome> {
    const { config } = this.deps;
    const guildConfig = this.deps.getGuildConfig(ctx.guildId);

    const system = buildSystemPrompt(ctx, config, guildConfig, mode);
    const memory = this.deps.memory.loadContext(ctx.guildId, ctx.channelId, ctx.userId);
    const recent = await this.loadRecent(ctx);

    const userMessage = [
      buildMemoryBlock(memory),
      buildUntrustedContextBlock(recent),
      '',
      'Request:',
      requestText,
    ]
      .filter(Boolean)
      .join('\n');

    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: userMessage },
    ];

    const runId = runRepository.createRun({
      guildId: ctx.guildId,
      userId: ctx.userId,
      channelId: ctx.channelId,
      request: requestText,
      mode,
    }).id;

    return this.loop(ctx, messages, mode, runId, Date.now());
  }

  async resume(
    ctx: ExecutionContext,
    runId: string,
    approved: boolean,
  ): Promise<RunOutcome> {
    const entry = this.pending.get(runId);
    if (!entry || entry.ctx.guildId !== ctx.guildId) {
      return {
        response: 'No pending confirmation to resume (it may have expired).',
        success: false,
        needsConfirmation: false,
        pendingActions: [],
        runId,
      };
    }
    this.pending.delete(runId);

    if (!approved) {
      runRepository.finalizeRun(runId, {
        result: 'Cancelled by user.',
        success: false,
        durationMs: Date.now() - entry.createdAt,
      });
      return {
        response: 'Cancelled. Nothing was changed.',
        success: true,
        needsConfirmation: false,
        pendingActions: [],
        runId,
      };
    }

    for (const tc of entry.pending) {
      const args = safeParseArgs(tc.arguments);
      const result = await this.deps.executor(entry.ctx, tc.name, args, {
        mode: this.execMode(entry.mode),
        runId,
        preApproved: true,
      });
      entry.messages.push({
        role: 'tool',
        content: result.output,
        toolCallId: tc.id,
        name: tc.name,
      });
    }

    return this.loop(entry.ctx, entry.messages, entry.mode, runId, Date.now());
  }

  hasPending(runId: string): boolean {
    const entry = this.pending.get(runId);
    if (!entry) return false;
    if (Date.now() - entry.createdAt > PENDING_TTL_MS) {
      this.pending.delete(runId);
      return false;
    }
    return true;
  }

  private async loop(
    ctx: ExecutionContext,
    messages: ChatMessage[],
    mode: RuntimeMode,
    runId: string,
    startedAt: number,
  ): Promise<RunOutcome> {
    const { config, llm } = this.deps;
    const tools = this.selectTools(mode);
    const toolsUsed: string[] = [];
    const actions: Array<Record<string, unknown>> = [];

    for (let i = 0; i < config.agent.maxIterations; i++) {
      const resp = await llm.complete(messages, tools, {
        temperature: config.llm.temperature,
        maxTokens: config.llm.maxTokens,
      });

      if (resp.toolCalls.length === 0) {
        const content = resp.content && resp.content.trim() ? resp.content : 'Done.';
        this.finalize(runId, content, true, startedAt, messages, toolsUsed, actions);
        return {
          response: content,
          success: true,
          needsConfirmation: false,
          pendingActions: [],
          runId,
        };
      }

      messages.push({
        role: 'assistant',
        content: resp.content,
        toolCalls: resp.toolCalls,
      });

      let confirmationIndex = -1;
      for (let j = 0; j < resp.toolCalls.length; j++) {
        const tc = resp.toolCalls[j]!;
        toolsUsed.push(tc.name);
        const args = safeParseArgs(tc.arguments);
        const result = await this.deps.executor(ctx, tc.name, args, {
          mode: this.execMode(mode),
          runId,
        });
        actions.push({ tool: tc.name, risk: result.risk, success: result.success });

        if (result.needsConfirmation) {
          confirmationIndex = j;
          break;
        }

        messages.push({
          role: 'tool',
          content: result.output,
          toolCallId: tc.id,
          name: tc.name,
        });
      }

      if (confirmationIndex >= 0) {
        const pending = resp.toolCalls.slice(confirmationIndex);
        const pendingActions = pending.map((t) => describeTool(t));
        this.pending.set(runId, {
          ctx,
          messages,
          pending,
          mode,
          createdAt: Date.now(),
        });
        const prompt = [
          'I would like to do the following (confirmation required):',
          '',
          ...pendingActions.map((a) => `• ${a}`),
          '',
          'Reply **yes** to proceed, or **no** to cancel.',
        ].join('\n');
        return {
          response: prompt,
          success: true,
          needsConfirmation: true,
          pendingActions,
          runId,
        };
      }
    }

    const content =
      'I ran out of steps before completing the request. No further changes were made automatically.';
    this.finalize(runId, content, false, startedAt, messages, toolsUsed, actions);
    return {
      response: content,
      success: false,
      needsConfirmation: false,
      pendingActions: [],
      runId,
    };
  }

  private finalize(
    runId: string,
    result: string,
    success: boolean,
    startedAt: number,
    messages: ChatMessage[],
    toolsUsed: string[],
    actions: Array<Record<string, unknown>>,
  ): void {
    runRepository.finalizeRun(runId, {
      result,
      success,
      durationMs: Date.now() - startedAt,
      plan: JSON.stringify({ goal: '', steps: actions }),
      toolsUsed: [...new Set(toolsUsed)],
      actions,
    });
  }

  private execMode(mode: RuntimeMode): 'execute' | 'plan' {
    return mode === 'planning' ? 'plan' : 'execute';
  }

  private selectTools(mode: RuntimeMode): ToolDefinition[] {
    if (mode === 'analysis') {
      return descriptorsToLLMTools(allTools().filter((t) => !t.mutates));
    }
    return toLLMTools();
  }

  private async loadRecent(
    ctx: ExecutionContext,
  ): Promise<Array<{ author: string; content: string; createdAt: Date }>> {
    const channel = ctx.message?.channel ?? ctx.channel;
    if (!channel || !('messages' in channel)) return [];
    const limit = this.deps.config.limits.contextHistoryLimit;
    try {
      const msgs = await (channel as unknown as {
        messages: { fetch: (opts: { limit: number }) => Promise<Map<string, { author: { tag: string }; content: string; createdAt: Date }>> };
      }).messages.fetch({ limit });
      return [...msgs.values()]
        .reverse()
        .filter((m) => m.content && m.content.trim().length > 0)
        .map((m) => ({
          author: m.author.tag,
          content: m.content,
          createdAt: m.createdAt,
        }));
    } catch (err) {
      getLogger().debug({ err }, 'failed to load recent messages');
      return [];
    }
  }
}

function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function describeTool(tc: ToolCall): string {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(tc.arguments);
  } catch {
    /* ignore */
  }
  const detail = Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      return `${k}=${s.length > 50 ? s.slice(0, 50) + '…' : s}`;
    })
    .join(' ');
  return `${tc.name}${detail ? ` — ${detail}` : ''}`;
}
