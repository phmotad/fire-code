import type {
  GraphNode,
  DependencyEdge,
  GraphQueryFilter,
  GraphStats,
  GraphStore,
} from './GraphStore.js';

export class InMemoryGraphStore implements GraphStore {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: DependencyEdge[] = [];
  private adjacency: Map<string, Set<string>> = new Map();

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
    if (!this.adjacency.has(node.id)) {
      this.adjacency.set(node.id, new Set());
    }
  }

  addEdge(edge: DependencyEdge): void {
    this.edges.push(edge);
    const adj = this.adjacency.get(edge.from) ?? new Set<string>();
    adj.add(edge.to);
    this.adjacency.set(edge.from, adj);
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  getNeighbors(id: string): GraphNode[] {
    const neighborIds = this.adjacency.get(id) ?? new Set<string>();
    const result: GraphNode[] = [];
    for (const nid of neighborIds) {
      const node = this.nodes.get(nid);
      if (node) result.push(node);
    }
    return result;
  }

  query(filter: GraphQueryFilter): GraphNode[] {
    return Array.from(this.nodes.values()).filter((node) => {
      if (filter.type && node.type !== filter.type) return false;
      if (filter.label && !node.label.toLowerCase().includes(filter.label.toLowerCase())) return false;
      if (filter.path) {
        if (node.type === 'file' && !node.path.includes(filter.path)) return false;
        if (node.type === 'function' && !node.filePath.includes(filter.path)) return false;
      }
      return true;
    });
  }

  getStats(): GraphStats {
    const byType: Record<string, number> = {};
    for (const node of this.nodes.values()) {
      byType[node.type] = (byType[node.type] ?? 0) + 1;
    }
    return { nodes: this.nodes.size, edges: this.edges.length, byType };
  }

  getEdges(): DependencyEdge[] {
    return this.edges;
  }

  serialize(): string {
    return JSON.stringify({
      nodes: Array.from(this.nodes.values()),
      edges: this.edges,
    });
  }

  static deserialize(data: string): InMemoryGraphStore {
    const store = new InMemoryGraphStore();
    const parsed = JSON.parse(data) as { nodes: GraphNode[]; edges: DependencyEdge[] };
    for (const node of parsed.nodes) store.addNode(node);
    for (const edge of parsed.edges) store.addEdge(edge);
    return store;
  }
}
