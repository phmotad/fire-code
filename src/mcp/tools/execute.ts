import { z } from 'zod';
import { ExecutionEngine } from '../../core/ExecutionEngine.js';
import type { FireCodeConfig } from '../../config/types.js';
import type { LLMProvider } from '../../providers/LLMProvider.js';
import type { AgentRole } from '../../git/CommitFormatter.js';
import { toFireCodeError } from '../../utils/errors.js';

export const ExecuteInputSchema = z.object({
  task: z.string().min(1).describe('Task description for the coding agent'),
  type: z.enum(['feature', 'fix', 'refactor', 'docs']).optional().describe('Task type (auto-detected if omitted)'),
  mode: z.enum(['safe', 'aggressive']).optional().describe('Execution mode'),
  agent: z.enum(['supervisor', 'dev', 'review']).optional().describe(
    'Agent role — sets branch prefix: firecode/supervisor/*, firecode/dev/*, firecode/review/*',
  ),
});

export type ExecuteInput = z.infer<typeof ExecuteInputSchema>;

export async function executeTool(
  input: ExecuteInput,
  config: FireCodeConfig,
  provider: LLMProvider,
  cwd: string,
): Promise<string> {
  try {
    const engine = new ExecutionEngine(config, provider, cwd);
    const result = await engine.run({
      task: input.task,
      type: input.type,
      mode: input.mode,
      cwd,
      agentRole: input.agent as AgentRole | undefined,
    });

    return JSON.stringify({
      success: result.success,
      taskId: result.taskId,
      explanation: result.explanation,
      changes: result.changes.map((c) => ({ path: c.path, operation: c.operation })),
      branch: result.branch,
      commit: result.commit,
      durationMs: result.durationMs,
      error: result.error,
    }, null, 2);
  } catch (err) {
    const e = toFireCodeError(err);
    return JSON.stringify({ success: false, error: e.message, code: e.code }, null, 2);
  }
}
