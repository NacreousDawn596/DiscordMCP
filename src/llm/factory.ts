import type { AppConfig } from '../config/env.js';
import type { LLMProvider } from './types.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { GeminiProvider } from './providers/gemini.js';
import { OpenAICompatibleProvider } from './providers/openaiCompatible.js';
import { ModelFallbackProvider } from './providers/modelFallback.js';

interface Resolved {
  name: string;
  baseUrl: string;
}

/**
 * Maps a provider name plus optional base URL to the right implementation.
 *
 * Default base URLs per provider are handled by each adapter, but users may
 * override LLM_BASE_URL for OpenRouter, self-hosted, or proxy endpoints.
 */
function resolveProvider(config: AppConfig): Resolved {
  const provider = config.llm.provider.toLowerCase().trim();
  const { baseUrl } = config.llm;

  switch (provider) {
    case 'anthropic':
    case 'claude':
      return { name: 'anthropic', baseUrl: baseUrl || 'https://api.anthropic.com' };

    case 'gemini':
    case 'google':
      return {
        name: 'gemini',
        baseUrl: baseUrl || 'https://generativelanguage.googleapis.com',
      };

    case 'openai':
      return { name: 'openai', baseUrl: baseUrl || 'https://api.openai.com/v1' };

    case 'openrouter':
      return {
        name: 'openai-compatible',
        baseUrl: baseUrl || 'https://openrouter.ai/api/v1',
      };

    case 'deepseek':
      return {
        name: 'openai-compatible',
        baseUrl: baseUrl || 'https://api.deepseek.com/v1',
      };

    case 'ollama':
      return {
        name: 'openai-compatible',
        baseUrl: baseUrl || 'http://localhost:11434/v1',
      };

    case 'custom':
    case 'openai-compatible':
      if (!baseUrl) {
        throw new Error(
          'LLM_BASE_URL is required when LLM_PROVIDER is "custom" or "openai-compatible".',
        );
      }
      return { name: 'openai-compatible', baseUrl };

    default:
      throw new Error(
        `Unknown LLM_PROVIDER "${provider}". Supported: openai, anthropic, gemini, openrouter, ollama, deepseek, custom.`,
      );
  }
}

function makeProvider(resolved: Resolved, apiKey: string, model: string): LLMProvider {
  switch (resolved.name) {
    case 'anthropic':
      return new AnthropicProvider({ apiKey, model, baseUrl: resolved.baseUrl });
    case 'gemini':
      return new GeminiProvider({ apiKey, model, baseUrl: resolved.baseUrl });
    case 'openai-compatible':
    default:
      return new OpenAICompatibleProvider({ apiKey, model, baseUrl: resolved.baseUrl });
  }
}

/**
 * Builds an LLM provider for the configured provider + model list. When
 * LLM_MODEL contains a comma-separated list, returns a ModelFallbackProvider
 * that starts from the first model on every request and falls back to the next
 * model on failure or quota.
 */
export function createLLMProvider(config: AppConfig): LLMProvider {
  const resolved = resolveProvider(config);
  const { apiKey } = config.llm;
  const models = config.llm.models;

  if (models.length <= 1) {
    return makeProvider(resolved, apiKey, models[0] ?? 'gpt-4o-mini');
  }

  return new ModelFallbackProvider(models, (model) => makeProvider(resolved, apiKey, model), resolved.name);
}
