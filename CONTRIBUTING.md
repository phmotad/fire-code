# Contributing to Fire Code

Fire Code is MIT-licensed and open to contributions of all kinds.

## Getting Started

```bash
git clone https://github.com/YOUR_USERNAME/fire-code
cd fire-code
npm install
npm run build
npm test
```

## Development Workflow

```bash
npm run build:watch   # watch mode
npm run lint          # type-check
npm test              # all tests
npm run test:unit     # unit tests only
npm run test:coverage # coverage report
```

## Project Structure

```
src/
  cli/          — CLI commands (init, dev, index, install, uninstall)
  mcp/          — MCP server + tools (7 tools)
  core/         — ExecutionEngine, TaskRouter
  agents/       — CodeAgent (LLM prompt → FileChange[])
  memory/       — HybridMemory, FallbackMemory
  vector/       — MemoryVectorStore (transformers.js embeddings)
  graph/        — InMemoryGraphStore (dependency graph)
  indexing/     — FileScanner, ASTParser, EmbeddingGenerator, Indexer
  git/          — GitManager, CommitFormatter
  providers/    — Anthropic, OpenAI, Ollama, OpenRouter
  config/       — Zod schema, loader, defaults
plugin/
  hooks/        — hooks.json (Claude Code lifecycle hooks)
  scripts/      — smart-install.js, context-inject.js
__tests__/
  unit/         — unit tests per module
  integration/  — integration tests
```

## Adding a New MCP Tool

1. Create `src/mcp/tools/your_tool.ts` with a Zod input schema and handler
2. Import and register it in `src/mcp/server.ts`
3. Add unit tests in `__tests__/unit/`

## Adding a New LLM Provider

1. Implement `LLMProvider` interface in `src/providers/YourProvider.ts`
2. Register it in `src/providers/ProviderFactory.ts`
3. Add mock tests in `__tests__/unit/providers/`

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- All tests must pass (`npm test`)
- No TypeScript errors (`npm run lint`)
- Follow existing code style (no comments unless the WHY is non-obvious)

## Reporting Issues

Open an issue at https://github.com/YOUR_USERNAME/fire-code/issues
