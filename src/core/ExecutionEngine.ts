import { randomUUID } from 'crypto';
import { basename } from 'path';
import type { FireCodeConfig } from '../config/types.js';
import type { LLMProvider } from '../providers/LLMProvider.js';
import { HybridMemory } from '../memory/HybridMemory.js';
import { FallbackMemory } from '../memory/FallbackMemory.js';
import { DatabaseManager } from '../db/DatabaseManager.js';
import { MemoryVectorStore } from '../vector/MemoryVectorStore.js';
import { GitManager } from '../git/GitManager.js';
import { CodeAgent } from '../agents/CodeAgent.js';
import { classifyTask, type TaskType } from './TaskRouter.js';
import type { CommitType, AgentRole } from '../git/CommitFormatter.js';

function toCommitType(t: TaskType): CommitType {
  return t === 'feature' ? 'feat' : t;
}
import { logger } from '../utils/logger.js';
import { existsSync, readFileSync } from 'fs';
import { getFireCodeDir, getVectorsPath } from '../utils/paths.js';
import type { AgentResult } from '../agents/BaseAgent.js';

export interface ExecuteOptions {
  task: string;
  type?: TaskType;
  mode?: 'safe' | 'aggressive';
  cwd?: string;
  agentRole?: AgentRole;
}

export interface ExecutionResult extends AgentResult {
  branch?: string;
  commit?: string;
}

function getProjectName(cwd: string): string {
  try {
    const pkg = JSON.parse(readFileSync(require('path').join(cwd, 'package.json'), 'utf8')) as { name?: string };
    return pkg.name ?? basename(cwd);
  } catch { return basename(cwd); }
}

export class ExecutionEngine {
  private vectorStore: MemoryVectorStore;
  private memory: HybridMemory | FallbackMemory;
  private agent: CodeAgent;
  private cwd: string;
  private git: GitManager;

  constructor(
    private readonly config: FireCodeConfig,
    private readonly provider: LLMProvider,
    cwd?: string,
  ) {
    this.cwd = cwd ?? process.cwd();
    this.git = new GitManager(this.cwd, config.git);
    this.vectorStore = new MemoryVectorStore();

    const project = getProjectName(this.cwd);
    const firedotDir = getFireCodeDir(this.cwd);
    const db = DatabaseManager.getInstance(firedotDir);
    const graphStore = db.getGraphStore(project);

    // Load persisted vectors
    const vectorsPath = getVectorsPath(this.cwd);
    if (existsSync(vectorsPath)) {
      try {
        this.vectorStore = MemoryVectorStore.deserialize(readFileSync(vectorsPath, 'utf8'));
        logger.debug({ size: this.vectorStore.size() }, 'Loaded persisted vectors');
      } catch { /* start fresh */ }
    }

    const hasData = this.vectorStore.size() > 0;
    if (hasData || config.memory.strategy !== 'auto') {
      this.memory = new HybridMemory(this.vectorStore, graphStore);
    } else {
      this.memory = new FallbackMemory(this.cwd);
    }

    this.agent = new CodeAgent(this.provider, this.memory as HybridMemory, config);
  }

  async run(opts: ExecuteOptions): Promise<ExecutionResult> {
    const taskId = randomUUID();
    const taskType = opts.type ?? classifyTask(opts.task);

    logger.info({ taskId, type: taskType, task: opts.task.slice(0, 100) }, 'Execution started');

    if (this.config.git.enabled && await this.git.isRepo()) {
      await this.git.validateWorkingTree();
    }

    let branch: string | undefined;
    if (this.config.git.enabled && await this.git.isRepo()) {
      branch = await this.git.createBranch(toCommitType(taskType), opts.task, opts.agentRole);
      logger.info({ branch, agentRole: opts.agentRole }, 'Branch created/switched');
    }

    const result = await this.agent.execute({
      id: taskId,
      description: opts.task,
      type: taskType,
      mode: opts.mode ?? this.config.execution.mode,
    });

    let commit: string | undefined;
    if (
      result.success &&
      result.changes.length > 0 &&
      this.config.git.autoCommit &&
      !this.config.execution.dryRun &&
      await this.git.isRepo()
    ) {
      const changedFiles = result.changes
        .filter((c) => c.operation !== 'delete')
        .map((c) => c.path);

      commit = await this.git.commit(
        {
          type: toCommitType(taskType),
          description: opts.task.slice(0, 70),
          metadata: {
            taskId,
            agent: 'CodeAgent',
            agentRole: opts.agentRole,
            durationMs: result.durationMs,
            filesChanged: changedFiles,
          },
        },
        changedFiles,
      );
      logger.info({ commit }, 'Changes committed');
    }

    return { ...result, branch, commit };
  }
}
