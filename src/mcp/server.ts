import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from '../config/loader.js';
import { createProvider } from '../providers/ProviderFactory.js';
import { ExecuteInputSchema, executeTool } from './tools/execute.js';
import { GetContextInputSchema, getContextTool } from './tools/get_context.js';
import { SearchCodeInputSchema, searchCodeTool } from './tools/search_code.js';
import { GetGraphInputSchema, getGraphTool } from './tools/get_graph.js';
import { SmartOutlineInputSchema, smartOutlineTool } from './tools/smart_outline.js';
import { SmartSearchInputSchema, smartSearchTool } from './tools/smart_search.js';
import { ObservationsInputSchema, observationsTool } from './tools/observations.js';
import { CorpusSearchInputSchema, corpusSearchTool } from './tools/corpus_search.js';
import { logger } from '../utils/logger.js';
import { toFireCodeError } from '../utils/errors.js';
import { zodToJsonSchema } from '../utils/zodToJsonSchema.js';

export async function startMcpServer(cwd: string = process.cwd()): Promise<void> {
  const config = await loadConfig(cwd);
  const provider = createProvider(config.llm);

  const server = new Server(
    { name: 'fire-code', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      // ── Progressive disclosure hint ─────────────────────────────────────
      {
        name: 'firecode.__workflow',
        description: `RECOMMENDED WORKFLOW (token-efficient):
1. firecode.smart_search(query) → find files/symbols (compact index)
2. firecode.smart_outline(file_path) → see all symbols in a file (folded view)
3. firecode.get_context(query) → semantic + graph context for a task
4. firecode.corpus_search(query) → search project docs/decisions/architecture notes
5. firecode.get_graph(filter) → dependency relationships
6. firecode.observations(query) → history of what was built/fixed/decided
7. firecode.execute(task) → make changes with Git traceability
Never call execute without first calling get_context or smart_search.
Private content (<private>…</private>) is automatically redacted.`,
        inputSchema: { type: 'object', properties: {} },
      },

      // ── Tier 1: Fast structural tools (no embedding needed) ────────────
      {
        name: 'firecode.smart_search',
        description: 'Search codebase for symbols, functions, and content. Returns compact index with file:line references. Use first to orient.',
        inputSchema: zodToJsonSchema(SmartSearchInputSchema),
      },
      {
        name: 'firecode.smart_outline',
        description: 'Get structural outline of a file — all functions, classes, methods, types with signatures. Much cheaper than reading the full file.',
        inputSchema: zodToJsonSchema(SmartOutlineInputSchema),
      },

      // ── Tier 2: Memory tools (require indexed project) ──────────────────
      {
        name: 'firecode.get_context',
        description: 'Retrieve relevant code context for a task using hybrid vector+graph memory. Requires: fire-code index to have been run.',
        inputSchema: zodToJsonSchema(GetContextInputSchema),
      },
      {
        name: 'firecode.search_code',
        description: 'Semantic search over the indexed codebase. Returns top-K relevant code snippets with scores.',
        inputSchema: zodToJsonSchema(SearchCodeInputSchema),
      },
      {
        name: 'firecode.get_graph',
        description: 'Query the structural dependency graph. Returns nodes (files, functions) and edges (imports, calls).',
        inputSchema: zodToJsonSchema(GetGraphInputSchema),
      },

      // ── Tier 2b: Memory history ──────────────────────────────────────────
      {
        name: 'firecode.observations',
        description: 'Search observation history — what was built, fixed, decided. Use query to search, ids[] to fetch full details (3-step: search → review IDs → get_by_ids).',
        inputSchema: zodToJsonSchema(ObservationsInputSchema),
      },

      // ── Tier 2c: Knowledge Corpus ────────────────────────────────────────
      {
        name: 'firecode.corpus_search',
        description: 'Search the project knowledge corpus — indexed docs, decisions, architecture notes. Run fire-code corpus build to populate.',
        inputSchema: zodToJsonSchema(CorpusSearchInputSchema),
      },

      // ── Tier 3: Execution (always last) ─────────────────────────────────
      {
        name: 'firecode.execute',
        description: 'Execute a coding task: creates Git branch, retrieves context, runs CodeAgent, commits changes. Always call get_context first.',
        inputSchema: zodToJsonSchema(ExecuteInputSchema),
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.debug({ tool: name }, 'Tool called');

    try {
      let result: string;

      switch (name) {
        case 'firecode.__workflow':
          result = 'See tool description for the recommended workflow.';
          break;

        case 'firecode.smart_search': {
          const input = SmartSearchInputSchema.parse(args);
          result = await smartSearchTool(input, cwd);
          break;
        }
        case 'firecode.smart_outline': {
          const input = SmartOutlineInputSchema.parse(args);
          result = await smartOutlineTool(input, cwd);
          break;
        }
        case 'firecode.get_context': {
          const input = GetContextInputSchema.parse(args);
          result = await getContextTool(input, cwd);
          break;
        }
        case 'firecode.search_code': {
          const input = SearchCodeInputSchema.parse(args);
          result = await searchCodeTool(input, cwd);
          break;
        }
        case 'firecode.observations': {
          const input = ObservationsInputSchema.parse(args);
          result = await observationsTool(input, cwd);
          break;
        }
        case 'firecode.get_graph': {
          const input = GetGraphInputSchema.parse(args);
          result = await getGraphTool(input, cwd);
          break;
        }
        case 'firecode.corpus_search': {
          const input = CorpusSearchInputSchema.parse(args);
          result = await corpusSearchTool(input, cwd);
          break;
        }
        case 'firecode.execute': {
          const input = ExecuteInputSchema.parse(args);
          result = await executeTool(input, config, provider, cwd);
          break;
        }
        default:
          result = JSON.stringify({ error: `Unknown tool: ${name}` });
      }

      return { content: [{ type: 'text', text: result }] };
    } catch (err) {
      const e = toFireCodeError(err);
      logger.error({ tool: name, error: e.message }, 'Tool execution failed');
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: e.message, code: e.code }) }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info({ provider: config.llm.provider, model: config.llm.model }, 'Fire Code MCP server started');
}
