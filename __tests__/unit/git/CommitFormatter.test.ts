import { formatCommitMessage, slugify, buildBranchName } from '../../../src/git/CommitFormatter';
import type { GitConfig } from '../../../src/config/types';

const baseConfig: GitConfig = {
  enabled: true,
  autoBranch: true,
  branchPrefix: 'firecode/',
  branchStrategy: 'reuse',
  autoCommit: true,
  commitFormat: 'conventional',
  includeMetadata: true,
  workingTree: 'stash',
  enforcePattern: false,
};

describe('formatCommitMessage', () => {
  it('creates conventional commit header', () => {
    const msg = formatCommitMessage({ type: 'feat', description: 'add login' }, baseConfig);
    expect(msg).toMatch(/^feat: add login/);
  });

  it('includes scope when provided', () => {
    const msg = formatCommitMessage({ type: 'fix', scope: 'auth', description: 'fix token' }, baseConfig);
    expect(msg).toMatch(/^fix\(auth\): fix token/);
  });

  it('includes metadata block when enabled', () => {
    const msg = formatCommitMessage(
      {
        type: 'feat',
        description: 'new feature',
        metadata: { taskId: 'task-1', agent: 'CodeAgent', durationMs: 1500 },
      },
      baseConfig,
    );
    expect(msg).toContain('firecode-task-id: task-1');
    expect(msg).toContain('firecode-agent: CodeAgent');
    expect(msg).toContain('firecode-duration: 1500ms');
  });

  it('omits metadata when includeMetadata=false', () => {
    const cfg = { ...baseConfig, includeMetadata: false };
    const msg = formatCommitMessage(
      { type: 'feat', description: 'x', metadata: { taskId: '1' } },
      cfg,
    );
    expect(msg).not.toContain('firecode-task-id');
  });

  it('uses simple format when configured', () => {
    const cfg = { ...baseConfig, commitFormat: 'simple' as const };
    const msg = formatCommitMessage({ type: 'feat', description: 'simple msg' }, cfg);
    expect(msg).toBe('simple msg');
  });

  it('includes files changed list', () => {
    const msg = formatCommitMessage(
      { type: 'feat', description: 'x', metadata: { filesChanged: ['a.ts', 'b.ts'] } },
      baseConfig,
    );
    expect(msg).toContain('firecode-files: a.ts, b.ts');
  });
});

describe('slugify', () => {
  it('converts to lowercase slug', () => {
    expect(slugify('Add JWT Authentication')).toBe('add-jwt-authentication');
  });

  it('removes special characters', () => {
    expect(slugify('fix: bug #123!')).toBe('fix-bug-123');
  });

  it('trims to 50 chars', () => {
    const long = 'a'.repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(50);
  });
});

describe('buildBranchName', () => {
  it('builds correct branch name', () => {
    expect(buildBranchName('firecode/', 'feature', 'Add user auth')).toBe('firecode/feature/add-user-auth');
  });
});
