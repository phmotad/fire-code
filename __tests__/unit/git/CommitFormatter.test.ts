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
  it('builds branch name without agent role', () => {
    expect(buildBranchName('firecode/', 'feat', 'Add user auth')).toBe('firecode/feat/add-user-auth');
  });

  it('builds branch name with supervisor role', () => {
    expect(buildBranchName('firecode/', 'feat', 'Auth flow redesign', 'supervisor'))
      .toBe('firecode/supervisor/feat/auth-flow-redesign');
  });

  it('builds branch name with dev role', () => {
    expect(buildBranchName('firecode/', 'fix', 'Null user guard', 'dev'))
      .toBe('firecode/dev/fix/null-user-guard');
  });

  it('builds branch name with review role', () => {
    expect(buildBranchName('firecode/', 'chore', 'Security audit', 'review'))
      .toBe('firecode/review/chore/security-audit');
  });

  it('omits agent segment when role is undefined', () => {
    const name = buildBranchName('firecode/', 'refactor', 'Extract auth service', undefined);
    expect(name).toBe('firecode/refactor/extract-auth-service');
    expect(name).not.toContain('undefined');
  });
});

describe('formatCommitMessage with agentRole in metadata', () => {
  it('includes agentRole in metadata when provided', () => {
    const msg = formatCommitMessage(
      {
        type: 'feat',
        description: 'new feature',
        metadata: { taskId: 'task-1', agent: 'CodeAgent', agentRole: 'dev', durationMs: 800 },
      },
      baseConfig,
    );
    expect(msg).toContain('firecode-task-id: task-1');
    expect(msg).toContain('firecode-agent: CodeAgent');
  });
});
