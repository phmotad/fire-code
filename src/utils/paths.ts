import { homedir } from 'os';
import { join, resolve, relative, isAbsolute } from 'path';
import { existsSync, mkdirSync } from 'fs';

export const FIRECODE_DIR = '.firecode';
export const GLOBAL_CONFIG_DIR = join(homedir(), '.firecode');

export function getFireCodeDir(cwd: string): string {
  return join(cwd, FIRECODE_DIR);
}

export function ensureFireCodeDir(cwd: string): string {
  const dir = getFireCodeDir(cwd);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getGraphPath(cwd: string): string {
  return join(getFireCodeDir(cwd), 'graph.json');
}

export function getVectorsPath(cwd: string): string {
  return join(getFireCodeDir(cwd), 'vectors.db');
}

export function getBootstrapLogPath(cwd: string): string {
  return join(getFireCodeDir(cwd), 'bootstrap.log');
}

export function resolveFromCwd(cwd: string, filePath: string): string {
  if (isAbsolute(filePath)) return filePath;
  return resolve(cwd, filePath);
}

export function relativeFromCwd(cwd: string, filePath: string): string {
  return relative(cwd, filePath);
}
