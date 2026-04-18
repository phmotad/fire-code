<h1 align="center">
  🔥 Fire Code
</h1>

<h4 align="center">Intelligent MCP execution engine for AI coding agents — persistent memory, context-aware, Git-traceable.</h4>

<p align="center">
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT">
  </a>
  <img src="https://img.shields.io/badge/version-0.2.1-green.svg" alt="Version">
  <img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg" alt="Node">
  <img src="https://img.shields.io/badge/MCP-compatible-red.svg" alt="MCP">
  <img src="https://img.shields.io/badge/Claude%20Code-plugin-orange.svg" alt="Claude Code Plugin">
</p>

<p align="center">
  <a href="README.md"><strong>English</strong></a> •
  <a href="README.pt-br.md">Português</a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#mcp-tools">MCP Tools</a> •
  <a href="#knowledge-corpus">Knowledge Corpus</a> •
  <a href="#privacy">Privacy</a> •
  <a href="#daemon">Daemon</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## What is Fire Code?

Fire Code is an open-source **Claude Code plugin** and **MCP server** that gives AI coding agents:

- 🧠 **Hybrid Memory** — vector search (semantic, HNSW via Vectra) + dependency graph (SQLite + graphology)
- 🔍 **Smart Code Search** — find symbols, functions, and patterns without reading every file
- 📚 **Knowledge Corpus** — feed architecture docs, ADRs, and decisions directly into agent context
- 🌿 **Git Traceability** — every AI-generated change gets its own branch and conventional commit
- 📊 **Structural Outline** — understand any file without loading it fully (token-efficient)
- 👁️ **Session Observations** — persistent log of what was built, fixed, and decided
- 🔒 **Privacy Tags** — mark sections of code/docs as private; they never reach the LLM
- ⚡ **Context-Aware Execution** — CodeAgent retrieves relevant context before writing code
- 🔁 **Auto Re-index** — hooks re-index changed files after every `Write`/`Edit` tool call
- 🖥️ **Web Daemon** — local HTTP server with dashboard, auto-started by hooks

---

## Quick Start

**Install as a Claude Code plugin (one command):**

```bash
npx fire-code install
```

Or for Cursor / Windsurf:

```bash
npx fire-code install --ide cursor
npx fire-code install --ide windsurf
```

**Index your project:**

```bash
cd your-project
npx fire-code index
```

**Build the knowledge corpus** (optional but recommended):

```bash
npx fire-code corpus build   # indexes docs/, README.md, ADRs, etc.
```

**Restart Claude Code.** The MCP tools are now available in every session.

---

## How It Works

### Architecture

```
Claude Code (host)
  ├── Lifecycle Hooks
  │     ├── SessionStart  → start daemon, inject .firecode/bootstrap.log context
  │     ├── PostToolUse   → re-index changed files (Write/Edit)
  │     └── Stop          → reserved for summarization
  │
  ├── Worker Daemon (port 37778)
  │     ├── GET /health   → liveness check
  │     ├── GET /         → web dashboard (dark theme)
  │     ├── POST /index   → trigger re-index
  │     ├── GET /context  → hybrid context retrieval
  │     └── GET /observations → recent session log
  │
  └── MCP Server (stdio)
        ├── Tier 1 — Fast
        │     ├── firecode.smart_search   — symbol/content search (~50 tokens/result)
        │     └── firecode.smart_outline  — file structure (folded view)
        ├── Tier 2 — Memory
        │     ├── firecode.get_context    — hybrid vector + graph retrieval
        │     ├── firecode.search_code    — semantic similarity over embeddings
        │     ├── firecode.get_graph      — dependency relationships (BFS, dependants)
        │     ├── firecode.observations   — session history (what was built/fixed)
        │     └── firecode.corpus_search  — search architecture docs and decisions
        └── Tier 3 — Execute
              └── firecode.execute        — full task execution with Git
```

### Storage (`.firecode/`)

```
.firecode/
  firecode.db     — SQLite: graph nodes/edges, observations, corpus, sessions
  vectors.db      — Vectra HNSW index (all-MiniLM-L6-v2 embeddings)
  bootstrap.log   — indexing stats, injected on SessionStart
  daemon.pid      — worker daemon PID (auto-managed)
```

### Recommended Workflow (token-efficient)

```
1. smart_search(query)        → find files/symbols (~50 tokens/result)
2. smart_outline(file_path)   → see all symbols folded (~20 tokens/symbol)
3. corpus_search(query)       → check architecture decisions and docs
4. get_context(query)         → semantic + graph context for the task
5. execute(task)              → make changes with Git traceability
```

---

## MCP Tools

| Tool | Tier | Description |
|------|------|-------------|
| `firecode.smart_search` | 1 — Fast | Search symbols, file names, content across codebase |
| `firecode.smart_outline` | 1 — Fast | Structural outline of a file (functions, classes, types) |
| `firecode.get_context` | 2 — Memory | Hybrid retrieval: vector semantic + graph traversal |
| `firecode.search_code` | 2 — Memory | Semantic similarity search over indexed embeddings |
| `firecode.get_graph` | 2 — Memory | Query dependency graph: nodes, edges, BFS, dependants |
| `firecode.observations` | 2 — Memory | Session history: what was built, fixed, and decided |
| `firecode.corpus_search` | 2 — Memory | Full-text search over architecture docs and ADRs |
| `firecode.execute` | 3 — Execute | Full task: branch → context → CodeAgent → commit |

### `get_graph` — advanced queries

```typescript
// Find all transitive dependencies of auth.ts
get_graph({ neighbors: "src/auth.ts", depth: 3 })

// Find everything that depends on crypto.ts
get_graph({ dependants: "src/crypto.ts" })

// List all nodes of a type
get_graph({ type: "function" })
```

### Example session

```typescript
// Step 1: Find what exists
smart_search({ query: "validateEmail", path: "src" })
// → L5  export [function]  validateEmail(email: string): boolean

// Step 2: Check architecture decisions
corpus_search({ query: "password hashing policy" })
// → architecture.md: "Passwords are hashed with SHA-256 + salt. Do not use MD5."

// Step 3: Get semantic context
get_context({ query: "add forgot password feature" })
// → Returns relevant functions + dependency chain

// Step 4: Execute with full traceability
execute({ task: "add forgot password feature", type: "feature" })
// → Creates branch firecode/feat/forgot-password
// → Runs CodeAgent with context
// → Commits: feat(auth): add forgot password feature
```

---

## Knowledge Corpus

The corpus lets you feed project knowledge (architecture notes, ADRs, onboarding docs) directly into agent context via `firecode.corpus_search`.

```bash
# Build from docs/ directory automatically
npx fire-code corpus build

# Add a single entry manually
npx fire-code corpus prime --title "Auth Policy" --content "Never store raw passwords..."

# Search the corpus
npx fire-code corpus query "password hashing"
```

**Supported file types:** `.md`, `.txt`, `.rst`, `.mdx`

**Chunking:** documents are split by heading and paragraph (max 1500 chars/chunk) for accurate retrieval.

---

## Privacy

Mark any content as private — it will never be indexed, embedded, or sent to an LLM.

### Inline tags

```typescript
// @private
const SECRET_KEY = process.env.SECRET_KEY;

// This is public context
export function validateEmail(email: string): boolean { ... }

<private>
Internal implementation note: we use a vendor-specific workaround here.
</private>
```

```markdown
# public heading

# private: internal architecture note that should not be in agent context
```

### File-level privacy

Files matching these patterns are **never indexed:**

```
.env, .env.*, *.pem, *.key, *.cert, secrets.*, credentials.*
```

---

## Daemon

The Fire Code daemon is a local HTTP server (port 37778) that stays alive between sessions for instant context access. It is automatically started by the `SessionStart` hook.

```bash
npx fire-code daemon start   # start in background
npx fire-code daemon stop    # stop
npx fire-code daemon status  # show PID + health

# The web dashboard is available at:
open http://localhost:37778
```

The dashboard shows real-time project stats, recent observations, and allows triggering a re-index.

---

## Configuration

Create `firecode.config.ts` in your project root (or run `fire-code init`):

```typescript
import type { FireCodeConfig } from '@phmotad/fire-code';

export default {
  project: {
    name: 'my-project',
  },
  llm: {
    provider: 'anthropic',       // anthropic | openai | openrouter | ollama
    model: 'claude-sonnet-4-6',
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  git: {
    branchStrategy: 'increment', // reuse | increment | fail
    workingTree: 'stash',        // stash | commit | fail | ignore
    autoCommit: true,
  },
  indexing: {
    mode: 'lazy',
    include: ['**/*.ts', '**/*.tsx', '**/*.js'],
    exclude: ['node_modules', 'dist', '.git'],
  },
} satisfies FireCodeConfig;
```

### LLM Providers

| Provider | env var | Default model |
|----------|---------|---------------|
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` |
| `openai` | `OPENAI_API_KEY` | `gpt-4o` |
| `openrouter` | `OPENROUTER_API_KEY` | `deepseek/deepseek-coder` |
| `ollama` | _(none)_ | `codellama` |

---

## CLI Commands

```bash
# Setup
npx fire-code install          # Install plugin (Claude Code, Cursor, Windsurf)
npx fire-code install --ide cursor
npx fire-code uninstall        # Remove plugin from IDE configs
npx fire-code init             # Interactive setup wizard
npx fire-code update           # Update to latest version

# Indexing
npx fire-code index            # Index project (lazy mode)
npx fire-code index --mode full  # Full re-index

# Corpus
npx fire-code corpus build     # Build corpus from docs/
npx fire-code corpus prime     # Add a single entry manually
npx fire-code corpus query <q> # Search the corpus

# Daemon
npx fire-code daemon start     # Start background daemon
npx fire-code daemon stop      # Stop daemon
npx fire-code daemon status    # Check daemon status

# MCP Server
npx fire-code dev              # Start MCP server (stdio)
```

---

## Contributing

Contributions are welcome! Fire Code is MIT-licensed and fully open source.

```bash
git clone https://github.com/phmotad/fire-code
cd fire-code
npm install
npm run build
npm test
```

### Project Structure

```
src/
  cli/          — CLI commands (init, dev, index, install, daemon, corpus, update)
  mcp/          — MCP server + tools
  core/         — ExecutionEngine, TaskRouter
  agents/       — CodeAgent
  memory/       — HybridMemory, FallbackMemory
  vector/       — VectraVectorStore (HNSW, all-MiniLM-L6-v2)
  graph/        — SQLiteGraphStore (graphology traversal + SQLite persistence)
  indexing/     — FileScanner, ASTParser, EmbeddingGenerator
  git/          — GitManager, CommitFormatter
  providers/    — LLM providers (Anthropic, OpenAI, Ollama, OpenRouter)
  config/       — Zod schema, loader, defaults
  daemon/       — DaemonServer (Express, port 37778), DaemonClient
  services/     — CorpusService, ObservationService
  utils/        — privacy.ts, logger.ts, errors.ts, paths.ts
  db/           — DatabaseManager (SQLite), schema
plugin/
  hooks/        — hooks.json (lifecycle hooks)
  scripts/      — hook runner scripts
```

### Running Tests

```bash
npm test              # all tests (84 passing)
npm run test:unit     # unit tests only
npm run test:coverage # with coverage report
```

---

## License

MIT © FireCode Contributors

---

<p align="center">
  Built with ❤️ for the AI coding agent community.
</p>
