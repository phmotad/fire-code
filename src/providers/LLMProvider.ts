export interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  stopSequences?: string[];
}

export interface LLMProvider {
  readonly name: string;
  complete(prompt: string, opts?: CompletionOptions): Promise<string>;
  stream(prompt: string, opts?: CompletionOptions): AsyncIterable<string>;
}
