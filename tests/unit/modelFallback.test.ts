import { describe, it, expect } from 'vitest';
import { ModelFallbackProvider } from '../../src/llm/providers/modelFallback.js';
import type {
  ChatMessage,
  CompleteOptions,
  LLMProvider,
  LLMResponse,
  ToolDefinition,
} from '../../src/llm/types.js';

const messages: ChatMessage[] = [];
const tools: ToolDefinition[] = [];
const options: CompleteOptions = { temperature: 0, maxTokens: 10 };

function ok(content: string): LLMResponse {
  return { content, toolCalls: [], finishReason: 'stop' };
}

function fake(behavior: (model: string) => LLMResponse | never): (model: string) => LLMProvider {
  return (model) => ({
    name: 'fake',
    complete: async () => behavior(model),
  });
}

describe('ModelFallbackProvider', () => {
  it('returns the first model result without trying others', async () => {
    const calls: string[] = [];
    const provider = new ModelFallbackProvider(
      ['a', 'b', 'c'],
      fake((m) => {
        calls.push(m);
        return ok(`from-${m}`);
      }),
    );

    const result = await provider.complete(messages, tools, options);
    expect(result.content).toBe('from-a');
    expect(calls).toEqual(['a']);
  });

  it('falls back to the next model on failure', async () => {
    const calls: string[] = [];
    const provider = new ModelFallbackProvider(
      ['a', 'b', 'c'],
      fake((m) => {
        calls.push(m);
        if (m === 'a') throw new Error('quota exceeded');
        return ok(`from-${m}`);
      }),
    );

    const result = await provider.complete(messages, tools, options);
    expect(result.content).toBe('from-b');
    expect(calls).toEqual(['a', 'b']);
  });

  it('skips multiple failing models in order', async () => {
    const calls: string[] = [];
    const provider = new ModelFallbackProvider(
      ['a', 'b', 'c'],
      fake((m) => {
        calls.push(m);
        if (m === 'a' || m === 'b') throw new Error('down');
        return ok(`from-${m}`);
      }),
    );

    const result = await provider.complete(messages, tools, options);
    expect(result.content).toBe('from-c');
    expect(calls).toEqual(['a', 'b', 'c']);
  });

  it('throws when every model fails', async () => {
    const provider = new ModelFallbackProvider(
      ['a', 'b'],
      fake(() => {
        throw new Error('all down');
      }),
    );
    await expect(provider.complete(messages, tools, options)).rejects.toThrow('all down');
  });

  it('starts from the first model on every new request', async () => {
    const calls: string[] = [];
    const provider = new ModelFallbackProvider(
      ['a', 'b'],
      fake((m) => {
        calls.push(m);
        throw new Error('down');
      }),
    );

    await expect(provider.complete(messages, tools, options)).rejects.toThrow();
    await expect(provider.complete(messages, tools, options)).rejects.toThrow();

    // Both requests attempted 'a' first, then 'b'.
    expect(calls).toEqual(['a', 'b', 'a', 'b']);
  });
});
