# Changelog

All notable changes to Fire Code are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0] — 2026-04-18

### Added

- **Knowledge Corpus** — `CorpusService` walks `.md/.txt/.rst/.mdx` files, chunks by heading/paragraph, stores in SQLite FTS5 table. New `firecode.corpus_search` MCP tool (Tier 2). CLI: `fire-code corpus build|prime|query`
- **Privacy Tags** — `<private>...</private>`, `# private:` lines, `// @private` markers strip content before indexing or sending to LLM. File-level blocks for `.env`, `*.pem`, `*.key`, `secrets.*`
- **SQLite Graph Store** — `SQLiteGraphStore` replaces `InMemoryGraphStore` and `graph.json`. Uses `better-sqlite3` for persistence and `graphology` for in-process BFS/reachability traversal. `get_graph` supports `neighbors` (transitive deps) and `dependants` params
- **Vectra Vector Store** — `VectraVectorStore` replaces `MemoryVectorStore`. HNSW approximate nearest-neighbor via `vectra` package, persists to disk as `vectors.db`
- **Worker Daemon** — Express HTTP server on port 37778 with `/health`, `/` (dark-theme dashboard), `/index`, `/context`, `/observations`. PID management, auto-started by `SessionStart` hook. CLI: `fire-code daemon start|stop|status`
- **Session Observations** — `firecode.observations` MCP tool returns persistent log of what was built, fixed, and decided per session
- **`fire-code update` command** — runs `npm install -g fire-code@latest`
- **`DatabaseManager.getGraphStore(project)`** — factory returns `SQLiteGraphStore` bound to project
- **84 unit + integration tests** (+9 new SQLiteGraphStore tests)

### Changed

- Graph storage migrated from `graph.json` to `firecode.db` (SQLite). No breaking change for MCP clients
- `indexProject` now calls `graphStore.clear()` before re-building (idempotent re-index)
- `ObservationService` skips private files and sanitizes content before storing
- `EmbeddingGenerator` skips files matched by `isPrivateFile()`
- MCP `__workflow` hint updated to mention `corpus_search`, `observations`, and privacy tags

### Fixed

- `DatabaseManager.reset()` now closes the SQLite connection before nulling the singleton (fixes `EBUSY` on Windows during test cleanup)
- `graphology` type imports use `graphology-types` package to resolve 18 TypeScript errors

---

## [0.1.0] — 2026-04-18

### Added

- **MCP Server** with 7 tools: `smart_search`, `smart_outline`, `get_context`, `search_code`, `get_graph`, `execute`, `__workflow`
- **Hybrid Memory** — vector (all-MiniLM-L6-v2 via @xenova/transformers) + graph (InMemoryGraphStore)
- **Git Integration** — branch creation with `reuse|increment|fail` strategies, conventional commits, working-tree validation
- **CodeAgent** — LLM-driven code execution with context retrieval and `FileChange[]` application
- **Progressive disclosure** — 3-tier tool hierarchy (fast → memory → execute) for token efficiency
- **Claude Code plugin** — `.claude-plugin/plugin.json`, lifecycle hooks (SessionStart, PostToolUse, Stop)
- **Auto re-index** — PostToolUse hook re-indexes changed files after Write/Edit
- **Install command** — `npx fire-code install [--ide cursor|windsurf]` registers MCP + hooks
- **LLM Providers** — Anthropic, OpenAI, OpenRouter, Ollama
- **Zod config schema** — full validation with defaults and `firecode.config.ts` support
- **75 unit + integration tests** — Jest with ts-jest, 70%+ coverage
