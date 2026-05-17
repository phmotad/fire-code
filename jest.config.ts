import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        module: 'CommonJS',
        moduleResolution: 'Node',
      },
    }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    // Entry points and CLI wiring — covered by integration/e2e
    '!src/cli/**',
    // Requires a running HTTP/socket server — integration only
    '!src/daemon/**',
    // MCP server wiring + tools require full MCP protocol setup
    '!src/mcp/server.ts',
    '!src/mcp/tools/**',
    // LLM providers need live API keys — not unit-testable
    '!src/providers/AnthropicProvider.ts',
    '!src/providers/OpenAIProvider.ts',
    '!src/providers/OllamaProvider.ts',
    '!src/providers/OpenRouterProvider.ts',
    '!src/providers/AgentSDKProvider.ts',
    // Thin service wrappers — tested indirectly via integration
    '!src/services/**',
    // Worker thread script — only runs inside a compiled Worker, not in Jest
    '!src/workers/**',
  ],
  coverageThreshold: {
    global: {
      lines: 40,
      branches: 30,
    },
  },
  coverageReporters: ['text', 'lcov'],
  testTimeout: 15000,
};

export default config;
