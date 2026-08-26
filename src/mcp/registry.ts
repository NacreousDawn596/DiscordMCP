import type { ToolDefinition } from '../llm/types.js';
import type { ToolDescriptor } from './types.js';

const tools = new Map<string, ToolDescriptor>();
/** Maps LLM-safe names (dots replaced with underscores) back to canonical names. */
const byLLMName = new Map<string, string>();

/**
 * Many providers (OpenAI, DeepSeek, OpenRouter, Anthropic, Gemini) reject `.`
 * in function/tool names. Canonical names keep the `discord.namespace.action`
 * form for humans, but the names sent to the LLM replace dots with underscores.
 */
export function toLLMSafeName(name: string): string {
  return name.replace(/\./g, '_');
}

export function registerTool(tool: ToolDescriptor): void {
  if (tools.has(tool.name)) {
    throw new Error(`Tool already registered: ${tool.name}`);
  }
  tools.set(tool.name, tool);
  byLLMName.set(toLLMSafeName(tool.name), tool.name);
}

export function getTool(name: string): ToolDescriptor | undefined {
  return tools.get(name);
}

/** Resolves a tool by canonical name OR by its LLM-safe name. */
export function resolveTool(name: string): ToolDescriptor | undefined {
  return tools.get(name) ?? (byLLMName.has(name) ? tools.get(byLLMName.get(name)!) : undefined);
}

export function allTools(): ToolDescriptor[] {
  return [...tools.values()];
}

export function toolNames(): string[] {
  return [...tools.keys()].sort();
}

export function descriptorsToLLMTools(list: ToolDescriptor[]): ToolDefinition[] {
  return list.map((t) => ({
    type: 'function',
    function: {
      name: toLLMSafeName(t.name),
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

/** Converts the registry into LLM-facing tool definitions (OpenAI format). */
export function toLLMTools(): ToolDefinition[] {
  return descriptorsToLLMTools(allTools());
}

/** Filters tools down to a capability set (e.g. read-only for planning mode). */
export function toolsMatching(predicate: (t: ToolDescriptor) => boolean): ToolDescriptor[] {
  return allTools().filter(predicate);
}
