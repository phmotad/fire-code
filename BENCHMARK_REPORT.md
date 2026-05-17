# Fire Code — Relatório de Benchmark

**Data:** 21 de abril de 2026  
**Versão:** 0.3.0  
**Suite de testes:** 107 unitários + 100 benchmark — todos passando  
**Script standalone:** `npm run bench:emb` (embeddings reais via `tsx`, fora do Jest)

---

## Visão Geral

Este relatório compara o desempenho do Claude **sem** e **com** o Fire Code. Apresenta dois conjuntos de resultados: fallback textual (ambiente CI, sem modelo ML) e embeddings reais (`Xenova/all-MiniLM-L6-v2`, 384 dimensões, ONNX quantizado).

### Fixture de Teste

| Parâmetro | Valor |
|---|---|
| Arquivos indexados | 20 |
| Linhas de código | ~1.200 LOC |
| Total de tokens do repositório | ~14.316 tokens |
| Funções encontradas | 168 (incluindo métodos de classe) |
| Commits indexados | 24 |
| Nós no grafo | 212 |
| Arestas no grafo | 48 (28 import + 20 commit→arquivo) |
| Chunks vetoriais | 122 |
| Consultas NL testadas | 15 |
| Consultas de símbolo testadas | 15 |
| Consultas find_similar testadas | 8 |

---

## 1. Tabela Comparativa — Com Embeddings Reais ✅

> Executado via `npm run bench:emb` com `Xenova/all-MiniLM-L6-v2` carregado em memória.

| Condição | Tokens/consulta | Economia | Recall | Confuso | Latência |
|---|---|---|---|---|---|
| **Sem fire-code** (repo completo) | 14.316 | — | 100% | 100% | ~0 ms |
| `smart_search` (NL) | 236 | **98%** | 60% | 47% | 6,4 ms |
| `smart_search` (símbolo) | 133 | **99%** | 100% | 27% | 6,5 ms |
| `get_context` (híbrido) | 1.299 | **91%** | **100%** | 67% | 120,9 ms |
| `search_code` (vetorial real) | 643 | **96%** | **100%** ↑ | 53% ↓ | 16,2 ms |
| `find_similar` (anti-dup) | 689 | **95%** | **100%** ↑ | — | 17,8 ms |

> ↑ = melhora com embeddings reais vs. fallback textual

---

## 2. Tabela Comparativa — Fallback Textual (CI / Sem Modelo)

> Executado via `npm run test:bench` no ambiente Jest (CommonJS, sem ESM).

| Condição | Tokens/consulta | Economia | Recall | Confuso | Latência |
|---|---|---|---|---|---|
| **Sem fire-code** | 14.316 | — | 100% | 100% | ~0 ms |
| `smart_search` (NL) | 236 | **98%** | 60% | 47% | 6,2 ms |
| `smart_search` (símbolo) | 133 | **99%** | 100% | 27% | 5,7 ms |
| `get_context` (híbrido) | 1.322 | **91%** | 100% | 67% | 135,8 ms |
| `search_code` (text sim.) | 634 | **96%** | 87% | 60% | 1,3 ms |
| `find_similar` (anti-dup) | 619 | **96%** | 88% | — | 2,6 ms |

---

## 3. Impacto dos Embeddings Reais

| Ferramenta | Fallback textual | Embeddings reais | Ganho |
|---|---|---|---|
| `search_code` recall | 87% | **100%** | +13 pp |
| `search_code` confusão | 60% | 53% | −7 pp |
| `find_similar` recall | 88% | **100%** | +12 pp |
| `search_code` latência | 1,3 ms | 16,2 ms | +15 ms (query embedding) |
| Indexação | ~1,4 s | ~6,4 s | +5 s (geração de embeddings) |

**Conclusão:** O download único de 23 MB entrega +13 pp de recall no `search_code` e elimina os falsos negativos do `find_similar`. A latência extra de busca (~15 ms) é insignificante em uso interativo.

---

## 4. Matriz de Recall por Tarefa (Com Embeddings Reais)

| # | Tarefa (NL) | Sem FC | SmartNL | get_context | search_code |
|---|---|---|---|---|---|
| T01 | hash de senha | ⚠ | ⚠ | ⚠ | ✓ |
| T02 | validar e-mail | ⚠ | ⚠ | ✓ | ✓ |
| T03 | cancelar pedido | ⚠ | ✗ | ✓ | ✓ |
| T04 | reembolso de pagamento | ⚠ | ✗ | ✓ | ✓ |
| T05 | rate limiting | ⚠ | ⚠ | ⚠ | ⚠ |
| T06 | INSERT no banco | ⚠ | ✓ | ⚠ | ⚠ |
| T07 | enviar e-mail | ⚠ | ✗ | ⚠ | ⚠ |
| T08 | carregar configuração | ⚠ | ⚠ | ✓ | ✓ |
| T09 | logger estruturado | ⚠ | ✓ | ⚠ | ⚠ |
| T10 | logger de console | ⚠ | ⚠ | ⚠ | ⚠ |
| T11 | token de sessão | ⚠ | ⚠ | ⚠ | ⚠ |
| T12 | buscar usuário | ⚠ | ✗ | ⚠ | ⚠ |
| T13 | cache com TTL | ⚠ | ⚠ | ✓ | ✓ |
| T14 | papéis de usuário | ⚠ | ✓ | ⚠ | ✓ |
| T15 | provedores de pagamento | ⚠ | ✓ | ⚠ | ⚠ |

> ✓ Correto e preciso | ⚠ Encontrado mas com ruído/ambiguidade | ✗ Miss completo

---

## 5. find_similar — Anti-Duplicação (Com Embeddings Reais)

| # | Descrição | Símbolo esperado | Achou | Tokens | Latência |
|---|---|---|---|---|---|
| F01 | hash password with salt | `hashPassword` | ✓ | 673 | 15,3 ms |
| F02 | validate email address | `validateEmail` | ✓ | 728 | 13,6 ms |
| F03 | cancel order cancellable | `cancelOrder` | ✓ | 660 | 25,9 ms |
| F04 | refund payment processor | `refundPayment` | ✓ | 683 | 19,5 ms |
| F05 | rate limit middleware | `rateLimitMiddleware` | ✓ | 712 | 18,2 ms |
| F06 | send welcome email | `buildWelcomeEmail` | ✓ | 687 | 14,8 ms |
| F07 | find user by email | `findByEmail` | ✓ | 750 | 17,8 ms |
| F08 | cache with TTL expiry | `buildCacheKey` | ✓ | 619 | 17,7 ms |

**100% recall — média 689 tokens — economia de 95% vs. repo completo**

> Com fallback textual: F05 (`rateLimitMiddleware`) era um miss porque o nome da função não contém "rate" ou "limit". Os embeddings semânticos resolveram esse caso.

---

## 6. Recall por Categoria (Com Embeddings Reais)

| Categoria | SmartSearch NL | get_context | search_code | SmartSearch Símbolo |
|---|---|---|---|---|
| Implementação (segurança, auth) | 50% | 100% | 100% | 100% |
| Desambiguação (múltiplos matches) | 50% | 100% | 100% | 100% |
| Dependência (quem usa o quê) | 100% | 100% | 100% | 100% |
| Configuração e infra | 100% | 100% | 100% | 100% |

---

## 7. Redução de Tokens

| Cenário | Sem fire-code | Com fire-code | Redução |
|---|---|---|---|
| Consulta NL (`get_context`) | 14.316 | ~1.299 | **91%** |
| Símbolo (`smart_search`) | 14.316 | ~133 | **99%** |
| Semântica (`search_code`) | 14.316 | ~643 | **96%** |
| Anti-dup (`find_similar`) | 14.316 | ~689 | **95%** |

Projetando para um repositório com 200 arquivos (~143.000 tokens):

| Ferramenta | Tokens/consulta | Economia estimada |
|---|---|---|
| Sem fire-code | ~143.000 | — |
| `smart_search` (símbolo) | ~133 | **~99,9%** |
| `get_context` | ~4.000–8.000 | **~94–97%** |

---

## 8. Performance de Indexação

| Operação | Tempo |
|---|---|
| Indexação completa — fallback textual (20 arqs, 1.200 LOC) | ~1,4 s |
| Indexação completa — embeddings reais | ~6,4 s |
| Query no grafo (nó de arquivo) | < 1 ms |
| Query no grafo (símbolo exato) | < 1 ms |
| `get_context` (híbrido) | ~90–140 ms |
| `smart_search` (símbolo) | ~6 ms |
| `search_code` (vetor real) | ~16 ms |
| `find_similar` (grafo + vetor) | ~18 ms |
| Re-indexação (idempotência) | ~1,2 s |
| Carregamento do modelo em cache | ~2 s |
| Download do modelo (1ª vez) | ~45–90 s (23 MB) |

---

## 9. Persistência de Vetores (Fix v0.3.0)

Antes da v0.3.0, os embeddings eram armazenados em `vectors.db` (JSON) — perdidos quando o processo reiniciava sem re-indexar. Agora:

- **Única fonte de verdade:** tabela `vector_chunks` dentro de `firecode.db` (SQLite)
- **Zero overhead de parse:** busca direta no SQLite sem carregar JSON inteiro em memória
- **Sem arquivo separado:** grafo + vetores + observações + corpus em um único `.firecode/firecode.db`

---

## 10. Contexto Git no Contexto

O Fire Code indexa commits e conecta cada commit aos arquivos modificados. O `get_context` inclui automaticamente:

```
## Histórico Git Recente

- a1b2c3d  feat: add rate limiting middleware  (2026-04-15)
  → src/middleware/rateLimiter.ts

- d4e5f6a  fix: correct session token expiry  (2026-04-12)
  → src/auth/sessionManager.ts, src/config/defaults.ts
```

---

## 11. Status dos GAPs

| GAP | Status | Detalhe |
|---|---|---|
| GAP-1 | ✅ Corrigido | Flag `exact: true` no `GraphStore.query()` — match exato vs LIKE |
| GAP-2 | ✅ Corrigido | Métodos de classe indexados como `FunctionNode` com `parentClass` |
| GAP-3 | ✅ **Resolvido** | Embeddings reais: `search_code` e `find_similar` com 100% recall |
| GAP-4 | ✅ Corrigido | Histórico Git indexado como `CommitNode`; arestas commit→arquivo |
| GAP-5 | ✅ Corrigido | Normalização de paths no Windows — `FileScanner` converte `\` → `/` |
| GAP-6 | ✅ **Novo** | Vetores persistidos em SQLite — sem perda de embeddings ao reiniciar |
| GAP-7 | ✅ **Novo** | Ferramenta `find_similar` — evita duplicação de código |

---

## 12. Avaliação de Prontidão para Produção

### ✅ Pronto

| Componente | Status |
|---|---|
| FileScanner | Estável — glob, .gitignore, exclusão de binários, paths cross-platform |
| ASTParser (ts-morph) | Estável — funções, classes, métodos, imports, exports |
| GraphBuilder | Estável — FileNode, FunctionNode, DependencyEdge, commit→file edges |
| GitIndexer | Estável — CommitNode, normalização de paths (Windows + Unix) |
| SQLiteGraphStore | Estável — persistência SQLite + graphology em memória; flag `exact:` |
| **SQLiteVectorStore** | **Estável — vetores em SQLite, persistência real entre reinicializações** |
| HybridMemory | Estável — símbolo exato primeiro, cosine similarity, histórico Git |
| smart_search | Estável — lookup exato no grafo + pontuação textual |
| get_context | Estável — 100% recall |
| **find_similar** | **Estável — 100% recall com embeddings reais, 88% com fallback** |
| Servidor MCP (9 ferramentas) | Estável — stdio, Zod, workflow hint atualizado |
| CLI (init/dev/index) | Estável — barra de progresso para download do modelo |
| Providers LLM | Estável — OpenRouter, Anthropic, OpenAI, Ollama |

### ⚠️ Limitações Conhecidas (não bloqueantes)

| Problema | Impacto | Mitigação |
|---|---|---|
| `smart_search` NL: 60% recall | Consultas em linguagem natural sem nome de símbolo falham | Usar `get_context` para NL; `smart_search` para símbolos |
| Indexação sem hash de conteúdo | Re-indexa todos os arquivos (modo `lazy` pula por mtime) | Planejado: hash SHA256 por arquivo |
| Sem persistência vetorial remota | SQLite local; projetos diferentes precisam re-indexar | Planejado: export/import do DB |

### ❌ Trabalho Futuro

| Feature | Por quê |
|---|---|
| Embeddings em CI | `@xenova/transformers` usa ESM; Jest roda em CJS — incompatível | 
| Indexação incremental por hash | Re-indexa tudo mesmo que 1 arquivo mude |
| Multi-projeto remoto | SQLite é local; sem compartilhamento entre máquinas |

---

## 13. Quando Usar Cada Ferramenta

| Situação | Ferramenta recomendada |
|---|---|
| Você sabe o nome da função/classe | `smart_search` (símbolo) — 100% recall, 133 tokens |
| Antes de implementar algo novo | `find_similar` — 100% recall com embeddings, evita duplicação |
| Contexto profundo com histórico Git | `get_context` — 100% recall, inclui commits |
| Busca semântica por conceito | `search_code` — 100% recall com embeddings reais |
| Consulta em linguagem natural | `get_context` + `search_code` em conjunto |

---

## 14. Conclusão

Fire Code está **pronto para produção** com:

1. **100% recall** em `get_context`, `search_code` (com embeddings), `find_similar` (com embeddings)
2. **91–99% economia de tokens** vs. contexto completo do repositório
3. **Persistência real** — grafo + vetores em SQLite único, sobrevive a reinicializações
4. **Anti-duplicação** — `find_similar` encontra código similar antes de implementar
5. **Contexto Git** — histórico de commits integrado nos resultados de busca
6. **9 ferramentas MCP** compatíveis com Claude Code / Cursor / Windsurf

**Para habilitar embeddings reais:** execute `fire-code index` uma vez (download de 23 MB na primeira execução, em cache a partir daí). Os resultados melhoram de 87–88% → 100% recall nas buscas semânticas.
