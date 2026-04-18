import { createProvider } from '../../../src/providers/ProviderFactory';
import { ProviderError } from '../../../src/utils/errors';
import type { LLMConfig } from '../../../src/config/types';

jest.mock('../../../src/providers/OpenRouterProvider', () => ({
  OpenRouterProvider: jest.fn().mockImplementation(() => ({ name: 'openrouter' })),
}));
jest.mock('../../../src/providers/AnthropicProvider', () => ({
  AnthropicProvider: jest.fn().mockImplementation(() => ({ name: 'anthropic' })),
}));
jest.mock('../../../src/providers/OpenAIProvider', () => ({
  OpenAIProvider: jest.fn().mockImplementation(() => ({ name: 'openai' })),
}));
jest.mock('../../../src/providers/OllamaProvider', () => ({
  OllamaProvider: jest.fn().mockImplementation(() => ({ name: 'ollama' })),
}));

function makeConfig(provider: string): LLMConfig {
  return {
    provider: provider as LLMConfig['provider'],
    model: 'test-model',
    apiKey: 'test-key',
    maxTokens: 4096,
    temperature: 0.2,
  };
}

describe('ProviderFactory.createProvider', () => {
  it.each(['openrouter', 'anthropic', 'openai', 'ollama'])('creates %s provider', (p) => {
    const provider = createProvider(makeConfig(p));
    expect(provider.name).toBe(p);
  });

  it('throws ProviderError for unknown provider', () => {
    expect(() => createProvider(makeConfig('unknown'))).toThrow(ProviderError);
  });
});
