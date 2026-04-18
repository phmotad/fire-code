# Fire Code — Codebase Guide for Claude

## What This Project Does

Fire Code is a Claude Code **plugin** and **MCP server** that gives AI coding agents hybrid memory (vector + graph), smart code search, and Git-traceable execution.

## Key Architecture

```
src/mcp/server.ts          — MCP server with 9 tools
src/core/ExecutionEngine.ts — orchestrates the full task flow
src/agents/CodeAgent.ts    — LLM prompt → FileChange[] application
src/memory/HybridMemory.ts — vector search + graph traversal
src/indexing/Indexer.ts    — file scanning, AST parsing, embeddings
src/git/GitManager.ts      — branch/commit/stash strategies
plugin/hooks/hooks.json    — Claude Code lifecycle hooks
```

## MCP Tool Hierarchy (always follow this order)

1. `firecode.smart_search` — find files/symbols first
2. `firecode.smart_outline` — understand file structure
3. `firecode.corpus_search` — check architecture docs and decisions
4. `firecode.get_context` — semantic + graph context
5. `firecode.execute` — make changes last

## Code Conventions

- TypeScript strict mode, no `any`
- No comments unless the WHY is non-obvious
- Zod for all external input validation
- Pino for structured logging (`logger.info/debug/warn/error`)
- `FireCodeError` subclasses for domain errors
- Tests in `__tests__/unit/` per module

## Running

```bash
npm run lint    # type check
npm test        # all tests (84 passing)
npm run build   # tsc build
```

## Important Files

- `src/config/types.ts` — full `FireCodeConfig` Zod schema
- `src/utils/errors.ts` — `FireCodeError`, `ConfigError`, `GitError`, `IndexError`, etc.
- `src/utils/paths.ts` — `.firecode/` directory helpers
- `src/utils/zodToJsonSchema.ts` — minimal Zod→JSON Schema converter
