import type { AppConfig } from '../config/env.js';
import type { LLMProvider } from './types.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { GeminiProvider } from './providers/gemini.js';
import { OpenAICompatibleProvider } from './providers/openaiCompatible.js';

/**
 * Maps a provider name plus optional base URL to the right implementation.
 *
 * Default base URLs per provider are handled by each adapter, but users may
 * override LLM_BASE_URL for OpenRouter, self-hosted, or proxy endpoints.
 */
export function createLLMProvider(config: AppConfig): LLMProvider {
  const provider = config.llm.provider.toLowerCase().trim();
  const { apiKey, model, baseUrl } = config.llm;

  switch (provider) {
    case 'anthropic':
    case 'claude':
      return new AnthropicProvider({ apiKey, model, baseUrl: baseUrl || undefined });

    case 'gemini':
    case 'google':
      return new GeminiProvider({ apiKey, model, baseUrl: baseUrl || undefined });

    case 'openai':
      return new OpenAICompatibleProvider({ apiKey, model, baseUrl: baseUrl || undefined });

    case 'openrouter':
      return new OpenAICompatibleProvider({
        apiKey,
        model,
        baseUrl: baseUrl || 'https://openrouter.ai/api/v1',
      });

    case 'deepseek':
      return new OpenAICompatibleProvider({
        apiKey,
        model,
        baseUrl: baseUrl || 'https://api.deepseek.com/v1',
      });

    case 'ollama':
      return new OpenAICompatibleProvider({
        apiKey: apiKey || 'ollama',
        model,
        baseUrl: baseUrl || 'http://localhost:11434/v1',
      });

    case 'custom':
    case 'openai-compatible':
      if (!baseUrl) {
        throw new Error(
          'LLM_BASE_URL is required when LLM_PROVIDER is "custom" or "openai-compatible".',
        );
      }
      return new OpenAICompatibleProvider({ apiKey, model, baseUrl });

    default:
      throw new Error(
        `Unknown LLM_PROVIDER "${provider}". Supported: openai, anthropic, gemini, openrouter, ollama, deepseek, custom.`,
      );
  }
}
