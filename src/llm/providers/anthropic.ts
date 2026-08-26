import type {
  ChatMessage,
  CompleteOptions,
  LLMProvider,
  LLMResponse,
  ToolCall,
  ToolDefinition,
} from '../types.js';

export interface AnthropicConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: AnthropicConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = (config.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
  }

  async complete(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options: CompleteOptions,
  ): Promise<LLMResponse> {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content ?? '')
      .join('\n\n');

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      system: system || undefined,
      messages: messages.filter((m) => m.role !== 'system').map(toAnthropicMessage),
    };

    if (tools.length > 0) {
      body.tools = tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LLM request failed (${res.status}): ${text.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      content?: Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: unknown;
      }>;
      stop_reason?: string;
    };

    const content = data.content ?? [];
    const text = content
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('');

    const toolCalls: ToolCall[] = content
      .filter((c) => c.type === 'tool_use')
      .map((c) => ({
        id: c.id ?? `tool_${Math.random().toString(36).slice(2)}`,
        name: c.name ?? '',
        arguments: JSON.stringify(c.input ?? {}),
      }));

    return {
      content: text || null,
      toolCalls,
      finishReason: data.stop_reason ?? 'stop',
    };
  }
}

function toAnthropicMessage(m: ChatMessage): Record<string, unknown> {
  switch (m.role) {
    case 'user':
      return { role: 'user', content: m.content ?? '' };
    case 'assistant': {
      const out: Record<string, unknown> = { role: 'assistant', content: m.content ?? '' };
      if (m.toolCalls && m.toolCalls.length > 0) {
        out.content = m.toolCalls.map((tc) => ({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: safeParse(tc.arguments),
        }));
      }
      return out;
    }
    case 'tool': {
      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: m.toolCallId ?? '',
            content: m.content ?? '',
          },
        ],
      };
    }
    case 'system':
      return { role: 'user', content: m.content ?? '' };
  }
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}
