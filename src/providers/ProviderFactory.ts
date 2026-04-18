import type { LLMConfig } from '../config/types.js';
import type { LLMProvider } from './LLMProvider.js';
import { OpenRouterProvider } from './OpenRouterProvider.js';
import { AnthropicProvider } from './AnthropicProvider.js';
import { OpenAIProvider } from './OpenAIProvider.js';
import { OllamaProvider } from './OllamaProvider.js';
import { AgentSDKProvider } from './AgentSDKProvider.js';
import { ProviderError } from '../utils/errors.js';

export function createProvider(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case 'openrouter':
      return new OpenRouterProvider(config);
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    case 'ollama':
      return new OllamaProvider(config);
    case 'agent-sdk':
      // Uses logged-in Claude CLI session — no API key required
      return new AgentSDKProvider({ model: config.model });
    default:
      throw new ProviderError(`Unknown LLM provider: ${config.provider as string}`);
  }
}
