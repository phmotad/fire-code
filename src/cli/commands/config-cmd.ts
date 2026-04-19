import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

interface ConfigOpts {
  global?: boolean;
  cwd: string;
}

function configPath(isGlobal: boolean, cwd: string): string {
  return isGlobal
    ? join(homedir(), '.firecode', 'config.json')
    : join(cwd, '.firecode', 'config.json');
}

function readJson(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeJson(filePath: string, data: Record<string, unknown>): void {
  const dir = filePath.replace(/[/\\][^/\\]+$/, '');
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function parseValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  const num = Number(raw);
  if (!isNaN(num) && raw.trim() !== '') return num;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object') return parsed;
  } catch { /* not JSON */ }
  return raw;
}

function getNestedValue(obj: Record<string, unknown>, keyPath: string): unknown {
  return keyPath.split('.').reduce<unknown>((cur, k) => {
    if (cur === null || typeof cur !== 'object') return undefined;
    return (cur as Record<string, unknown>)[k];
  }, obj);
}

function setNestedValue(
  obj: Record<string, unknown>,
  keyPath: string,
  value: unknown,
): Record<string, unknown> {
  const keys = keyPath.split('.');
  const result = { ...obj };
  let node = result;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    node[k] = typeof node[k] === 'object' && node[k] !== null
      ? { ...(node[k] as Record<string, unknown>) }
      : {};
    node = node[k] as Record<string, unknown>;
  }
  node[keys[keys.length - 1]] = value;
  return result;
}

function deleteNestedValue(
  obj: Record<string, unknown>,
  keyPath: string,
): Record<string, unknown> {
  const keys = keyPath.split('.');
  const result = { ...obj };
  let node = result;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (typeof node[k] !== 'object' || !node[k]) return result;
    node[k] = { ...(node[k] as Record<string, unknown>) };
    node = node[k] as Record<string, unknown>;
  }
  delete node[keys[keys.length - 1]];
  return result;
}

function locationLabel(isGlobal: boolean): string {
  return isGlobal ? '~/.firecode/config.json' : '.firecode/config.json';
}

export function configGetCommand(key: string, opts: ConfigOpts): void {
  const path = configPath(opts.global ?? false, opts.cwd);
  const cfg = readJson(path);
  const value = getNestedValue(cfg, key);
  if (value === undefined) {
    console.log(chalk.gray('(not set)'));
  } else {
    console.log(JSON.stringify(value, null, 2));
  }
}

export function configSetCommand(key: string, value: string, opts: ConfigOpts): void {
  const path = configPath(opts.global ?? false, opts.cwd);
  const cfg = readJson(path);
  const parsed = parseValue(value);
  const updated = setNestedValue(cfg, key, parsed);
  writeJson(path, updated);
  console.log(
    chalk.green('✓') + ` ${chalk.bold(key)} = ${chalk.cyan(JSON.stringify(parsed))}` +
    chalk.gray(` → ${locationLabel(opts.global ?? false)}`),
  );
}

export function configUnsetCommand(key: string, opts: ConfigOpts): void {
  const path = configPath(opts.global ?? false, opts.cwd);
  if (!existsSync(path)) { console.log(chalk.gray('No config file found.')); return; }
  const cfg = readJson(path);
  writeJson(path, deleteNestedValue(cfg, key));
  console.log(
    chalk.green('✓') + ` ${chalk.bold(key)} unset` +
    chalk.gray(` from ${locationLabel(opts.global ?? false)}`),
  );
}

export function configListCommand(opts: ConfigOpts): void {
  if (opts.global) {
    const path = configPath(true, opts.cwd);
    console.log(chalk.bold('Global') + chalk.gray(' (~/.firecode/config.json)\n'));
    console.log(JSON.stringify(readJson(path), null, 2));
    return;
  }

  const globalCfg = readJson(configPath(true, opts.cwd));
  const projectCfg = readJson(configPath(false, opts.cwd));

  console.log(chalk.bold('Global') + chalk.gray(' (~/.firecode/config.json)'));
  console.log(JSON.stringify(globalCfg, null, 2));
  console.log();
  console.log(chalk.bold('Project') + chalk.gray(' (.firecode/config.json)'));
  console.log(JSON.stringify(projectCfg, null, 2));
}
