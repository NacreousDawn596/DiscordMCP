import { getLogger } from '../../logging/logger.js';
import type {
  ChatMessage,
  CompleteOptions,
  LLMProvider,
  LLMResponse,
  ToolDefinition,
} from '../types.js';

/**
 * Wraps a list of models sharing the same provider/credentials. On each call it
 * starts from the first model and, if the model fails (network, quota, 4xx/5xx,
 * etc.), falls back to the next one in order. Every new call starts again at
 * the first model.
 */
export class ModelFallbackProvider implements LLMProvider {
  readonly name = 'model-fallback';

  constructor(
    private readonly models: string[],
    private readonly create: (model: string) => LLMProvider,
    private readonly label = 'provider',
  ) {}

  async complete(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options: CompleteOptions,
  ): Promise<LLMResponse> {
    let lastError: unknown;

    for (const model of this.models) {
      const provider = this.create(model);
      try {
        return await provider.complete(messages, tools, options);
      } catch (err) {
        lastError = err;
        getLogger().warn(
          { model, provider: this.label, err: (err as Error).message },
          'model failed, falling back',
        );
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`All models failed: ${this.models.join(', ')}`);
  }
}
