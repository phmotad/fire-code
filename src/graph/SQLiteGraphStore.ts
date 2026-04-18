import Database from 'better-sqlite3';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DirectedGraph } = require('graphology') as typeof import('graphology');
import { bfsFromNode } from 'graphology-traversal';
import type { AbstractGraph } from 'graphology-types';
import type {
  GraphNode,
  DependencyEdge,
  GraphQueryFilter,
  GraphStats,
  GraphStore,
} from './GraphStore.js';

/**
 * Graph store backed by SQLite for persistence + graphology for algorithms.
 *
 * Nodes and edges are written to graph_nodes / graph_edges tables in firecode.db.
 * An in-process graphology DirectedGraph is kept in sync for fast traversal.
 */
export class SQLiteGraphStore implements GraphStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private g: AbstractGraph<any, any, any>;

  constructor(private db: Database.Database, private project: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.g = new DirectedGraph() as AbstractGraph<any, any, any>;
    this.load();
  }

  // ── Load from DB into graphology ─────────────────────────────────────────

  private load(): void {
    const nodes = this.db.prepare(
      `SELECT id, data FROM graph_nodes WHERE project = ?`
    ).all(this.project) as { id: string; data: string }[];

    for (const row of nodes) {
      if (!this.g.hasNode(row.id)) {
        this.g.addNode(row.id, JSON.parse(row.data) as Record<string, unknown>);
      }
    }

    const edges = this.db.prepare(
      `SELECT from_id, to_id, type, label FROM graph_edges WHERE project = ?`
    ).all(this.project) as { from_id: string; to_id: string; type: string; label: string | null }[];

    for (const e of edges) {
      if (this.g.hasNode(e.from_id) && this.g.hasNode(e.to_id)) {
        const key = `${e.from_id}→${e.to_id}→${e.type}`;
        if (!this.g.hasEdge(key)) {
          this.g.addEdgeWithKey(key, e.from_id, e.to_id, { type: e.type, label: e.label });
        }
      }
    }
  }

  // ── GraphStore interface ──────────────────────────────────────────────────

  addNode(node: GraphNode): void {
    const data = JSON.stringify(node);
    this.db.prepare(`
      INSERT INTO graph_nodes (project, id, type, label, data)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(project, id) DO UPDATE SET label = excluded.label, data = excluded.data
    `).run(this.project, node.id, node.type, node.label, data);

    if (this.g.hasNode(node.id)) {
      this.g.replaceNodeAttributes(node.id, node as unknown as Record<string, unknown>);
    } else {
      this.g.addNode(node.id, node as unknown as Record<string, unknown>);
    }
  }

  addEdge(edge: DependencyEdge): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO graph_edges (project, from_id, to_id, type, label)
      VALUES (?, ?, ?, ?, ?)
    `).run(this.project, edge.from, edge.to, edge.type, edge.label ?? null);

    if (this.g.hasNode(edge.from) && this.g.hasNode(edge.to)) {
      const key = `${edge.from}→${edge.to}→${edge.type}`;
      if (!this.g.hasEdge(key)) {
        this.g.addEdgeWithKey(key, edge.from, edge.to, { type: edge.type, label: edge.label });
      }
    }
  }

  getNode(id: string): GraphNode | undefined {
    const row = this.db.prepare(
      `SELECT data FROM graph_nodes WHERE project = ? AND id = ?`
    ).get(this.project, id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as GraphNode : undefined;
  }

  getNeighbors(id: string): GraphNode[] {
    if (!this.g.hasNode(id)) return [];
    const neighborIds = this.g.outNeighbors(id);
    const placeholders = neighborIds.map(() => '?').join(',');
    if (!placeholders) return [];
    return (this.db.prepare(
      `SELECT data FROM graph_nodes WHERE project = ? AND id IN (${placeholders})`
    ).all(this.project, ...neighborIds) as { data: string }[])
      .map(r => JSON.parse(r.data) as GraphNode);
  }

  query(filter: GraphQueryFilter): GraphNode[] {
    const conditions: string[] = ['project = ?'];
    const params: string[] = [this.project];

    if (filter.type) { conditions.push('type = ?'); params.push(filter.type); }
    if (filter.label) { conditions.push('label LIKE ?'); params.push(`%${filter.label}%`); }

    const rows = this.db.prepare(
      `SELECT data FROM graph_nodes WHERE ${conditions.join(' AND ')}`
    ).all(...params) as { data: string }[];

    let nodes = rows.map(r => JSON.parse(r.data) as GraphNode);

    if (filter.path) {
      nodes = nodes.filter(n => {
        if (n.type === 'file') return n.path.includes(filter.path!);
        if (n.type === 'function') return n.filePath.includes(filter.path!);
        return false;
      });
    }
    return nodes;
  }

  getStats(): GraphStats {
    const total = (this.db.prepare(
      `SELECT COUNT(*) as c FROM graph_nodes WHERE project = ?`
    ).get(this.project) as { c: number }).c;

    const edgeCount = (this.db.prepare(
      `SELECT COUNT(*) as c FROM graph_edges WHERE project = ?`
    ).get(this.project) as { c: number }).c;

    const byType = this.db.prepare(
      `SELECT type, COUNT(*) as c FROM graph_nodes WHERE project = ? GROUP BY type`
    ).all(this.project) as { type: string; c: number }[];

    return {
      nodes: total,
      edges: edgeCount,
      byType: Object.fromEntries(byType.map(r => [r.type, r.c])),
    };
  }

  // ── Graphology-powered algorithms ────────────────────────────────────────

  /** BFS from a node — returns visited node IDs up to maxDepth */
  bfs(startId: string, maxDepth = 3): string[] {
    if (!this.g.hasNode(startId)) return [];
    const visited: string[] = [];
    let depth = 0;
    bfsFromNode(this.g, startId, (node, _attr, _depth) => {
      visited.push(node);
      if (_depth >= maxDepth) return true; // stop
    });
    return visited;
  }

  /** Returns all nodes reachable from startId (transitive deps) */
  reachableFrom(startId: string, maxDepth = 5): GraphNode[] {
    const ids = this.bfs(startId, maxDepth);
    return ids.map(id => this.getNode(id)).filter(Boolean) as GraphNode[];
  }

  /** Returns all nodes that point TO targetId (reverse deps) */
  dependantsOf(targetId: string): GraphNode[] {
    if (!this.g.hasNode(targetId)) return [];
    const inNeighbors = this.g.inNeighbors(targetId);
    return inNeighbors.map((id: string) => this.getNode(id)).filter(Boolean) as GraphNode[];
  }

  /** Clear all graph data for this project */
  clear(): void {
    this.db.prepare(`DELETE FROM graph_nodes WHERE project = ?`).run(this.project);
    this.db.prepare(`DELETE FROM graph_edges WHERE project = ?`).run(this.project);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.g = new DirectedGraph() as AbstractGraph<any, any, any>;
  }

  // ── Legacy compat (serialize returns a summary, not full JSON) ───────────

  serialize(): string {
    const stats = this.getStats();
    return JSON.stringify({ source: 'sqlite', project: this.project, ...stats });
  }
}
