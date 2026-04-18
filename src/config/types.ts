import { z } from 'zod';

export const LLMConfigSchema = z.object({
  provider: z.enum(['openrouter', 'anthropic', 'openai', 'ollama', 'agent-sdk']).default('openrouter'),
  model: z.string().default('deepseek/deepseek-coder'),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  maxTokens: z.number().int().positive().default(4096),
  temperature: z.number().min(0).max(2).default(0.2),
});

export const EmbeddingsConfigSchema = z.object({
  provider: z.enum(['local', 'openai', 'voyage']).default('local'),
  model: z.string().default('Xenova/all-MiniLM-L6-v2'),
  apiKey: z.string().optional(),
});

export const VectorStoreConfigSchema = z.object({
  provider: z.enum(['memory', 'qdrant']).default('memory'),
  url: z.string().optional(),
  apiKey: z.string().optional(),
  collection: z.string().default('firecode'),
});

export const GraphStoreConfigSchema = z.object({
  provider: z.enum(['memory', 'neo4j']).default('memory'),
  url: z.string().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
});

export const MemoryConfigSchema = z.object({
  strategy: z.enum(['hybrid', 'vector', 'graph', 'auto']).default('auto'),
  maxResults: z.number().int().positive().default(10),
});

export const GitConfigSchema = z.object({
  enabled: z.boolean().default(true),
  autoBranch: z.boolean().default(true),
  branchPrefix: z.string().default('firecode/'),
  branchStrategy: z.enum(['reuse', 'increment', 'fail']).default('reuse'),
  autoCommit: z.boolean().default(true),
  commitFormat: z.enum(['conventional', 'simple']).default('conventional'),
  includeMetadata: z.boolean().default(true),
  workingTree: z.enum(['stash', 'commit', 'fail', 'ignore']).default('stash'),
  enforcePattern: z.boolean().default(false),
});

export const ExecutionConfigSchema = z.object({
  mode: z.enum(['safe', 'aggressive']).default('safe'),
  dryRun: z.boolean().default(false),
  conflictStrategy: z.enum(['merge', 'overwrite', 'fail']).default('fail'),
  validateSyntax: z.boolean().default(true),
  validateBuild: z.boolean().default(false),
});

export const IndexingConfigSchema = z.object({
  mode: z.enum(['full', 'lazy']).default('lazy'),
  include: z.array(z.string()).default(['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx']),
  exclude: z.array(z.string()).default(['node_modules/**', 'dist/**', '.firecode/**']),
  maxFileSize: z.number().int().positive().default(500_000),
});

export const ProjectConfigSchema = z.object({
  name: z.string().default('unnamed-project'),
  mode: z.enum(['legacy', 'standard']).default('standard'),
});

export const FireCodeConfigSchema = z.object({
  project: ProjectConfigSchema.default({}),
  llm: LLMConfigSchema.default({}),
  embeddings: EmbeddingsConfigSchema.default({}),
  vectorStore: VectorStoreConfigSchema.default({}),
  graphStore: GraphStoreConfigSchema.default({}),
  memory: MemoryConfigSchema.default({}),
  git: GitConfigSchema.default({}),
  execution: ExecutionConfigSchema.default({}),
  indexing: IndexingConfigSchema.default({}),
});

export type FireCodeConfig = z.infer<typeof FireCodeConfigSchema>;
export type LLMConfig = z.infer<typeof LLMConfigSchema>;
export type EmbeddingsConfig = z.infer<typeof EmbeddingsConfigSchema>;
export type VectorStoreConfig = z.infer<typeof VectorStoreConfigSchema>;
export type GraphStoreConfig = z.infer<typeof GraphStoreConfigSchema>;
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;
export type GitConfig = z.infer<typeof GitConfigSchema>;
export type ExecutionConfig = z.infer<typeof ExecutionConfigSchema>;
export type IndexingConfig = z.infer<typeof IndexingConfigSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
