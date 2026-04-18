import type { ParsedFile } from './ASTParser.js';
import type { GraphStore, FileNode, FunctionNode, DependencyEdge } from '../graph/GraphStore.js';

export function buildGraphFromParsed(files: ParsedFile[], graph: GraphStore): void {
  // Add file nodes
  for (const file of files) {
    const node: FileNode = {
      id: `file:${file.relativePath}`,
      type: 'file',
      label: file.relativePath,
      path: file.relativePath,
      functions: file.functions.map((f) => f.name),
      exports: file.exports,
    };
    graph.addNode(node);
  }

  // Add function nodes and dependency edges
  for (const file of files) {
    for (const fn of file.functions) {
      const fnNode: FunctionNode = {
        id: `fn:${file.relativePath}:${fn.name}`,
        type: 'function',
        label: fn.name,
        filePath: file.relativePath,
        line: fn.line,
        isExported: fn.isExported,
        parameters: fn.parameters,
        returnType: fn.returnType,
      };
      graph.addNode(fnNode);
    }

    // Add import edges (file → dependency)
    for (const imp of file.imports) {
      const specifier = imp.moduleSpecifier;
      const isRelative = specifier.startsWith('.');
      if (!isRelative) continue;

      // Resolve relative import to a file path (rough)
      const dir = file.relativePath.replace(/\/[^/]+$/, '');
      const resolved = `${dir}/${specifier}`.replace(/\/\.\//g, '/').replace(/\/[^/]+\/\.\.\//g, '/');

      const edge: DependencyEdge = {
        from: `file:${file.relativePath}`,
        to: `file:${resolved}`,
        type: 'imports',
        label: specifier,
      };
      graph.addEdge(edge);
    }
  }
}
