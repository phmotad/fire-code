import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { Project } from 'ts-morph';

export const SmartOutlineInputSchema = z.object({
  file_path: z.string().describe('Path to the source file to outline'),
  cwd: z.string().optional().describe('Working directory (default: process.cwd())'),
});

export type SmartOutlineInput = z.infer<typeof SmartOutlineInputSchema>;

interface Symbol {
  kind: string;
  name: string;
  line: number;
  signature: string;
  exported: boolean;
}

function parseSymbols(filePath: string): Symbol[] {
  const symbols: Symbol[] = [];

  try {
    const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true });
    const src = project.addSourceFileAtPath(filePath);

    for (const fn of src.getFunctions()) {
      const params = fn.getParameters().map(p => p.getText()).join(', ');
      const ret = fn.getReturnTypeNode()?.getText() ?? '';
      symbols.push({
        kind: 'function',
        name: fn.getName() ?? '(anonymous)',
        line: fn.getStartLineNumber(),
        signature: `function ${fn.getName() ?? ''}(${params})${ret ? ': ' + ret : ''}`,
        exported: fn.isExported(),
      });
    }

    for (const cls of src.getClasses()) {
      symbols.push({
        kind: 'class',
        name: cls.getName() ?? '(anonymous)',
        line: cls.getStartLineNumber(),
        signature: `class ${cls.getName() ?? ''}`,
        exported: cls.isExported(),
      });
      for (const m of cls.getMethods()) {
        const params = m.getParameters().map(p => p.getText()).join(', ');
        const ret = m.getReturnTypeNode()?.getText() ?? '';
        symbols.push({
          kind: 'method',
          name: `${cls.getName()}.${m.getName()}`,
          line: m.getStartLineNumber(),
          signature: `  ${m.getName()}(${params})${ret ? ': ' + ret : ''}`,
          exported: false,
        });
      }
    }

    for (const iface of src.getInterfaces()) {
      symbols.push({
        kind: 'interface',
        name: iface.getName(),
        line: iface.getStartLineNumber(),
        signature: `interface ${iface.getName()}`,
        exported: iface.isExported(),
      });
    }

    for (const alias of src.getTypeAliases()) {
      symbols.push({
        kind: 'type',
        name: alias.getName(),
        line: alias.getStartLineNumber(),
        signature: `type ${alias.getName()}`,
        exported: alias.isExported(),
      });
    }
  } catch {
    // Regex fallback for non-TS files
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      const fn = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/);
      if (fn) symbols.push({ kind: 'function', name: fn[1], line: i + 1, signature: line.trim().slice(0, 80), exported: line.includes('export') });
      const cls = line.match(/(?:export\s+)?class\s+(\w+)/);
      if (cls) symbols.push({ kind: 'class', name: cls[1], line: i + 1, signature: line.trim().slice(0, 80), exported: line.includes('export') });
    });
  }

  return symbols.sort((a, b) => a.line - b.line);
}

export async function smartOutlineTool(input: SmartOutlineInput, cwd: string): Promise<string> {
  const filePath = resolve(input.cwd ?? cwd, input.file_path);

  if (!existsSync(filePath)) {
    return JSON.stringify({ error: `File not found: ${filePath}` });
  }

  const symbols = parseSymbols(filePath);

  if (symbols.length === 0) {
    return JSON.stringify({ file: input.file_path, symbols: [], note: 'No symbols found — file may be empty or unsupported' });
  }

  const lines = [`# ${input.file_path} (${symbols.length} symbols)\n`];
  for (const sym of symbols) {
    const exp = sym.exported ? 'export ' : '       ';
    lines.push(`L${String(sym.line).padStart(4, ' ')}  ${exp}[${sym.kind.padEnd(9)}]  ${sym.signature}`);
  }

  return lines.join('\n');
}
