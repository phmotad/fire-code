import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { FireCodeConfigSchema, type FireCodeConfig } from './types.js';
import { ConfigError } from '../utils/errors.js';

// Priority order for project-level config (relative to cwd)
const PROJECT_CONFIG_PATHS = [
  join('.firecode', 'config.json'), // canonical location
  'firecode.config.json',           // legacy root-level
  '.firecoderc.json',               // legacy
  '.firecoderc',                    // legacy
];

// Names looked up inside ~/.firecode/
const GLOBAL_CONFIG_NAMES = [
  'config.json',          // canonical: ~/.firecode/config.json
  'firecode.config.json', // legacy
  '.firecoderc.json',     // legacy
];

function loadJson(filePath: string): Partial<FireCodeConfig> {
  try {
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as Partial<FireCodeConfig>;
  } catch (err) {
    throw new ConfigError(`Failed to parse JSON config at ${filePath}`, { cause: String(err) });
  }
}

async function findAndLoadConfig(cwd: string): Promise<Partial<FireCodeConfig>> {
  for (const relPath of PROJECT_CONFIG_PATHS) {
    const filePath = join(cwd, relPath);
    if (!existsSync(filePath)) continue;
    return loadJson(filePath);
  }
  return {};
}

async function loadGlobalConfig(): Promise<Partial<FireCodeConfig>> {
  const globalDir = join(homedir(), '.firecode');
  for (const name of GLOBAL_CONFIG_NAMES) {
    const filePath = join(globalDir, name);
    if (!existsSync(filePath)) continue;
    return loadJson(filePath);
  }
  return {};
}

function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override) as (keyof T)[]) {
    const overrideVal = override[key];
    const baseVal = base[key];
    if (
      overrideVal !== null &&
      typeof overrideVal === 'object' &&
      !Array.isArray(overrideVal) &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(baseVal as Record<string, unknown>, overrideVal as Record<string, unknown>) as T[keyof T];
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal as T[keyof T];
    }
  }
  return result;
}

export async function loadConfig(cwd: string = process.cwd()): Promise<FireCodeConfig> {
  const globalRaw = await loadGlobalConfig();
  const localRaw = await findAndLoadConfig(cwd);
  const merged = deepMerge(globalRaw as Record<string, unknown>, localRaw as Record<string, unknown>);

  const result = FireCodeConfigSchema.safeParse(merged);
  if (!result.success) {
    throw new ConfigError('Invalid configuration', {
      issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }
  return result.data;
}
