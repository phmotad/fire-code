import chalk from 'chalk';
import { startMcpServer } from '../../mcp/server.js';
import { loadConfig } from '../../config/loader.js';

export async function devCommand(cwd: string = process.cwd()): Promise<void> {
  const config = await loadConfig(cwd);

  process.stderr.write(
    chalk.red.bold('\n🔥 Fire Code MCP Server\n') +
    chalk.gray(`   Provider: ${config.llm.provider} / ${config.llm.model}\n`) +
    chalk.gray(`   Working dir: ${cwd}\n`) +
    chalk.gray(`   Memory: ${config.memory.strategy}\n`) +
    chalk.gray(`   Git: ${config.git.enabled ? 'enabled' : 'disabled'}\n\n`) +
    chalk.dim('   Listening on stdio...\n\n'),
  );

  await startMcpServer(cwd);
}
