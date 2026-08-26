import type {
  ChatMessage,
  LLMProvider,
  LLMResponse,
  ToolDefinition,
  CompleteOptions,
} from '../../src/llm/types.js';

/**
 * Deterministic mock LLM that pops responses from a queue. Records every
 * request for assertions.
 */
export class MockLLM implements LLMProvider {
  readonly name = 'mock';
  readonly requests: ChatMessage[][] = [];
  private queue: LLMResponse[];

  constructor(responses: LLMResponse[]) {
    this.queue = [...responses];
  }

  async complete(
    messages: ChatMessage[],
    _tools: ToolDefinition[],
    _options: CompleteOptions,
  ): Promise<LLMResponse> {
    this.requests.push(messages);
    return this.queue.shift() ?? { content: 'Done.', toolCalls: [], finishReason: 'stop' };
  }
}

export function toolResponse(name: string, args: Record<string, unknown>): LLMResponse {
  return {
    content: null,
    toolCalls: [{ id: `tc_${Math.random().toString(36).slice(2)}`, name, arguments: JSON.stringify(args) }],
    finishReason: 'tool_calls',
  };
}

export function textResponse(content: string): LLMResponse {
  return { content, toolCalls: [], finishReason: 'stop' };
}
