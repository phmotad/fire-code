import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createRequire } from 'module';
import { FireCodeConfigSchema, type FireCodeConfig } from './types.js';
import { ConfigError } from '../utils/errors.js';

const CONFIG_FILES = [
  'firecode.config.ts',
  'firecode.config.js',
  'firecode.config.json',
  '.firecoderc.json',
  '.firecoderc',
];

async function loadTsOrJs(filePath: string): Promise<Partial<FireCodeConfig>> {
  try {
    const req = createRequire(filePath);
    // For .ts files compiled to .js during build, or .js directly
    const mod = req(filePath) as { default?: Partial<FireCodeConfig> } | Partial<FireCodeConfig>;
    if (mod && typeof mod === 'object' && 'default' in mod && mod.default) {
      return mod.default;
    }
    return mod as Partial<FireCodeConfig>;
  } catch {
    throw new ConfigError(`Failed to load config from ${filePath}`);
  }
}

function loadJson(filePath: string): Partial<FireCodeConfig> {
  try {
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as Partial<FireCodeConfig>;
  } catch (err) {
    throw new ConfigError(`Failed to parse JSON config at ${filePath}`, { cause: String(err) });
  }
}

async function findAndLoadConfig(cwd: string): Promise<Partial<FireCodeConfig>> {
  for (const fileName of CONFIG_FILES) {
    const filePath = join(cwd, fileName);
    if (!existsSync(filePath)) continue;

    if (fileName.endsWith('.json') || fileName === '.firecoderc') {
      return loadJson(filePath);
    }
    return loadTsOrJs(filePath);
  }
  return {};
}

async function loadGlobalConfig(): Promise<Partial<FireCodeConfig>> {
  const globalDir = join(homedir(), '.firecode');
  for (const fileName of CONFIG_FILES) {
    const filePath = join(globalDir, fileName);
    if (!existsSync(filePath)) continue;
    if (fileName.endsWith('.json') || fileName === '.firecoderc') {
      return loadJson(filePath);
    }
    return loadTsOrJs(filePath);
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
