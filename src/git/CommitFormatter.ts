import type { GitConfig } from '../config/types.js';

export type CommitType = 'feat' | 'fix' | 'refactor' | 'docs' | 'chore' | 'test' | 'style';

export interface CommitMetadata {
  taskId?: string;
  agent?: string;
  durationMs?: number;
  filesChanged?: string[];
}

export interface CommitOptions {
  type: CommitType;
  scope?: string;
  description: string;
  body?: string;
  metadata?: CommitMetadata;
}

export function formatCommitMessage(opts: CommitOptions, config: GitConfig): string {
  if (config.commitFormat === 'simple') {
    return opts.description;
  }

  const scope = opts.scope ? `(${opts.scope})` : '';
  const header = `${opts.type}${scope}: ${opts.description}`;

  const parts: string[] = [header];

  if (opts.body) {
    parts.push('', opts.body);
  }

  if (config.includeMetadata && opts.metadata) {
    const meta = opts.metadata;
    const lines: string[] = [];

    if (meta.taskId) lines.push(`firecode-task-id: ${meta.taskId}`);
    if (meta.agent) lines.push(`firecode-agent: ${meta.agent}`);
    if (meta.durationMs !== undefined) lines.push(`firecode-duration: ${meta.durationMs}ms`);
    if (meta.filesChanged?.length) {
      lines.push(`firecode-files: ${meta.filesChanged.join(', ')}`);
    }

    if (lines.length > 0) {
      parts.push('', lines.join('\n'));
    }
  }

  return parts.join('\n');
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)
    .replace(/^-|-$/g, '');
}

export function buildBranchName(prefix: string, type: string, description: string): string {
  const slug = slugify(description);
  return `${prefix}${type}/${slug}`;
}
