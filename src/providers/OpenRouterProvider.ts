import axios from 'axios';
import type { LLMProvider, CompletionOptions } from './LLMProvider.js';
import { ProviderError } from '../utils/errors.js';
import type { LLMConfig } from '../config/types.js';

export class OpenRouterProvider implements LLMProvider {
  readonly name = 'openrouter';
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config: LLMConfig) {
    if (!config.apiKey) throw new ProviderError('OpenRouter requires an API key');
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'deepseek/deepseek-coder';
    this.baseUrl = config.baseUrl ?? 'https://openrouter.ai/api/v1';
  }

  async complete(prompt: string, opts: CompletionOptions = {}): Promise<string> {
    const messages = [];
    if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt });
    messages.push({ role: 'user', content: prompt });

    try {
      const res = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages,
          max_tokens: opts.maxTokens ?? 4096,
          temperature: opts.temperature ?? 0.2,
          stop: opts.stopSequences,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://github.com/fire-code/fire-code',
            'X-Title': 'Fire Code',
            'Content-Type': 'application/json',
          },
        },
      );
      return (res.data as { choices: Array<{ message: { content: string } }> }).choices[0].message.content;
    } catch (err) {
      throw new ProviderError(`OpenRouter request failed: ${String(err)}`);
    }
  }

  async *stream(prompt: string, opts: CompletionOptions = {}): AsyncIterable<string> {
    const messages = [];
    if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt });
    messages.push({ role: 'user', content: prompt });

    try {
      const res = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages,
          max_tokens: opts.maxTokens ?? 4096,
          temperature: opts.temperature ?? 0.2,
          stream: true,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://github.com/fire-code/fire-code',
            'X-Title': 'Fire Code',
          },
          responseType: 'stream',
        },
      );

      for await (const chunk of res.data as AsyncIterable<Buffer>) {
        const lines = chunk.toString().split('\n').filter((l: string) => l.startsWith('data: '));
        for (const line of lines) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data) as { choices: Array<{ delta: { content?: string } }> };
            const content = parsed.choices[0]?.delta?.content;
            if (content) yield content;
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      throw new ProviderError(`OpenRouter stream failed: ${String(err)}`);
    }
  }
}
