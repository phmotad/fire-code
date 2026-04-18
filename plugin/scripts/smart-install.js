#!/usr/bin/env node
/**
 * Fire Code — smart-install.js
 * Runs on Setup/SessionStart: ensures Node >= 20 and fire-code is available.
 * Exits silently with continue=true so Claude Code is never blocked.
 */
'use strict';

const { execSync } = require('child_process');

function silentExit() {
  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
  process.exit(0);
}

try {
  const major = parseInt(process.versions.node.split('.')[0], 10);
  if (major < 20) {
    process.stderr.write('[fire-code] Node >= 20 required. Current: ' + process.versions.node + '\n');
    silentExit();
  }

  // Check if fire-code is accessible
  try {
    execSync('npx fire-code --version', { stdio: 'ignore', timeout: 10_000 });
  } catch {
    process.stderr.write('[fire-code] Warning: fire-code not found in PATH. Run: npx fire-code install\n');
  }

  silentExit();
} catch {
  silentExit();
}
