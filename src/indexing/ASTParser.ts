import { Project, SyntaxKind } from 'ts-morph';
import { join } from 'path';
import { existsSync } from 'fs';
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
  methods: ParsedFunction[];
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

const TS_EXTENSIONS   = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);
const PY_EXTENSIONS   = new Set(['.py', '.pyw']);
const GO_EXTENSIONS   = new Set(['.go']);
const RUST_EXTENSIONS = new Set(['.rs']);

// ── web-tree-sitter (WASM, no native compilation) ────────────────────────────
// Grammar WASM files are bundled in wasm/ at the package root (two levels up
// from src/indexing/ in source mode, two levels up from dist/indexing/ in
// compiled mode — both land at the project / package root).

const WASM_DIR = join(__dirname, '..', '..', 'wasm');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _Parser: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pythonLang: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _goLang: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _rustLang: any = null;

export let treeSitterReady = false;

let _initPromise: Promise<void> | null = null;

export function initTreeSitter(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = _doInit().catch(() => { /* tree-sitter unavailable — regex fallback */ });
  return _initPromise!;
}

async function _doInit(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('web-tree-sitter');
  // Handle both CJS (mod.default or mod) export shapes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Parser: any = mod.default ?? mod;

  await Parser.init();
  _Parser = Parser;

  const loadLang = async (name: string): Promise<unknown> => {
    const wasmPath = join(WASM_DIR, `${name}.wasm`);
    if (!existsSync(wasmPath)) return null;
    try { return await Parser.Language.load(wasmPath); } catch { return null; }
  };

  [_pythonLang, _goLang, _rustLang] = await Promise.all([
    loadLang('tree-sitter-python'),
    loadLang('tree-sitter-go'),
    loadLang('tree-sitter-rust'),
  ]);

  treeSitterReady = true;
}

// ── Shared walk helper ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walk(node: any, visitor: (n: any) => void): void {
  visitor(node);
  const kids: unknown[] = node.children ?? [];
  for (const child of kids) walk(child, visitor);
}

/** Returns the tree's rootNode, or null if tree-sitter is unavailable / parse fails. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseRoot(file: ScannedFile, lang: any): any {
  if (!_Parser || !lang) return null;
  try {
    const parser = new _Parser();
    parser.setLanguage(lang);
    return parser.parse(file.content)?.rootNode ?? null;
  } catch {
    return null;
  }
}

// ── Language-specific parsers ─────────────────────────────────────────────────

function parsePython(file: ScannedFile): ParsedFile {
  const root = parseRoot(file, _pythonLang);
  if (root) {
    const functions: ParsedFunction[] = [];
    const classes: ParsedClass[] = [];
    walk(root, (node) => {
      if (node.type === 'function_definition') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const name = (node.children as any[]).find((c: any) => c.type === 'identifier')?.text;
        if (name) functions.push({ name, line: (node.startPosition?.row ?? 0) + 1, isExported: true, parameters: [] });
      }
      if (node.type === 'class_definition') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const name = (node.children as any[]).find((c: any) => c.type === 'identifier')?.text;
        if (name) classes.push({ name, line: (node.startPosition?.row ?? 0) + 1, isExported: true, methods: [] });
      }
    });
    return { path: file.path, relativePath: file.relativePath, functions, classes, imports: [], exports: [], language: 'python' };
  }
  return parseWithRegex(file, 'python');
}

function parseGo(file: ScannedFile): ParsedFile {
  const root = parseRoot(file, _goLang);
  if (root) {
    const functions: ParsedFunction[] = [];
    walk(root, (node) => {
      if (node.type === 'function_declaration' || node.type === 'method_declaration') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const name = (node.childForFieldName?.('name') ?? (node.children as any[]).find((c: any) => c.type === 'field_identifier' || c.type === 'identifier'))?.text;
        if (name) functions.push({ name, line: (node.startPosition?.row ?? 0) + 1, isExported: /^[A-Z]/.test(name), parameters: [] });
      }
    });
    return { path: file.path, relativePath: file.relativePath, functions, classes: [], imports: [], exports: [], language: 'go' };
  }
  return parseWithRegex(file, 'go');
}

function parseRust(file: ScannedFile): ParsedFile {
  const root = parseRoot(file, _rustLang);
  if (root) {
    const functions: ParsedFunction[] = [];
    walk(root, (node) => {
      if (node.type === 'function_item') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const name = (node.childForFieldName?.('name') ?? (node.children as any[]).find((c: any) => c.type === 'identifier'))?.text;
        if (name) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const isPub = (node.children as any[]).some((c: any) => c.type === 'visibility_modifier' && c.text === 'pub');
          functions.push({ name, line: (node.startPosition?.row ?? 0) + 1, isExported: isPub, parameters: [] });
        }
      }
    });
    return { path: file.path, relativePath: file.relativePath, functions, classes: [], imports: [], exports: [], language: 'rust' };
  }
  return parseWithRegex(file, 'rust');
}

// ── Language-aware regex fallback ────────────────────────────────────────────

function parseWithRegex(file: ScannedFile, language = 'unknown'): ParsedFile {
  const functions: ParsedFunction[] = [];
  const imports: ParsedImport[] = [];
  const exports: string[] = [];

  const lines = file.content.split('\n');
  lines.forEach((line, i) => {
    const ln = i + 1;

    // JS/TS function declarations
    const jsFn = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (jsFn) functions.push({ name: jsFn[1], line: ln, isExported: line.includes('export'), parameters: [] });

    // Python
    if (language === 'python') {
      const pyFn = line.match(/^\s*def\s+(\w+)\s*\(/);
      if (pyFn) functions.push({ name: pyFn[1], line: ln, isExported: true, parameters: [] });
    }

    // Go
    if (language === 'go') {
      const goFn = line.match(/^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(/);
      if (goFn) functions.push({ name: goFn[1], line: ln, isExported: /^[A-Z]/.test(goFn[1]), parameters: [] });
    }

    // Rust
    if (language === 'rust') {
      const rsFn = line.match(/^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*[<(]/);
      if (rsFn) functions.push({ name: rsFn[1], line: ln, isExported: line.trimStart().startsWith('pub'), parameters: [] });
    }

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
      methods: cls.getMethods().map(m => ({
        name: m.getName(),
        line: m.getStartLineNumber(),
        isExported: !m.hasModifier(SyntaxKind.PrivateKeyword) && !m.hasModifier(SyntaxKind.ProtectedKeyword),
        parameters: m.getParameters().map(p => p.getName()),
        returnType: m.getReturnTypeNode()?.getText(),
      })),
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

// ── Public API ─────────────────────────────────────────────────────────────────

export function parseFiles(files: ScannedFile[]): ParsedFile[] {
  const results: ParsedFile[] = [];
  const tsProject = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });

  for (const file of files) {
    if (TS_EXTENSIONS.has(file.extension)) {
      results.push(parseTsJs(file, tsProject));
    } else if (PY_EXTENSIONS.has(file.extension)) {
      results.push(parsePython(file));
    } else if (GO_EXTENSIONS.has(file.extension)) {
      results.push(parseGo(file));
    } else if (RUST_EXTENSIONS.has(file.extension)) {
      results.push(parseRust(file));
    } else {
      results.push(parseWithRegex(file, file.extension.slice(1) || 'text'));
    }
  }

  return results;
}
