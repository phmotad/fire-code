import { FireCodeConfigSchema, type FireCodeConfig } from './types.js';

export function getDefaults(): FireCodeConfig {
  return FireCodeConfigSchema.parse({});
}
