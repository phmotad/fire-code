<h1 align="center">
  🔥 Fire Code
</h1>

<h4 align="center">Motor de execução MCP inteligente para agentes de codificação com IA — memória persistente, ciente do contexto, rastreável via Git.</h4>

<p align="center">
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="Licença: MIT">
  </a>
  <img src="https://img.shields.io/badge/version-0.2.3-green.svg" alt="Versão">
  <img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg" alt="Node">
  <img src="https://img.shields.io/badge/MCP-compatível-red.svg" alt="MCP">
</p>

<p align="center">
  <a href="README.md">English</a> •
  <strong>Português</strong>
</p>

<p align="center">
  <a href="#início-rápido">Início Rápido</a> •
  <a href="#como-funciona">Como Funciona</a> •
  <a href="#ferramentas-mcp">Ferramentas MCP</a> •
  <a href="#corpus-de-conhecimento">Corpus</a> •
  <a href="#privacidade">Privacidade</a> •
  <a href="#configuração">Configuração</a>
</p>

---

## O que é o Fire Code?

Fire Code é um **plugin de código aberto** e **servidor MCP** que dá aos agentes de IA:

- 🧠 **Memória Híbrida** — busca vetorial semântica (HNSW via Vectra) + grafo de dependências (SQLite + graphology)
- 🔍 **Busca Inteligente** — encontre símbolos, funções e padrões sem ler cada arquivo
- 📚 **Corpus de Conhecimento** — alimente decisões arquiteturais e ADRs diretamente no contexto do agente
- 🌿 **Rastreabilidade Git** — cada mudança gerada por IA recebe seu próprio branch e commit convencional
- 📊 **Outline Estrutural** — entenda qualquer arquivo sem carregá-lo completamente (eficiência de tokens)
- 👁️ **Observações de Sessão** — registro persistente do que foi construído, corrigido e decidido
- 🔒 **Tags de Privacidade** — marque seções de código como privadas; nunca chegam ao LLM
- 🖥️ **Daemon Web** — servidor HTTP local com dashboard, iniciado automaticamente pelos hooks
- 🔁 **Re-indexação Automática** — hooks re-indexam arquivos alterados após cada operação de escrita

---

## IDEs Suportadas

| IDE | MCP Tools | Hooks | Instalação |
|-----|-----------|-------|-----------|
| **Claude Code** | ✓ | ✓ | `fire-code install` |
| **Cursor** | ✓ | ✓ | `fire-code install --ide cursor` |
| **Windsurf** | ✓ | ✓ | `fire-code install --ide windsurf` |
| **OpenCode** | ✓ | ✓ | `fire-code install --ide opencode` |
| **Codex CLI** | ✓ | — | `fire-code install --ide codex` |
| **Gemini CLI** | ✓ | — | `fire-code install --ide gemini` |
| **Goose** | ✓ | — | `fire-code install --ide goose` |
| **Qualquer IDE MCP** | ✓ | — | `fire-code install --ide generic` |

> Não sabe qual IDE tem? Use `fire-code install` sem flags — detecta automaticamente.

---

## Início Rápido

**Instalar globalmente:**

```bash
npm install -g @phmotad/fire-code
```

**Instalar o plugin** (detecta o IDE automaticamente):

```bash
fire-code install
```

**Indexar seu projeto:**

```bash
cd seu-projeto
fire-code index
```

**Construir o corpus de conhecimento** (opcional, mas recomendado):

```bash
fire-code corpus build
```

**Reinicie seu IDE.** As ferramentas MCP agora estão disponíveis em toda sessão.

---

## Como Funciona

### Arquitetura

```
Seu IDE (Claude Code / Cursor / Windsurf / OpenCode / ...)
  ├── Hooks de Ciclo de Vida
  │     ├── SessionStart  → inicia daemon, injeta contexto de bootstrap
  │     ├── PostToolUse   → re-indexa arquivos alterados
  │     └── Stop          → reservado para sumarização
  │
  ├── Daemon Worker (porta 37778)
  │     ├── GET /         → dashboard web (tema escuro)
  │     ├── GET /health   → verificação de saúde
  │     ├── POST /index   → disparar re-indexação
  │     └── GET /observations → log de sessão recente
  │
  └── Servidor MCP (stdio)
        ├── Tier 1 — Rápido
        │     ├── firecode.smart_search   → busca de símbolos/conteúdo
        │     └── firecode.smart_outline  → estrutura do arquivo (visão compacta)
        ├── Tier 2 — Memória
        │     ├── firecode.get_context    → recuperação híbrida vetor + grafo
        │     ├── firecode.search_code    → similaridade semântica
        │     ├── firecode.get_graph      → relacionamentos de dependência
        │     ├── firecode.observations   → histórico de sessão
        │     └── firecode.corpus_search  → busca em docs de arquitetura
        └── Tier 3 — Execução
              └── firecode.execute        → tarefa completa com Git
```

### Armazenamento (`.firecode/`)

```
.firecode/
  firecode.db     — SQLite: grafo, observações, corpus, sessões
  vectors.db      — Vectra HNSW (embeddings all-MiniLM-L6-v2)
  bootstrap.log   — estatísticas de indexação, injetadas no SessionStart
  daemon.pid      — PID do daemon (gerenciado automaticamente)
```

---

## Ferramentas MCP

| Ferramenta | Tier | Descrição |
|------------|------|-----------|
| `firecode.smart_search` | 1 — Rápido | Busca símbolos, nomes de arquivo, conteúdo |
| `firecode.smart_outline` | 1 — Rápido | Outline estrutural de um arquivo |
| `firecode.get_context` | 2 — Memória | Recuperação híbrida: vetor semântico + grafo |
| `firecode.search_code` | 2 — Memória | Busca por similaridade semântica |
| `firecode.get_graph` | 2 — Memória | Grafo de dependências: nós, arestas, BFS |
| `firecode.observations` | 2 — Memória | Histórico: o que foi construído/corrigido |
| `firecode.corpus_search` | 2 — Memória | Busca em docs de arquitetura e ADRs |
| `firecode.execute` | 3 — Execução | Tarefa completa: branch → contexto → LLM → commit |

### Fluxo Recomendado

```
1. smart_search(query)       → encontrar implementações existentes
2. smart_outline(arquivo)    → entender estrutura do arquivo
3. corpus_search(query)      → verificar restrições arquiteturais
4. get_context(query)        → obter contexto semântico + estrutural
5. execute(tarefa)           → fazer a mudança
```

---

## Corpus de Conhecimento

Alimente notas de arquitetura, ADRs e guias de onboarding no índice FTS5:

```bash
fire-code corpus build           # indexa docs/, README.md, ADRs, etc.
fire-code corpus prime \
  --title "Política de Auth" \
  --content "Senhas usam SHA-256+salt. Nunca MD5."
fire-code corpus query "hashing de senha"
```

**Tipos suportados:** `.md`, `.txt`, `.rst`, `.mdx`

---

## Privacidade

Marque qualquer conteúdo como privado — nunca será indexado ou enviado ao LLM:

```typescript
// @private
const SECRET_KEY = process.env.SECRET_KEY;

<private>
// Nota interna: workaround para bug #4521
const INTERNAL_BYPASS = ['test@internal.corp'];
</private>
```

**Arquivos bloqueados automaticamente:** `.env`, `*.pem`, `*.key`, `secrets.*`, `credentials.*`

---

## Daemon

```bash
fire-code daemon start    # iniciar em background
fire-code daemon stop     # parar
fire-code daemon status   # verificar PID e saúde

# Dashboard disponível em:
open http://localhost:37778
```

---

## Configuração

Crie `firecode.config.ts` na raiz do projeto:

```typescript
import type { FireCodeConfig } from '@phmotad/fire-code';

export default {
  project: {
    name: 'meu-projeto',
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

### Provedores LLM

| Provedor | Variável de Ambiente | Modelo Padrão |
|---------|---------------------|---------------|
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` |
| `openai` | `OPENAI_API_KEY` | `gpt-4o` |
| `openrouter` | `OPENROUTER_API_KEY` | `deepseek/deepseek-coder` |
| `ollama` | _(nenhuma)_ | `codellama` |

---

## Comandos CLI

```bash
# Configuração
fire-code install               # instalar plugin (detecta IDE automaticamente)
fire-code install --ide cursor  # forçar IDE específico
fire-code uninstall             # remover plugin
fire-code init                  # assistente de configuração interativo
fire-code update                # atualizar para última versão

# Indexação
fire-code index                 # indexar projeto (modo lazy)
fire-code index --mode full     # re-indexação completa

# Corpus
fire-code corpus build          # construir corpus a partir de docs/
fire-code corpus prime          # adicionar entrada manualmente
fire-code corpus query <busca>  # pesquisar o corpus

# Daemon
fire-code daemon start          # iniciar daemon em background
fire-code daemon stop           # parar daemon
fire-code daemon status         # verificar status do daemon
```

---

## Contribuindo

Contribuições são bem-vindas! Fire Code é MIT e totalmente open source.

```bash
git clone https://github.com/phmotad/fire-code
cd fire-code
npm install
npm run build
npm test
```

---

## Licença

MIT © FireCode Contributors

---

<p align="center">
  Feito com ❤️ para a comunidade de agentes de codificação com IA.
</p>
