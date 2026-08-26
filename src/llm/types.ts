export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
  /** Gemini thought-signature that must be echoed back with the function call. */
  thoughtSignature?: string;
}

export interface ChatMessage {
  role: ChatRole;
  content: string | null;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export type JsonSchema = Record<string, unknown>;

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
  };
}

export interface LLMResponse {
  content: string | null;
  toolCalls: ToolCall[];
  finishReason: string;
}

export interface CompleteOptions {
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
}

export interface LLMProvider {
  readonly name: string;
  complete(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options: CompleteOptions,
  ): Promise<LLMResponse>;
}

export function assistantToolMessage(toolCall: ToolCall, result: string): ChatMessage {
  return { role: 'tool', content: result, toolCallId: toolCall.id };
}
