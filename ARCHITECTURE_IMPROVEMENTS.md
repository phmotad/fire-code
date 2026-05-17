# Melhorias Arquiteturais e Correções Necessárias - Fire Code

Este documento detalha os principais gargalos arquiteturais e estruturais encontrados no projeto **Fire Code**, juntamente com propostas de soluções modernas para tornar o software mais robusto, portável e eficiente.

## 1. Problemas de Instalação e Módulos Nativos (Build Nightmare)

**O Problema:**
O projeto depende de módulos que requerem compilação nativa em C/C++ (`better-sqlite3` e bindings do `tree-sitter` como `tree-sitter-javascript`). Em ambientes Windows sem "Build Tools" ou em contêineres Alpine Linux, o comando `npx fire-code install` ou `npm install` falhará durante a execução do `node-gyp`. Isso prejudica severamente a adoção da ferramenta e o princípio de "Quick Start".

**A Solução:**
- **Transição para WebAssembly (WASM):** Substituir os bindings nativos do tree-sitter pelo `web-tree-sitter`. Os arquivos `.wasm` são executados nativamente dentro do motor V8 (Node.js) em qualquer sistema operacional de forma isolada, eliminando a dependência de compiladores nativos.
- **Alternativas ao SQLite:** Trocar o `better-sqlite3` por um driver baseado em WASM ou JS puro, como o `sql.js` (com persistência OPFS ou file system) ou o `libsql` (do ecossistema Turso, que possui conectores muito leves e não requer compilação pesada do lado do cliente).

## 2. Gargalo de CPU com Embeddings Locais

**O Problema:**
O uso da biblioteca `@xenova/transformers` (Transformers.js) para rodar o modelo de embeddings `all-MiniLM-L6-v2` localmente permite operação offline, porém, o cálculo vetorial ocorre na *Thread principal* do Node.js. Indexar uma base de código com centenas de arquivos bloqueará o *Event Loop* do servidor/daemon local, elevando o uso de CPU e causando *Timeouts* de health check.

**A Solução:**
- **Web Workers:** Se a geração local for mantida, delegar o instanciamento e cálculo do Transformers.js para uma [Worker Thread](https://nodejs.org/api/worker_threads.html). Isso libera o processo principal para continuar respondendo às requisições do MCP.
- **Provider Híbrido:** Adicionar uma configuração no `firecode.config.ts` para permitir o uso de provedores remotos (ex: OpenAI `text-embedding-3-small` ou Anthropic). Sendo textos pequenos, chamadas de API são extremamente rápidas, baratas e não oneram a máquina do usuário final.

## 3. Dessincronização do Estado Local (State Desync)

**O Problema:**
Os metadados da base de dados e os vetores ficam salvos no diretório `.firecode/`. Se um desenvolvedor realizar operações bruscas de controle de versão (como um `git checkout` para uma branch antiga ou um `git reset --hard`), o código em disco será alterado drasticamente, mas o estado do banco continuará mapeando a versão anterior. O LLM usará um contexto obsoleto (causando alucinações técnicas).

**A Solução:**
- **Hashing/Fingerprinting de Estado:** Adicionar uma etapa de checagem no `firecode.get_context`. Antes de buscar no banco, a ferramenta deve ler um *hash* da árvore de trabalho atual (ex: `git rev-parse HEAD`). Se houver divergência considerável com o *hash* salvo no banco, a ferramenta deve avisar o Agente: *"O índice está desatualizado. Por favor, reindexe."* ou engatilhar uma re-indexação rápida em background.
- **Git Hooks Automatizados:** Na instalação, perguntar e adicionar um hook de `post-checkout` na pasta `.git/hooks/` do projeto alvo, permitindo que a CLI sincronize o índice automaticamente de forma silenciosa.

## 4. Caixa Preta e a "Inception" do Agente (`ExecutionEngine`)

**O Problema:**
Quando o Agente Host (ex: Claude Code) aciona a ferramenta `firecode.execute`, o sistema cria uma branch e passa a tarefa para um **sub-agente** (`CodeAgent`), isolando o processo. O LLM principal entra em compasso de espera. Se o `CodeAgent` falhar ou produzir código ruim, o Agente Host não acompanhou o raciocínio e recebe um pacote opaco, impedindo que atue proativamente para debugar e corrigir a rota passo a passo.

**A Solução:**
- **Abordagem de Scaffold (Apenas Infraestrutura):** Modificar ou adicionar um modo no `ExecutionEngine` onde ele atue apenas como preparador. Ele criaria a *feature branch*, retornaria o contexto crítico e instruiria o Agente Host principal: *"Ambiente criado com sucesso. Eis a arquitetura. Use suas ferramentas de escrita (EditFile) para codificar"*.
- **Transparência:** Se o `CodeAgent` for mantido, as saídas e pensamentos internos dele devem ser roteados diretamente de volta à interface do usuário ou logados de forma que o Agente Host consiga interpretar os logs de falha claramente.
