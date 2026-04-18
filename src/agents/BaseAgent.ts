import type { LLMProvider } from '../providers/LLMProvider.js';
import type { HybridMemory } from '../memory/HybridMemory.js';
import type { FireCodeConfig } from '../config/types.js';
import { logger } from '../utils/logger.js';

export interface AgentTask {
  id: string;
  description: string;
  type: 'feature' | 'fix' | 'refactor' | 'docs';
  mode?: 'safe' | 'aggressive';
  context?: string;
}

export interface FileChange {
  path: string;
  content: string;
  operation: 'create' | 'modify' | 'delete';
}

export interface AgentResult {
  taskId: string;
  success: boolean;
  changes: FileChange[];
  explanation: string;
  durationMs: number;
  error?: string;
}

export abstract class BaseAgent {
  constructor(
    protected readonly provider: LLMProvider,
    protected readonly memory: HybridMemory,
    protected readonly config: FireCodeConfig,
  ) {}

  abstract execute(task: AgentTask): Promise<AgentResult>;

  protected log(msg: string, data?: Record<string, unknown>): void {
    logger.debug({ agent: this.constructor.name, ...data }, msg);
  }
}
