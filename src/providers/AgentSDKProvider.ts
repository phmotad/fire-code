import type { LLMProvider, CompletionOptions } from './LLMProvider.js';
import { ProviderError } from '../utils/errors.js';

// Dynamic import to avoid breaking if claude CLI is not installed
async function getQuery() {
  const sdk = await import('@anthropic-ai/claude-agent-sdk');
  return sdk.query as (opts: {
    prompt: string;
    options?: Record<string, string>;
    abortController?: AbortController;
  }) => AsyncIterable<{ type: string; content?: string; text?: string; delta?: { text?: string } }>;
}

export interface AgentSDKOptions {
  model?: string;
  systemPrompt?: string;
}

export class AgentSDKProvider implements LLMProvider {
  readonly name = 'agent-sdk';
  private model: string;

  constructor(opts: AgentSDKOptions = {}) {
    this.model = opts.model ?? 'claude-sonnet-4-6';
  }

  async complete(prompt: string, opts: CompletionOptions = {}): Promise<string> {
    const chunks: string[] = [];
    for await (const chunk of this.stream(prompt, opts)) {
      chunks.push(chunk);
    }
    return chunks.join('');
  }

  async *stream(prompt: string, opts: CompletionOptions = {}): AsyncIterable<string> {
    let query: Awaited<ReturnType<typeof getQuery>>;
    try {
      query = await getQuery();
    } catch {
      throw new ProviderError(
        'Claude Agent SDK not available. Install Claude CLI and log in: https://claude.ai/code',
        { provider: 'agent-sdk' }
      );
    }

    const cliOptions: Record<string, string> = {
      '--model': this.model,
      '--print': '',
      '--output-format': 'stream-json',
    };

    if (opts.maxTokens) {
      cliOptions['--max-tokens'] = String(opts.maxTokens);
    }

    const abort = new AbortController();

    try {
      for await (const message of query({ prompt, options: cliOptions, abortController: abort })) {
        // Handle different message types from the Agent SDK
        if (message.type === 'assistant' && message.content) {
          yield String(message.content);
        } else if (message.type === 'text' && message.text) {
          yield message.text;
        } else if (message.delta?.text) {
          yield message.delta.text;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found') || msg.includes('ENOENT')) {
        throw new ProviderError(
          'Claude CLI not found. Install it first: https://claude.ai/code',
          { provider: 'agent-sdk' }
        );
      }
      throw new ProviderError(`Agent SDK error: ${msg}`, { provider: 'agent-sdk' });
    }
  }
}
