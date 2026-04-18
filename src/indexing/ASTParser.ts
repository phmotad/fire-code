import { Project, SyntaxKind } from 'ts-morph';
import type { ScannedFile } from './FileScanner.js';

export interface ParsedFunction {
  name: string;
  line: number;
  isExported: boolean;
  parameters: string[];
  returnType?: string;
}

export interface ParsedClass {
  name: string;
  line: number;
  isExported: boolean;
  methods: string[];
}

export interface ParsedImport {
  moduleSpecifier: string;
  namedImports: string[];
  defaultImport?: string;
}

export interface ParsedFile {
  path: string;
  relativePath: string;
  functions: ParsedFunction[];
  classes: ParsedClass[];
  imports: ParsedImport[];
  exports: string[];
  language: string;
}

const TS_EXTENSIONS  = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);
const PY_EXTENSIONS  = new Set(['.py', '.pyw']);
const GO_EXTENSIONS  = new Set(['.go']);
const RUST_EXTENSIONS = new Set(['.rs']);

// ── Tree-sitter multilingual parser ──────────────────────────────────────────

let treeSitterReady = false;

interface TSParser {
  setLanguage(lang: unknown): void;
  parse(src: string): { rootNode: TSNode };
}

interface TSNode {
  type: string;
  startPosition: { row: number };
  text: string;
  children: TSNode[];
  namedChildren: TSNode[];
  childForFieldName(name: string): TSNode | null;
}

function loadTreeSitter(): TSParser | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Parser = require('tree-sitter');
    treeSitterReady = true;
    return new Parser() as TSParser;
  } catch {
    return null;
  }
}

function loadGrammar(name: string): unknown | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(`tree-sitter-${name}`);
    return mod.typescript ?? mod.javascript ?? mod.python ?? mod.go ?? mod.rust ?? mod;
  } catch {
    return null;
  }
}

function walk(node: TSNode, visitor: (n: TSNode) => void) {
  visitor(node);
  for (const child of node.children ?? []) walk(child, visitor);
}

function parsePython(file: ScannedFile, parser: TSParser): ParsedFile {
  const grammar = loadGrammar('python');
  if (!grammar) return parseWithRegex(file, 'python');
  parser.setLanguage(grammar);
  const tree = parser.parse(file.content);
  const functions: ParsedFunction[] = [];
  const classes: ParsedClass[] = [];

  walk(tree.rootNode, (node) => {
    if (node.type === 'function_definition') {
      const namePart = node.children.find(c => c.type === 'identifier');
      if (namePart) {
        functions.push({ name: namePart.text, line: node.startPosition.row + 1, isExported: true, parameters: [] });
      }
    }
    if (node.type === 'class_definition') {
      const namePart = node.children.find(c => c.type === 'identifier');
      if (namePart) {
        classes.push({ name: namePart.text, line: node.startPosition.row + 1, isExported: true, methods: [] });
      }
    }
  });

  return { path: file.path, relativePath: file.relativePath, functions, classes, imports: [], exports: [], language: 'python' };
}

function parseGo(file: ScannedFile, parser: TSParser): ParsedFile {
  const grammar = loadGrammar('go');
  if (!grammar) return parseWithRegex(file, 'go');
  parser.setLanguage(grammar);
  const tree = parser.parse(file.content);
  const functions: ParsedFunction[] = [];

  walk(tree.rootNode, (node) => {
    if (node.type === 'function_declaration' || node.type === 'method_declaration') {
      const namePart = node.childForFieldName?.('name') ?? node.children.find(c => c.type === 'field_identifier' || c.type === 'identifier');
      if (namePart) {
        functions.push({ name: namePart.text, line: node.startPosition.row + 1, isExported: /^[A-Z]/.test(namePart.text), parameters: [] });
      }
    }
  });

  return { path: file.path, relativePath: file.relativePath, functions, classes: [], imports: [], exports: [], language: 'go' };
}

function parseRust(file: ScannedFile, parser: TSParser): ParsedFile {
  const grammar = loadGrammar('rust');
  if (!grammar) return parseWithRegex(file, 'rust');
  parser.setLanguage(grammar);
  const tree = parser.parse(file.content);
  const functions: ParsedFunction[] = [];

  walk(tree.rootNode, (node) => {
    if (node.type === 'function_item') {
      const namePart = node.childForFieldName?.('name') ?? node.children.find(c => c.type === 'identifier');
      if (namePart) {
        const isExported = node.children.some(c => c.type === 'visibility_modifier' && c.text === 'pub');
        functions.push({ name: namePart.text, line: node.startPosition.row + 1, isExported, parameters: [] });
      }
    }
  });

  return { path: file.path, relativePath: file.relativePath, functions, classes: [], imports: [], exports: [], language: 'rust' };
}

// ── Regex fallback (any language) ────────────────────────────────────────────

function parseWithRegex(file: ScannedFile, language = 'unknown'): ParsedFile {
  const functions: ParsedFunction[] = [];
  const imports: ParsedImport[] = [];
  const exports: string[] = [];

  const lines = file.content.split('\n');
  lines.forEach((line, i) => {
    const fnMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (fnMatch) functions.push({ name: fnMatch[1], line: i + 1, isExported: line.includes('export'), parameters: [] });

    const importMatch = line.match(/^import\s+.*from\s+['"](.+)['"]/);
    if (importMatch) {
      const namedMatch = line.match(/\{\s*([^}]+)\s*\}/);
      imports.push({
        moduleSpecifier: importMatch[1],
        namedImports: namedMatch ? namedMatch[1].split(',').map(s => s.trim()).filter(Boolean) : [],
      });
    }

    const exportMatch = line.match(/^export\s+(?:const|let|var|function|class|type|interface|enum)\s+(\w+)/);
    if (exportMatch) exports.push(exportMatch[1]);
  });

  return { path: file.path, relativePath: file.relativePath, functions, classes: [], imports, exports, language };
}

// ── ts-morph for TypeScript/JavaScript ───────────────────────────────────────

function parseTsJs(file: ScannedFile, project: InstanceType<typeof Project>): ParsedFile {
  try {
    const sourceFile = project.createSourceFile(file.relativePath, file.content, { overwrite: true });

    const functions: ParsedFunction[] = [
      ...sourceFile.getFunctions().map(fn => ({
        name: fn.getName() ?? '<anonymous>',
        line: fn.getStartLineNumber(),
        isExported: fn.isExported(),
        parameters: fn.getParameters().map(p => p.getName()),
        returnType: fn.getReturnTypeNode()?.getText(),
      })),
      ...sourceFile.getVariableDeclarations()
        .filter(v => v.getInitializerIfKind(SyntaxKind.ArrowFunction))
        .map(v => ({
          name: v.getName(),
          line: v.getStartLineNumber(),
          isExported: v.getVariableStatement()?.isExported() ?? false,
          parameters: (v.getInitializerIfKind(SyntaxKind.ArrowFunction)?.getParameters() ?? []).map(p => p.getName()),
        })),
    ];

    const classes: ParsedClass[] = sourceFile.getClasses().map(cls => ({
      name: cls.getName() ?? '<anonymous>',
      line: cls.getStartLineNumber(),
      isExported: cls.isExported(),
      methods: cls.getMethods().map(m => m.getName()),
    }));

    const imports: ParsedImport[] = sourceFile.getImportDeclarations().map(imp => ({
      moduleSpecifier: imp.getModuleSpecifierValue(),
      namedImports: imp.getNamedImports().map(n => n.getName()),
      defaultImport: imp.getDefaultImport()?.getText(),
    }));

    const exports = [...sourceFile.getExportedDeclarations().keys()];

    return { path: file.path, relativePath: file.relativePath, functions, classes, imports, exports, language: 'typescript' };
  } catch {
    return parseWithRegex(file, 'typescript');
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function parseFiles(files: ScannedFile[]): ParsedFile[] {
  const results: ParsedFile[] = [];
  const tsProject = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
  const tsParser = loadTreeSitter();

  for (const file of files) {
    if (TS_EXTENSIONS.has(file.extension)) {
      results.push(parseTsJs(file, tsProject));
    } else if (tsParser && PY_EXTENSIONS.has(file.extension)) {
      results.push(parsePython(file, tsParser));
    } else if (tsParser && GO_EXTENSIONS.has(file.extension)) {
      results.push(parseGo(file, tsParser));
    } else if (tsParser && RUST_EXTENSIONS.has(file.extension)) {
      results.push(parseRust(file, tsParser));
    } else {
      results.push(parseWithRegex(file, file.extension.slice(1) || 'text'));
    }
  }

  return results;
}

export { treeSitterReady };
