import axios from 'axios';
import type { LLMProvider, CompletionOptions } from './LLMProvider.js';
import { ProviderError } from '../utils/errors.js';
import type { LLMConfig } from '../config/types.js';

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  private baseUrl: string;
  private model: string;

  constructor(config: LLMConfig) {
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
    this.model = config.model ?? 'llama3';
  }

  async complete(prompt: string, opts: CompletionOptions = {}): Promise<string> {
    const messages = [];
    if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt });
    messages.push({ role: 'user', content: prompt });

    try {
      const res = await axios.post(`${this.baseUrl}/api/chat`, {
        model: this.model,
        messages,
        stream: false,
        options: {
          num_predict: opts.maxTokens ?? 4096,
          temperature: opts.temperature ?? 0.2,
          stop: opts.stopSequences,
        },
      });
      return (res.data as { message: { content: string } }).message.content;
    } catch (err) {
      throw new ProviderError(`Ollama request failed (is Ollama running?): ${String(err)}`);
    }
  }

  async *stream(prompt: string, opts: CompletionOptions = {}): AsyncIterable<string> {
    const messages = [];
    if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt });
    messages.push({ role: 'user', content: prompt });

    try {
      const res = await axios.post(
        `${this.baseUrl}/api/chat`,
        {
          model: this.model,
          messages,
          stream: true,
          options: { num_predict: opts.maxTokens ?? 4096, temperature: opts.temperature ?? 0.2 },
        },
        { responseType: 'stream' },
      );

      for await (const chunk of res.data as AsyncIterable<Buffer>) {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
            if (parsed.done) return;
            if (parsed.message?.content) yield parsed.message.content;
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      throw new ProviderError(`Ollama stream failed: ${String(err)}`);
    }
  }
}
