export type TaskType = 'feature' | 'fix' | 'refactor' | 'docs';

const PATTERNS: Array<{ type: TaskType; patterns: RegExp[] }> = [
  {
    type: 'fix',
    patterns: [/\bfix\b/i, /\bbug\b/i, /\berror\b/i, /\bcrash\b/i, /\bissue\b/i, /\bbroken\b/i, /\bfailing\b/i],
  },
  {
    type: 'refactor',
    patterns: [/\brefactor\b/i, /\bclean\b/i, /\boptimize\b/i, /\bimprove\b/i, /\brewrite\b/i, /\bextract\b/i],
  },
  {
    type: 'docs',
    patterns: [/\bdoc(s|ument(ation)?)?\b/i, /\breadme\b/i, /\bcomment\b/i, /\bjsdoc\b/i, /\btsdoc\b/i, /\bupdate\s+doc/i],
  },
  {
    type: 'feature',
    patterns: [/\badd\b/i, /\bcreate\b/i, /\bimplement\b/i, /\bbuild\b/i, /\bnew\b/i, /\bfeature\b/i],
  },
];

export function classifyTask(description: string): TaskType {
  for (const { type, patterns } of PATTERNS) {
    if (patterns.some((p) => p.test(description))) return type;
  }
  return 'feature';
}
