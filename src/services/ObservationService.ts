import { DatabaseManager, ObservationType } from '../db/DatabaseManager.js';
import { getFireCodeDir } from '../utils/paths.js';
import { sanitizeForLLM, isPrivateFile } from '../utils/privacy.js';
import { basename } from 'path';

export interface ToolCallData {
  tool_name: string;
  tool_input?: Record<string, unknown>;
  tool_result?: unknown;
  session_id: string;
  project: string;
  cwd: string;
}

const BUGFIX_PATTERNS = [/fix(ed|ing|es)?/i, /bug/i, /error/i, /crash/i, /patch/i, /resolv/i, /correct/i];
const FEATURE_PATTERNS = [/add(ed|ing|s)?/i, /creat(e|ed|ing)/i, /implement/i, /new\s/i, /build/i];
const REFACTOR_PATTERNS = [/refactor/i, /clean(up)?/i, /reorganiz/i, /restructur/i, /rename/i, /move/i, /extract/i];
const DECISION_PATTERNS = [/decided?/i, /chose?/i, /approach/i, /strategy/i, /pattern/i, /design/i];

function classifyType(toolName: string, summary: string): ObservationType {
  const text = `${toolName} ${summary}`.toLowerCase();
  if (BUGFIX_PATTERNS.some(p => p.test(text))) return 'bugfix';
  if (DECISION_PATTERNS.some(p => p.test(text))) return 'decision';
  if (REFACTOR_PATTERNS.some(p => p.test(text))) return 'refactor';
  if (FEATURE_PATTERNS.some(p => p.test(text))) return 'feature';
  if (toolName === 'Read' || toolName === 'Glob' || toolName === 'Grep') return 'discovery';
  return 'change';
}

function extractFilePath(data: ToolCallData): string | null {
  const input = data.tool_input ?? {};
  const candidates = [input['file_path'], input['path'], input['filename']];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return null;
}

function buildSummary(data: ToolCallData): string {
  const tool = data.tool_name;
  const input = data.tool_input ?? {};
  const filePath = extractFilePath(data);
  const fileName = filePath ? basename(filePath) : null;

  switch (tool) {
    case 'Write':
      return fileName ? `Wrote ${fileName}` : 'Wrote a file';
    case 'Edit':
    case 'MultiEdit':
      return fileName ? `Edited ${fileName}` : 'Edited a file';
    case 'Read':
      return fileName ? `Read ${fileName}` : 'Read a file';
    case 'Bash': {
      const cmd = String(input['command'] ?? '').slice(0, 60);
      return cmd ? `Ran: ${cmd}` : 'Ran a bash command';
    }
    case 'Glob':
      return `Searched files: ${String(input['pattern'] ?? '')}`;
    case 'Grep':
      return `Searched code: ${String(input['pattern'] ?? '')}`;
    default:
      return `Called ${tool}`;
  }
}

function buildDetail(data: ToolCallData): string | null {
  const result = data.tool_result;
  if (!result) return null;
  const text = typeof result === 'string' ? result : JSON.stringify(result);
  return text.slice(0, 500) || null;
}

export class ObservationService {
  private db: DatabaseManager;

  constructor(cwd: string) {
    this.db = DatabaseManager.getInstance(getFireCodeDir(cwd));
  }

  capture(data: ToolCallData): number {
    const filePath = extractFilePath(data);
    if (filePath && isPrivateFile(filePath)) return -1; // skip private files

    const summary = buildSummary(data);
    const type = classifyType(data.tool_name, summary);
    const rawDetail = buildDetail(data);
    const detail = rawDetail ? sanitizeForLLM(rawDetail) : null;

    return this.db.addObservation({
      session_id: data.session_id,
      project: data.project,
      type,
      tool: data.tool_name,
      file_path: filePath,
      summary,
      detail,
    });
  }

  search(query: string, project: string, limit = 20) {
    return this.db.getObservations({ query, project, limit });
  }

  recent(project: string, limit = 10) {
    return this.db.getObservations({ project, limit });
  }

  getContext(project: string): string {
    return this.db.getRecentContext(project);
  }
}
