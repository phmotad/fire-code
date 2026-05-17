import { existsSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';

const BEGIN_MARKER = '# BEGIN fire-code';
const END_MARKER = '# END fire-code';

// The hook runs after every `git checkout`. It re-indexes silently in the
// background only when switching branches and the index exists.
function buildHookContent(): string {
  return `${BEGIN_MARKER}
# Fire Code — post-checkout hook (auto re-index on branch switch)
_prev="$1"
_new="$2"
_branch="$3"
if [ "$_branch" = "1" ] && [ "$_prev" != "$_new" ] && [ -d ".firecode" ]; then
  if command -v fire-code > /dev/null 2>&1; then
    fire-code index --silent > /dev/null 2>&1 &
  elif command -v npx > /dev/null 2>&1; then
    npx --yes @phmotad/fire-code index --silent > /dev/null 2>&1 &
  fi
fi
${END_MARKER}`;
}

export type HookInstallResult = 'installed' | 'updated' | 'already_set' | 'no_git';

/** Install (or merge) the post-checkout hook in the project's .git/hooks/. */
export function installPostCheckoutHook(cwd: string): HookInstallResult {
  const hooksDir = join(cwd, '.git', 'hooks');
  if (!existsSync(hooksDir)) return 'no_git';

  const hookPath = join(hooksDir, 'post-checkout');
  const block = buildHookContent();

  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, 'utf8');
    if (existing.includes(BEGIN_MARKER)) return 'already_set';
    // Append our block to an existing hook (e.g., husky or lefthook)
    writeFileSync(hookPath, existing.trimEnd() + '\n\n' + block + '\n', 'utf8');
    tryChmod(hookPath);
    return 'updated';
  }

  writeFileSync(hookPath, `#!/bin/sh\n${block}\n`, 'utf8');
  tryChmod(hookPath);
  return 'installed';
}

/** Remove the Fire Code block from the post-checkout hook. */
export function removePostCheckoutHook(cwd: string): boolean {
  const hookPath = join(cwd, '.git', 'hooks', 'post-checkout');
  if (!existsSync(hookPath)) return false;

  const content = readFileSync(hookPath, 'utf8');
  if (!content.includes(BEGIN_MARKER)) return false;

  const beginIdx = content.indexOf(BEGIN_MARKER);
  const endIdx = content.indexOf(END_MARKER);
  if (endIdx === -1) return false;

  const before = content.slice(0, beginIdx).trimEnd();
  const after = content.slice(endIdx + END_MARKER.length).trimStart();
  const merged = [before, after].filter(Boolean).join('\n').trimEnd();

  writeFileSync(hookPath, merged ? merged + '\n' : '#!/bin/sh\n', 'utf8');
  return true;
}

export function hasPostCheckoutHook(cwd: string): boolean {
  const hookPath = join(cwd, '.git', 'hooks', 'post-checkout');
  if (!existsSync(hookPath)) return false;
  return readFileSync(hookPath, 'utf8').includes(BEGIN_MARKER);
}

function tryChmod(path: string): void {
  try { chmodSync(path, 0o755); } catch { /* Windows: chmod is no-op */ }
}
