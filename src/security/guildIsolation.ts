import { CROSS_GUILD_OPERATION } from './boundaries.js';
import type { ExecutionContext } from '../discord/types.js';

export class CrossGuildViolation extends Error {
  override readonly name = 'CrossGuildViolation';
  constructor(message: string) {
    super(message);
  }
}

/**
 * Guarantees a target guild id (if supplied by the LLM) matches the current
 * execution guild. Any mismatch is blocked, not just warned about.
 */
export function assertSameGuild(
  requestedGuildId: string | null | undefined,
  executionGuildId: string,
): void {
  if (requestedGuildId && requestedGuildId !== executionGuildId) {
    throw new CrossGuildViolation(
      `Cross-guild operation blocked (${CROSS_GUILD_OPERATION}): requested guild ${requestedGuildId} != execution guild ${executionGuildId}.`,
    );
  }
}

const GUILD_KEY_PATTERN = /(guild|server)/i;

/**
 * Recursively extracts any guild/server selector present anywhere in tool
 * arguments (including nested objects and arrays) so the executor can validate
 * it before running. The LLM must never be able to redirect an operation to
 * another guild — regardless of how the argument is shaped or nested.
 */
export function extractRequestedGuild(args: unknown): string | null {
  const queue: unknown[] = [args];
  while (queue.length > 0) {
    const current = queue.pop();
    if (!current || typeof current !== 'object') continue;

    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }

    for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
      if (GUILD_KEY_PATTERN.test(key) && typeof value === 'string' && value.length > 0) {
        return value;
      }
      if (value && typeof value === 'object') queue.push(value);
    }
  }
  return null;
}

/**
 * Hard invariant: the execution context must be internally consistent with a
 * single guild. Any mismatch between the declared guild id, the live Guild
 * object, and the invoking member's guild is a cross-guild violation.
 *
 * Users of one guild can NEVER interact with another guild, under any
 * condition.
 */
export function assertGuildBoundary(ctx: ExecutionContext): void {
  if (ctx.guild.id !== ctx.guildId) {
    throw new CrossGuildViolation(
      `Context guild mismatch (${CROSS_GUILD_OPERATION}): object ${ctx.guild.id} != declared ${ctx.guildId}.`,
    );
  }
  if (ctx.member && ctx.member.guild.id !== ctx.guildId) {
    throw new CrossGuildViolation(
      `Member guild mismatch (${CROSS_GUILD_OPERATION}): member ${ctx.member.guild.id} != execution guild ${ctx.guildId}.`,
    );
  }
}
