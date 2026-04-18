import OpenAI from 'openai';
import type { LLMProvider, CompletionOptions } from './LLMProvider.js';
import { ProviderError } from '../utils/errors.js';
import type { LLMConfig } from '../config/types.js';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private model: string;

  constructor(config: LLMConfig) {
    if (!config.apiKey) throw new ProviderError('OpenAI requires an API key (OPENAI_API_KEY)');
    this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl });
    this.model = config.model ?? 'gpt-4o';
  }

  async complete(prompt: string, opts: CompletionOptions = {}): Promise<string> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt });
    messages.push({ role: 'user', content: prompt });

    try {
      const res = await this.client.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature ?? 0.2,
        stop: opts.stopSequences,
      });
      return res.choices[0].message.content ?? '';
    } catch (err) {
      throw new ProviderError(`OpenAI request failed: ${String(err)}`);
    }
  }

  async *stream(prompt: string, opts: CompletionOptions = {}): AsyncIterable<string> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt });
    messages.push({ role: 'user', content: prompt });

    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature ?? 0.2,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) yield content;
      }
    } catch (err) {
      throw new ProviderError(`OpenAI stream failed: ${String(err)}`);
    }
  }
}
