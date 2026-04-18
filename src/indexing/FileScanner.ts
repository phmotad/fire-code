import { glob } from 'glob';
import { readFileSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import type { IndexingConfig } from '../config/types.js';

export interface ScannedFile {
  path: string;
  relativePath: string;
  content: string;
  size: number;
  extension: string;
}

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.eot',
  '.zip', '.tar', '.gz', '.exe', '.dll', '.so',
  '.pdf', '.doc', '.docx',
  '.mp3', '.mp4', '.avi',
]);

function parseGitignore(cwd: string): string[] {
  const gitignorePath = join(cwd, '.gitignore');
  if (!existsSync(gitignorePath)) return [];
  return readFileSync(gitignorePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => (line.endsWith('/') ? `${line}**` : line));
}

export async function scanFiles(cwd: string, config: IndexingConfig): Promise<ScannedFile[]> {
  const gitignorePatterns = parseGitignore(cwd);
  const ignore = [...config.exclude, ...gitignorePatterns];

  const paths = await glob(config.include, {
    cwd,
    ignore,
    absolute: false,
    nodir: true,
  });

  const files: ScannedFile[] = [];

  for (const relPath of paths) {
    const absPath = join(cwd, relPath);
    const ext = relPath.slice(relPath.lastIndexOf('.'));

    if (BINARY_EXTENSIONS.has(ext)) continue;

    try {
      const stat = statSync(absPath);
      if (stat.size > config.maxFileSize) continue;

      const content = readFileSync(absPath, 'utf8');
      files.push({
        path: absPath,
        relativePath: relPath,
        content,
        size: stat.size,
        extension: ext,
      });
    } catch {
      // skip unreadable files
    }
  }

  return files;
}
