import type { AppConfig } from '../config/env.js';
import { auditRepository } from '../database/repositories/auditRepository.js';
import type { GuildConfig } from '../database/repositories/guildRepository.js';
import { runRepository } from '../database/repositories/runRepository.js';
import type { ExecutionContext } from '../discord/types.js';
import {
  botHasCapability,
  userHasEffectiveCapability,
} from '../discord/permissions/capability.js';
import { authorize } from '../agent/policies/authorization.js';
import { requiresConfirmation } from '../agent/policies/risk.js';
import { assertSameGuild, assertGuildBoundary, extractRequestedGuild } from '../security/guildIsolation.js';
import { getLogger } from '../logging/logger.js';
import { resolveTool } from './registry.js';
import type { ToolExecutionResult } from './types.js';
import { validateAgainstSchema } from './validation.js';

export interface ExecutorDeps {
  config: AppConfig;
  getGuildConfig: (guildId: string) => GuildConfig;
}

export interface ExecuteOptions {
  mode: 'execute' | 'plan';
  preApproved?: boolean;
  runId?: string | null;
}

export type ToolExecutor = (
  ctx: ExecutionContext,
  name: string,
  args: Record<string, unknown>,
  options?: ExecuteOptions,
) => Promise<ToolExecutionResult>;

export function createExecutor(deps: ExecutorDeps): ToolExecutor {
  return async function execute(ctx, name, args, options = { mode: 'execute' }) {
    const { config } = deps;
    const tool = resolveTool(name);

    if (!tool) {
      return {
        success: false,
        output: `Unknown tool: ${name}`,
        blocked: true,
        blockedReason: 'unknown-tool',
        risk: 'READ',
        tool: name,
      };
    }

    const safeArgs = args ?? {};

    // 0. Guild boundary invariant — the context itself must be single-guild.
    //    Users of one guild can never interact with another guild, under any
    //    condition. This runs before any other logic.
    try {
      assertGuildBoundary(ctx);
    } catch (err) {
      return {
        success: false,
        output: (err as Error).message,
        blocked: true,
        blockedReason: 'cross-guild',
        risk: tool.risk,
        tool: name,
      };
    }

    // 1. Guild isolation — a requested guild that differs from the execution
    //    guild is blocked before anything else runs.
    try {
      assertSameGuild(extractRequestedGuild(safeArgs), ctx.guildId);
    } catch (err) {
      const output = (err as Error).message;
      record(deps, ctx, name, safeArgs, tool.risk, output, false, options.runId);
      audit(deps, ctx, name, safeArgs, false);
      return {
        success: false,
        output,
        blocked: true,
        blockedReason: 'cross-guild',
        risk: tool.risk,
        tool: name,
      };
    }

    // 2. Argument validation.
    const validation = validateAgainstSchema(tool.inputSchema, safeArgs);
    if (!validation.ok) {
      const output = `Invalid arguments for ${name}: ${validation.errors.join('; ')}`;
      record(deps, ctx, name, safeArgs, tool.risk, output, false, options.runId);
      return { success: false, output, risk: tool.risk, tool: name };
    }

    // 3. Authorization (Discord permission AND capability AND user auth AND safety).
    const guildConfig = deps.getGuildConfig(ctx.guildId);
    const botMember = ctx.guild.members.me ?? null;
    const userMember = ctx.member;

    const capability = tool.capability ?? 'READ_MESSAGES';
    const capabilityEnabled =
      guildConfig.enabledCapabilities.length === 0 ||
      guildConfig.enabledCapabilities.includes(capability);

    const authResult = authorize({
      userId: ctx.userId,
      guildOwnerId: ctx.guild.ownerId ?? null,
      userIsAdmin: userMember?.permissions.has('Administrator') ?? false,
      userHasDiscordPermission: userHasEffectiveCapability(
        userMember,
        capability,
        ctx.channel,
      ),
      userRoleIds: userMember ? [...userMember.roles.cache.keys()] : [],
      botHasDiscordPermission: tool.capability
        ? botHasCapability(botMember, tool.capability)
        : true,
      capabilityEnabled,
      globalTrusted: config.trust.allowedUserIds.includes(ctx.userId),
      blockedChannel: guildConfig.blockedChannels.includes(ctx.channelId ?? ''),
      blockedByRole: userMember
        ? [...userMember.roles.cache.keys()].some((id) =>
            guildConfig.blockedRoles.includes(id),
          )
        : false,
      moderationAllowed: config.features.moderation || guildConfig.moderationEnabled,
      isModerationAction: tool.isModerationAction ?? false,
      capability,
      allowedRoles: guildConfig.allowedRoles,
    });

    if (!authResult.allowed) {
      const output = `Blocked: ${authResult.reason}`;
      record(deps, ctx, name, safeArgs, tool.risk, output, false, options.runId);
      return {
        success: false,
        output,
        blocked: true,
        blockedReason: 'authorization',
        risk: tool.risk,
        tool: name,
      };
    }

    // 4. Planning mode — mutations are recorded but not executed.
    if (options.mode === 'plan' && tool.mutates) {
      const output = `[planned] ${describeAction(name, safeArgs)}`;
      record(deps, ctx, name, safeArgs, tool.risk, output, true, options.runId);
      return {
        success: true,
        output,
        data: { planned: true, action: name, args: safeArgs },
        risk: tool.risk,
        tool: name,
      };
    }

    // 5. Confirmation policy.
    if (options.mode === 'execute' && !options.preApproved) {
      if (requiresConfirmation(tool.risk, guildConfig.confirmationLevel)) {
        return {
          success: false,
          output: `Confirmation required for ${name}.`,
          needsConfirmation: true,
          confirmationDetail: describeAction(name, safeArgs),
          risk: tool.risk,
          tool: name,
        };
      }
    }

    // 6. Execute.
    try {
      const result = await tool.execute(ctx, safeArgs);
      record(deps, ctx, name, safeArgs, tool.risk, result.output, result.success, options.runId);
      if (tool.mutates) {
        audit(deps, ctx, name, safeArgs, result.success);
      }
      return { ...result, risk: tool.risk, tool: name };
    } catch (err) {
      const output = `Tool ${name} failed: ${(err as Error).message}`;
      record(deps, ctx, name, safeArgs, tool.risk, output, false, options.runId);
      getLogger().error({ err, tool: name, guildId: ctx.guildId }, 'tool execution error');
      return { success: false, output, risk: tool.risk, tool: name };
    }
  };
}

function describeAction(name: string, args: Record<string, unknown>): string {
  const summary = Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      const str = typeof v === 'string' ? v : JSON.stringify(v);
      return `${k}=${str.length > 60 ? str.slice(0, 60) + '…' : str}`;
    })
    .join(' ');
  return `${name}${summary ? ` ${summary}` : ''}`;
}

function record(
  deps: ExecutorDeps,
  ctx: ExecutionContext,
  name: string,
  args: Record<string, unknown>,
  risk: string,
  result: string,
  success: boolean,
  runId: string | null | undefined,
): void {
  runRepository.recordAction({
    runId: runId ?? null,
    guildId: ctx.guildId,
    tool: name,
    inputSummary: JSON.stringify(args).slice(0, 500),
    target: targetSummary(args),
    permissionCheck: 'enforced',
    risk,
    result: result.slice(0, 500),
    success,
  });
}

function audit(
  deps: ExecutorDeps,
  ctx: ExecutionContext,
  name: string,
  args: Record<string, unknown>,
  success: boolean,
): void {
  auditRepository.record({
    guildId: ctx.guildId,
    userId: ctx.userId,
    action: name,
    target: targetSummary(args),
    detail: success ? 'ok' : 'failed',
  });
}

function targetSummary(args: Record<string, unknown>): string {
  const name = args.name ?? args.channel_id ?? args.role_id ?? args.user_id ?? args.target ?? '';
  return String(name).slice(0, 200);
}
