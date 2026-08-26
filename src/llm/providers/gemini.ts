import type {
  ChatMessage,
  CompleteOptions,
  LLMProvider,
  LLMResponse,
  ToolCall,
  ToolDefinition,
} from '../types.js';

export interface GeminiConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: GeminiConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = (config.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
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
      contents: messages.filter((m) => m.role !== 'system').map(toGeminiContent),
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
      },
    };

    if (system) {
      body.systemInstruction = { parts: [{ text: system }] };
    }

    if (tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: tools.map((t) => ({
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters,
          })),
        },
      ];
    }

    const url = `${this.baseUrl}/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LLM request failed (${res.status}): ${text.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            thoughtSignature?: string;
            functionCall?: { name: string; args: unknown; id?: string };
          }>;
        };
        finishReason?: string;
      }>;
    };

    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    const text = parts
      .filter((p) => typeof p.text === 'string')
      .map((p) => p.text)
      .join('');

    const toolCalls: ToolCall[] = parts
      .filter((p) => p.functionCall)
      .map((p, i) => ({
        id: p.functionCall!.id ?? `gemini_${i}_${Math.random().toString(36).slice(2)}`,
        name: p.functionCall!.name,
        arguments: JSON.stringify(p.functionCall!.args ?? {}),
        thoughtSignature: p.thoughtSignature,
      }));

    return {
      content: text || null,
      toolCalls,
      finishReason: candidate?.finishReason ?? 'STOP',
    };
  }
}

function toGeminiContent(m: ChatMessage): Record<string, unknown> {
  switch (m.role) {
    case 'user':
      return { role: 'user', parts: [{ text: m.content ?? '' }] };
    case 'assistant': {
      const parts: Array<Record<string, unknown>> = [];
      if (m.content) parts.push({ text: m.content });
      if (m.toolCalls) {
        for (const tc of m.toolCalls) {
          const part: Record<string, unknown> = {
            functionCall: { name: tc.name, args: safeParse(tc.arguments) },
          };
          if (tc.id) (part.functionCall as Record<string, unknown>).id = tc.id;
          if (tc.thoughtSignature) part.thoughtSignature = tc.thoughtSignature;
          parts.push(part);
        }
      }
      return { role: 'model', parts: parts.length ? parts : [{ text: '' }] };
    }
    case 'tool': {
      const part: Record<string, unknown> = {
        functionResponse: {
          name: m.name ?? '',
          response: { result: safeParse(m.content ?? '') },
        },
      };
      if (m.toolCallId) (part.functionResponse as Record<string, unknown>).id = m.toolCallId;
      return { role: 'user', parts: [part] };
    }
    case 'system':
      return { role: 'user', parts: [{ text: m.content ?? '' }] };
  }
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}
