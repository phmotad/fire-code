import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { BaseAgent, type AgentTask, type AgentResult, type FileChange } from './BaseAgent.js';
import { ExecutionError } from '../utils/errors.js';

const SYSTEM_PROMPT = `You are Fire Code, a deterministic code execution agent.

Your job is to implement the given task by modifying source files.

RULES:
- Always respond with ONLY a JSON object (no markdown, no explanation outside JSON)
- The JSON must have this exact shape:
  {
    "explanation": "brief description of what you did",
    "changes": [
      {
        "path": "relative/path/to/file.ts",
        "operation": "create" | "modify" | "delete",
        "content": "full file content (empty string for delete)"
      }
    ]
  }
- For "modify": include the ENTIRE new file content
- For "create": include the full content of the new file
- For "delete": set content to ""
- Paths must be relative to the project root
- Follow existing code style and patterns from the context
- Never break existing functionality
- Be minimal: only change what's necessary`;

function parseAgentResponse(raw: string): { explanation: string; changes: FileChange[] } {
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as { explanation: string; changes: FileChange[] };
    if (!parsed.explanation || !Array.isArray(parsed.changes)) {
      throw new ExecutionError('Invalid agent response structure');
    }
    return parsed;
  } catch (err) {
    if (err instanceof ExecutionError) throw err;
    throw new ExecutionError(`Failed to parse agent response as JSON: ${String(err)}`, {
      raw: raw.slice(0, 500),
    });
  }
}

export class CodeAgent extends BaseAgent {
  async execute(task: AgentTask): Promise<AgentResult> {
    const start = Date.now();
    this.log('Starting task execution', { taskId: task.id, type: task.type });

    try {
      // 1. Retrieve context from memory
      const ctx = await this.memory.retrieve(task.description, { k: 6 });
      this.log('Context retrieved', { vectorResults: ctx.vectorResults.length, graphNodes: ctx.graphResults.length });

      // 2. Build prompt
      const prompt = this.buildPrompt(task, ctx.combined);

      // 3. Call LLM
      const raw = await this.provider.complete(prompt, {
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: this.config.llm.maxTokens,
        temperature: this.config.llm.temperature,
      });

      // 4. Parse response
      const { explanation, changes } = parseAgentResponse(raw);

      // 5. Apply changes (if not dry-run)
      if (!this.config.execution.dryRun) {
        await this.applyChanges(changes);
      }

      return {
        taskId: task.id,
        success: true,
        changes,
        explanation,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        taskId: task.id,
        success: false,
        changes: [],
        explanation: '',
        durationMs: Date.now() - start,
        error: String(err),
      };
    }
  }

  private buildPrompt(task: AgentTask, context: string): string {
    return `## Task
Type: ${task.type}
Description: ${task.description}
Mode: ${task.mode ?? this.config.execution.mode}

## Project Context
${context}

## Instructions
Implement the task described above. Follow the existing patterns from the context.
Return ONLY the JSON response as specified in your instructions.`;
  }

  private async applyChanges(changes: FileChange[]): Promise<void> {
    const cwd = process.cwd();

    for (const change of changes) {
      const absPath = join(cwd, change.path);

      if (change.operation === 'delete') {
        // Don't actually delete — just log (safety: user can delete manually)
        this.log('Skipping delete operation (safe mode)', { path: change.path });
        continue;
      }

      const dir = dirname(absPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      if (change.operation === 'modify' && this.config.execution.conflictStrategy === 'fail') {
        if (existsSync(absPath)) {
          const existing = readFileSync(absPath, 'utf8');
          if (existing !== change.content) {
            this.log('Applying modify', { path: change.path });
          }
        }
      }

      writeFileSync(absPath, change.content, 'utf8');
      this.log('Applied change', { path: change.path, operation: change.operation });
    }
  }
}
