import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, CompletionOptions } from './LLMProvider.js';
import { ProviderError } from '../utils/errors.js';
import type { LLMConfig } from '../config/types.js';

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private client: Anthropic;
  private model: string;

  constructor(config: LLMConfig) {
    if (!config.apiKey) throw new ProviderError('Anthropic requires an API key (ANTHROPIC_API_KEY)');
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model ?? 'claude-sonnet-4-6';
  }

  async complete(prompt: string, opts: CompletionOptions = {}): Promise<string> {
    try {
      const msg = await this.client.messages.create({
        model: this.model,
        max_tokens: opts.maxTokens ?? 4096,
        system: opts.systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        temperature: opts.temperature ?? 0.2,
      });

      const block = msg.content[0];
      if (block.type !== 'text') throw new ProviderError('Unexpected response type from Anthropic');
      return block.text;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(`Anthropic request failed: ${String(err)}`);
    }
  }

  async *stream(prompt: string, opts: CompletionOptions = {}): AsyncIterable<string> {
    try {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: opts.maxTokens ?? 4096,
        system: opts.systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        temperature: opts.temperature ?? 0.2,
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield event.delta.text;
        }
      }
    } catch (err) {
      throw new ProviderError(`Anthropic stream failed: ${String(err)}`);
    }
  }
}
