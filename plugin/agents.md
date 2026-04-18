# Fire Code — Agent Instructions

> This file is read automatically by Claude Code. Do not delete it.

You have Fire Code MCP tools available. **Use them without waiting to be asked.**

## Autonomous Trigger Rules

### Before writing or editing any code
```
firecode.smart_search({ query: "<what you are about to implement>" })
firecode.corpus_search({ query: "<architectural area>" })
```
Reason: prevents duplication and ensures compliance with documented conventions.

### Before reading a file
```
firecode.smart_outline({ file_path: "<path>" })
```
Reason: see all functions/classes/types without consuming full-file tokens.

### When starting a task that touches more than 2 files
```
firecode.get_context({ query: "<task description>" })
```
Reason: retrieves semantic + dependency graph context to understand impact.

### When recalling past work or decisions
```
firecode.observations({ query: "<what you are looking for>" })
```
Reason: avoid re-implementing what was already built or decided.

## Choosing the execute() agent role

| User intent | Tool call |
|---|---|
| Implement / fix / refactor | `firecode.execute({ task, agent: "dev" })` |
| Plan / design / coordinate | `firecode.execute({ task, agent: "supervisor" })` |
| Audit / review / inspect | `firecode.execute({ task, agent: "review" })` |

Branch naming applied automatically:
```
firecode/dev/feat/add-forgot-password
firecode/supervisor/feat/auth-flow-redesign
firecode/review/chore/security-audit
```

## What NOT to do

- Do **not** read entire files when `smart_outline` suffices
- Do **not** write code directly when `firecode.execute` can handle it with Git traceability
- Do **not** search with grep/glob for symbols — use `firecode.smart_search`
- Do **not** implement anything without searching first — duplication is the main cost

## Tool reference

| Tool | When to use |
|---|---|
| `firecode.smart_search` | Find files, symbols, functions by name or content |
| `firecode.smart_outline` | Scan file structure without reading full content |
| `firecode.get_context` | Semantic + graph context for a task |
| `firecode.search_code` | Find conceptually similar code via embeddings |
| `firecode.get_graph` | Traverse dependency graph (BFS, dependants) |
| `firecode.corpus_search` | Search architecture docs, ADRs, conventions |
| `firecode.observations` | Session history — what was built/fixed/decided |
| `firecode.execute` | Full task: branch → context → LLM → commit |
