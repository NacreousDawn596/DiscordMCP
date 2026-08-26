import type {
  ChatMessage,
  CompleteOptions,
  LLMProvider,
  LLMResponse,
  ToolCall,
  ToolDefinition,
} from '../types.js';

export interface OpenAICompatibleConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

/**
 * Covers OpenAI, OpenRouter, DeepSeek, Ollama, and any custom
 * OpenAI-compatible endpoint (vLLM, LM Studio, Together, Groq, etc.).
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = 'openai-compatible';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: OpenAICompatibleConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  }

  async complete(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options: CompleteOptions,
  ): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      messages: messages.map(toOpenAIMessage),
    };

    if (tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LLM request failed (${res.status}): ${text.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason?: string;
      }>;
    };

    const choice = data.choices?.[0];
    const message = choice?.message;

    const toolCalls: ToolCall[] = (message?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }));

    return {
      content: message?.content ?? null,
      toolCalls,
      finishReason: choice?.finish_reason ?? 'stop',
    };
  }
}

function toOpenAIMessage(m: ChatMessage): Record<string, unknown> {
  switch (m.role) {
    case 'system':
      return { role: 'system', content: m.content ?? '' };
    case 'user':
      return { role: 'user', content: m.content ?? '' };
    case 'assistant': {
      const out: Record<string, unknown> = { role: 'assistant', content: m.content ?? null };
      if (m.toolCalls && m.toolCalls.length > 0) {
        out.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        }));
      }
      return out;
    }
    case 'tool':
      return { role: 'tool', content: m.content ?? '', tool_call_id: m.toolCallId ?? '' };
  }
}
