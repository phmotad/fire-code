export interface FileNode {
  id: string;
  type: 'file';
  label: string;
  path: string;
  functions: string[];
  exports: string[];
}

export interface FunctionNode {
  id: string;
  type: 'function';
  label: string;
  filePath: string;
  line: number;
  isExported: boolean;
  parameters: string[];
  returnType?: string;
}

export interface CommitNode {
  id: string;
  type: 'commit';
  label: string;
  sha: string;
  message: string;
  timestamp: string;
  filesChanged: string[];
}

export type GraphNode = FileNode | FunctionNode | CommitNode;

export interface DependencyEdge {
  from: string;
  to: string;
  type: 'imports' | 'calls' | 'extends' | 'implements';
  label?: string;
}

export interface GraphStats {
  nodes: number;
  edges: number;
  byType: Record<string, number>;
}

export interface GraphQueryFilter {
  type?: GraphNode['type'];
  label?: string;
  path?: string;
}

export interface GraphStore {
  addNode(node: GraphNode): void;
  addEdge(edge: DependencyEdge): void;
  getNode(id: string): GraphNode | undefined;
  getNeighbors(id: string): GraphNode[];
  query(filter: GraphQueryFilter): GraphNode[];
  getStats(): GraphStats;
  serialize(): string;
}
