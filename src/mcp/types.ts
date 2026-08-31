import type { RiskLevel } from '../config/env.js';
import type { Capability, ExecutionContext, ToolResult } from '../discord/types.js';
import type { JsonSchema } from '../llm/types.js';

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  risk: RiskLevel;
  capability?: Capability;
  isModerationAction?: boolean;
  /** Marks the tool as mutating Discord state. */
  mutates: boolean;
  execute(ctx: ExecutionContext, args: Record<string, unknown>): Promise<ToolResult>;
}

export interface ToolExecutionResult {
  success: boolean;
  output: string;
  data?: unknown;
  /** Set when the operation was blocked by a security/authorization gate. */
  blocked?: boolean;
  blockedReason?: string;
  /** Set when the operation requires user confirmation before running. */
  needsConfirmation?: boolean;
  confirmationDetail?: string;
  /** Channel id the tool posted a visible message to (if any). */
  postedChannelId?: string;
  risk: RiskLevel;
  tool: string;
}
