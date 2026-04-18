import type { FireCodeConfig } from '@phmotad/fire-code';

const config: FireCodeConfig = {
  project: {
    name: 'my-project',
    // 'legacy' for existing messy projects, 'standard' for greenfield
    mode: 'standard',
  },

  llm: {
    // Providers: 'openrouter' | 'anthropic' | 'openai' | 'ollama'
    provider: 'openrouter',
    model: 'deepseek/deepseek-coder',
    apiKey: process.env.OPENROUTER_API_KEY,
    maxTokens: 4096,
    temperature: 0.2,
  },

  embeddings: {
    // 'local' uses @xenova/transformers (all-MiniLM-L6-v2, runs offline)
    provider: 'local',
    model: 'Xenova/all-MiniLM-L6-v2',
  },

  vectorStore: {
    // 'memory' = in-process, 'qdrant' = external Qdrant server
    provider: 'memory',
    collection: 'fire-code',
  },

  graphStore: {
    // 'memory' = in-process, 'neo4j' = external Neo4j
    provider: 'memory',
  },

  memory: {
    // 'auto'   = uses vector+graph if indexed, falls back to text search
    // 'hybrid' = always uses both (requires index)
    // 'vector' = vector-only
    // 'graph'  = graph-only
    strategy: 'auto',
    maxResults: 10,
  },

  git: {
    enabled: true,
    autoBranch: true,
    branchPrefix: 'firecode/',
    // 'reuse'     = checkout existing branch
    // 'increment' = create branch-2, branch-3...
    // 'fail'      = error if branch exists
    branchStrategy: 'reuse',
    autoCommit: true,
    commitFormat: 'conventional',
    includeMetadata: true,
    // 'stash'  = auto-stash dirty files (recommended)
    // 'commit' = auto-commit dirty files
    // 'fail'   = block if dirty
    // 'ignore' = proceed anyway
    workingTree: 'stash',
    enforcePattern: false,
  },

  execution: {
    // 'safe'       = validate before applying changes
    // 'aggressive' = apply changes directly
    mode: 'safe',
    dryRun: false,
    // 'fail'      = error on conflict (recommended)
    // 'overwrite' = overwrite conflicting files
    // 'merge'     = attempt merge
    conflictStrategy: 'fail',
    validateSyntax: true,
    validateBuild: false,
  },

  indexing: {
    // 'lazy' = index on-demand (recommended for large repos)
    // 'full' = index everything upfront
    mode: 'lazy',
    include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    exclude: ['node_modules/**', 'dist/**', '.firecode/**', '**/*.test.*'],
    maxFileSize: 500_000,
  },
};

export default config;
