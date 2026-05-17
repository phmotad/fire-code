import { join, relative } from 'path';
import type { GraphStore, CommitNode, DependencyEdge } from '../graph/GraphStore.js';
import { GitManager } from '../git/GitManager.js';
import type { GitConfig } from '../config/types.js';
import { logger } from '../utils/logger.js';

export async function indexGitHistory(
  cwd: string,
  gitConfig: GitConfig,
  graphStore: GraphStore,
  maxCommits = 30,
): Promise<number> {
  const git = new GitManager(cwd, gitConfig);

  if (!(await git.isRepo())) return 0;

  try {
    const [commits, gitRoot] = await Promise.all([
      git.getRecentCommits(maxCommits),
      git.getRoot(),
    ]);

    if (commits.length === 0) return 0;

    for (const commit of commits) {
      // Normalize file paths: git returns paths relative to git root,
      // but FileNodes use paths relative to cwd (the project directory).
      const normalizedFiles: string[] = [];
      for (const gitFile of commit.filesChanged) {
        const absPath = join(gitRoot, gitFile);
        const relToCwd = relative(cwd, absPath).replace(/\\/g, '/');
        // Skip files outside the project directory
        if (!relToCwd.startsWith('..')) {
          normalizedFiles.push(relToCwd);
        }
      }

      const node: CommitNode = {
        id: `commit:${commit.sha}`,
        type: 'commit',
        label: commit.message.slice(0, 120),
        sha: commit.sha,
        message: commit.message,
        timestamp: commit.timestamp,
        filesChanged: normalizedFiles,
      };
      graphStore.addNode(node);

      // Edge: commit → file (only for files inside the project)
      for (const file of normalizedFiles) {
        const edge: DependencyEdge = {
          from: `commit:${commit.sha}`,
          to: `file:${file}`,
          type: 'changes',
          label: commit.message.slice(0, 72),
        };
        graphStore.addEdge(edge);
      }
    }

    logger.info({ count: commits.length }, 'Git history indexed');
    return commits.length;
  } catch (err) {
    logger.warn({ err: String(err) }, 'Git history indexing failed — skipping');
    return 0;
  }
}
