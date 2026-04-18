import simpleGit, { type SimpleGit, type StatusResult } from 'simple-git';
import type { GitConfig } from '../config/types.js';
import { GitError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import {
  formatCommitMessage,
  buildBranchName,
  type CommitOptions,
  type CommitType,
} from './CommitFormatter.js';

export interface GitStatus {
  isClean: boolean;
  current: string | null;
  modified: string[];
  created: string[];
  deleted: string[];
}

export class GitManager {
  private git: SimpleGit;
  private config: GitConfig;
  private cwd: string;

  constructor(cwd: string, config: GitConfig) {
    this.cwd = cwd;
    this.config = config;
    this.git = simpleGit(cwd);
  }

  async isRepo(): Promise<boolean> {
    try {
      await this.git.status();
      return true;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<GitStatus> {
    const status: StatusResult = await this.git.status();
    return {
      isClean: status.isClean(),
      current: status.current,
      modified: status.modified,
      created: status.created,
      deleted: status.deleted,
    };
  }

  async getCurrentBranch(): Promise<string | null> {
    const status = await this.git.status();
    return status.current;
  }

  async listBranches(): Promise<string[]> {
    const result = await this.git.branchLocal();
    return result.all;
  }

  async branchExists(name: string): Promise<boolean> {
    const branches = await this.listBranches();
    return branches.includes(name);
  }

  getBranchName(type: CommitType, description: string): string {
    return buildBranchName(this.config.branchPrefix, type, description);
  }

  async validateWorkingTree(): Promise<void> {
    const strategy = this.config.workingTree;
    const status = await this.getStatus();

    if (status.isClean) return;

    logger.debug({ strategy, modified: status.modified.length }, 'Working tree dirty, applying strategy');

    switch (strategy) {
      case 'ignore':
        return;

      case 'stash':
        try {
          await this.git.stash(['push', '-m', 'firecode: auto-stash before execution']);
          logger.info('Working tree stashed');
        } catch (err) {
          throw new GitError('Failed to stash working tree', { cause: String(err) });
        }
        return;

      case 'commit': {
        const files = [...status.modified, ...status.created, ...status.deleted];
        try {
          await this.git.add(files);
          await this.git.commit('chore: auto-commit before firecode execution [firecode]');
          logger.info('Working tree auto-committed');
        } catch (err) {
          throw new GitError('Failed to auto-commit working tree', { cause: String(err) });
        }
        return;
      }

      case 'fail':
        throw new GitError(
          `Working tree is dirty (${status.modified.length} modified files). Clean up before running.`,
          { modified: status.modified },
        );
    }
  }

  async createBranch(type: CommitType, description: string): Promise<string> {
    if (!this.config.autoBranch) {
      const current = await this.getCurrentBranch();
      return current ?? 'HEAD';
    }

    const baseName = this.getBranchName(type, description);
    const strategy = this.config.branchStrategy;

    if (!(await this.branchExists(baseName))) {
      await this.git.checkoutLocalBranch(baseName);
      logger.info({ branch: baseName }, 'Created new branch');
      return baseName;
    }

    switch (strategy) {
      case 'reuse':
        await this.git.checkout(baseName);
        logger.info({ branch: baseName }, 'Checked out existing branch');
        return baseName;

      case 'increment': {
        let counter = 2;
        let name = `${baseName}-${counter}`;
        while (await this.branchExists(name)) {
          counter++;
          name = `${baseName}-${counter}`;
        }
        await this.git.checkoutLocalBranch(name);
        logger.info({ branch: name }, 'Created incremented branch');
        return name;
      }

      case 'fail':
        throw new GitError(`Branch already exists: ${baseName}`, { branch: baseName });
    }
  }

  async commit(opts: Omit<CommitOptions, 'type'> & { type: CommitType }, files?: string[]): Promise<string> {
    const message = formatCommitMessage(opts, this.config);

    try {
      if (files && files.length > 0) {
        await this.git.add(files);
      } else {
        await this.git.add('.');
      }

      const result = await this.git.commit(message);
      logger.info({ commit: result.commit, summary: result.summary }, 'Committed changes');
      return result.commit;
    } catch (err) {
      throw new GitError('Failed to commit changes', { cause: String(err) });
    }
  }

  async unstash(): Promise<void> {
    try {
      await this.git.stash(['pop']);
    } catch (err) {
      logger.warn({ err: String(err) }, 'Failed to pop stash');
    }
  }
}
