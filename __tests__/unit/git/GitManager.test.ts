import { GitManager } from '../../../src/git/GitManager';
import { GitError } from '../../../src/utils/errors';
import type { GitConfig } from '../../../src/config/types';

jest.mock('simple-git');

import simpleGit from 'simple-git';

const mockGit = {
  status: jest.fn(),
  branchLocal: jest.fn(),
  checkoutLocalBranch: jest.fn(),
  checkout: jest.fn(),
  stash: jest.fn(),
  add: jest.fn(),
  commit: jest.fn(),
};

(simpleGit as jest.Mock).mockReturnValue(mockGit);

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

function makeManager(overrides: Partial<GitConfig> = {}) {
  return new GitManager('/fake/cwd', { ...baseConfig, ...overrides });
}

function mockCleanStatus(branch = 'main') {
  mockGit.status.mockResolvedValue({
    isClean: () => true,
    current: branch,
    modified: [],
    created: [],
    deleted: [],
  });
}

function mockDirtyStatus() {
  mockGit.status.mockResolvedValue({
    isClean: () => false,
    current: 'main',
    modified: ['src/foo.ts'],
    created: [],
    deleted: [],
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GitManager.validateWorkingTree', () => {
  it('does nothing when tree is clean', async () => {
    mockCleanStatus();
    const gm = makeManager();
    await expect(gm.validateWorkingTree()).resolves.toBeUndefined();
  });

  it('stash strategy: calls git stash', async () => {
    mockDirtyStatus();
    mockGit.stash.mockResolvedValue(undefined);
    const gm = makeManager({ workingTree: 'stash' });
    await gm.validateWorkingTree();
    expect(mockGit.stash).toHaveBeenCalledWith(['push', '-m', 'firecode: auto-stash before execution']);
  });

  it('fail strategy: throws GitError when dirty', async () => {
    mockDirtyStatus();
    const gm = makeManager({ workingTree: 'fail' });
    await expect(gm.validateWorkingTree()).rejects.toBeInstanceOf(GitError);
  });

  it('ignore strategy: does nothing even when dirty', async () => {
    mockDirtyStatus();
    const gm = makeManager({ workingTree: 'ignore' });
    await expect(gm.validateWorkingTree()).resolves.toBeUndefined();
  });

  it('commit strategy: adds and commits dirty files', async () => {
    mockDirtyStatus();
    mockGit.add.mockResolvedValue(undefined);
    mockGit.commit.mockResolvedValue({ commit: 'abc123', summary: {} });
    const gm = makeManager({ workingTree: 'commit' });
    await gm.validateWorkingTree();
    expect(mockGit.add).toHaveBeenCalled();
    expect(mockGit.commit).toHaveBeenCalled();
  });
});

describe('GitManager.createBranch', () => {
  beforeEach(() => {
    mockGit.branchLocal.mockResolvedValue({ all: [] });
    mockGit.checkoutLocalBranch.mockResolvedValue(undefined);
  });

  it('creates new branch when it does not exist', async () => {
    mockCleanStatus();
    const gm = makeManager();
    const name = await gm.createBranch('feat', 'add login');
    expect(name).toBe('firecode/feat/add-login');
    expect(mockGit.checkoutLocalBranch).toHaveBeenCalledWith('firecode/feat/add-login');
  });

  it('reuse strategy: checks out existing branch', async () => {
    mockGit.branchLocal.mockResolvedValue({ all: ['firecode/feat/add-login'] });
    mockGit.checkout.mockResolvedValue(undefined);
    const gm = makeManager({ branchStrategy: 'reuse' });
    const name = await gm.createBranch('feat', 'add login');
    expect(name).toBe('firecode/feat/add-login');
    expect(mockGit.checkout).toHaveBeenCalledWith('firecode/feat/add-login');
  });

  it('fail strategy: throws when branch exists', async () => {
    mockGit.branchLocal.mockResolvedValue({ all: ['firecode/feat/add-login'] });
    const gm = makeManager({ branchStrategy: 'fail' });
    await expect(gm.createBranch('feat', 'add login')).rejects.toBeInstanceOf(GitError);
  });

  it('increment strategy: creates branch with suffix', async () => {
    mockGit.branchLocal.mockResolvedValue({ all: ['firecode/feat/add-login'] });
    mockGit.checkoutLocalBranch.mockResolvedValue(undefined);
    const gm = makeManager({ branchStrategy: 'increment' });
    const name = await gm.createBranch('feat', 'add login');
    expect(name).toBe('firecode/feat/add-login-2');
  });
});

describe('GitManager.commit', () => {
  it('stages and commits files', async () => {
    mockGit.add.mockResolvedValue(undefined);
    mockGit.commit.mockResolvedValue({ commit: 'abc123', summary: { changes: 1 } });
    const gm = makeManager();
    const sha = await gm.commit({ type: 'feat', description: 'add feature' });
    expect(sha).toBe('abc123');
    expect(mockGit.add).toHaveBeenCalledWith('.');
  });

  it('stages specific files when provided', async () => {
    mockGit.add.mockResolvedValue(undefined);
    mockGit.commit.mockResolvedValue({ commit: 'def456', summary: {} });
    const gm = makeManager();
    await gm.commit({ type: 'fix', description: 'fix bug' }, ['src/a.ts']);
    expect(mockGit.add).toHaveBeenCalledWith(['src/a.ts']);
  });
});
