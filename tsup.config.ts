import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'cli/index': 'src/cli/index.ts',
    'index': 'src/index.ts',
  },
  format: ['cjs'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  dts: true,
  sourcemap: true,
  shims: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
