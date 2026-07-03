// ===========================================================================
// Grid — topological grid of nodes, cells, and edges
// Port of com.watabou.dwellings.utils.Grid
// ===========================================================================

import { Dir } from "./dir.js";

export interface Cell { i: number; j: number; }
export interface Node { i: number; j: number; id: number; }
export interface Edge { a: Node; b: Node; dir: Dir; }

export class Grid {
  readonly w: number;
  readonly h: number;
  readonly nodes: Node[][];
  readonly cells: Cell[][];
  readonly edges: Map<number, Map<number, Edge>> = new Map();
  private _nextId = 0;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;

    // Create nodes (one more than cells in each dimension)
    this.nodes = [];
    for (let i = 0; i <= h; i++) {
      const row: Node[] = [];
      for (let j = 0; j <= w; j++) {
        row.push({ i, j, id: this._nextId++ });
      }
      this.nodes.push(row);
    }

    // Create cells
    this.cells = [];
    for (let i = 0; i < h; i++) {
      const row: Cell[] = [];
      for (let j = 0; j < w; j++) {
        row.push({ i, j });
      }
      this.cells.push(row);
    }

    // Create edges between adjacent nodes
    for (let i = 0; i <= h; i++) {
      for (let j = 0; j <= w; j++) {
        const n = this.nodes[i][j];
        const map = new Map<number, Edge>();
        this.edges.set(n.id, map);

        if (i > 0) map.set(this.nodes[i - 1][j].id, { a: n, b: this.nodes[i - 1][j], dir: Dir.N });
        if (i < h) map.set(this.nodes[i + 1][j].id, { a: n, b: this.nodes[i + 1][j], dir: Dir.S });
        if (j > 0) map.set(this.nodes[i][j - 1].id, { a: n, b: this.nodes[i][j - 1], dir: Dir.W });
        if (j < w) map.set(this.nodes[i][j + 1].id, { a: n, b: this.nodes[i][j + 1], dir: Dir.E });
      }
    }
  }

  node(i: number, j: number): Node | null {
    return (i >= 0 && i <= this.h && j >= 0 && j <= this.w) ? this.nodes[i][j] : null;
  }

  cell(i: number, j: number): Cell | null {
    return (i >= 0 && i < this.h && j >= 0 && j < this.w) ? this.cells[i][j] : null;
  }

  getEdge(a: Node, b: Node): Edge | undefined {
    return this.edges.get(a.id)?.get(b.id);
  }

  cellNdir2edge(c: Cell, dir: Dir): Edge | null {
    if (dir === Dir.N) return this.getEdge(this.nodes[c.i][c.j]!, this.nodes[c.i][c.j + 1]!) ?? null;
    if (dir === Dir.E) return this.getEdge(this.nodes[c.i][c.j + 1]!, this.nodes[c.i + 1][c.j + 1]!) ?? null;
    if (dir === Dir.S) return this.getEdge(this.nodes[c.i + 1][c.j + 1]!, this.nodes[c.i + 1][c.j]!) ?? null;
    if (dir === Dir.W) return this.getEdge(this.nodes[c.i + 1][c.j]!, this.nodes[c.i][c.j]!) ?? null;
    return null;
  }

  edge2cell(e: Edge): Cell | null {
    const a = e.a;
    if (e.dir === Dir.E)  return this.cells[a.i]?.[a.j] ?? null;
    if (e.dir === Dir.S)  return this.cells[a.i]?.[a.j - 1] ?? null;
    if (e.dir === Dir.W)  return this.cells[a.i - 1]?.[a.j - 1] ?? null;
    return this.cells[a.i - 1]?.[a.j] ?? null; // North
  }

  /** Build ordered contour edges for an area (counter-clockwise) */
  outline(area: Cell[]): Edge[] {
    const allEdges: Edge[] = [];
    for (const c of area) {
      const n00 = this.nodes[c.i][c.j]!;
      const n01 = this.nodes[c.i][c.j + 1]!;
      const n11 = this.nodes[c.i + 1][c.j + 1]!;
      const n10 = this.nodes[c.i + 1][c.j]!;

      if (!area.some(x => x.i === c.i - 1 && x.j === c.j))
        allEdges.push(this.edges.get(n00.id)!.get(n01.id)!);
      if (!area.some(x => x.i === c.i && x.j === c.j + 1))
        allEdges.push(this.edges.get(n01.id)!.get(n11.id)!);
      if (!area.some(x => x.i === c.i + 1 && x.j === c.j))
        allEdges.push(this.edges.get(n11.id)!.get(n10.id)!);
      if (!area.some(x => x.i === c.i && x.j === c.j - 1))
        allEdges.push(this.edges.get(n10.id)!.get(n00.id)!);
    }

    // Chain into loops
    const remaining = [...allEdges];
    const chains: Edge[][] = [];
    while (remaining.length > 0) {
      let cur = remaining.pop()!;
      const chain: Edge[] = [cur];
      chains.push(chain);

      let loopCount = 0;
      do {
        if (++loopCount > 10000) break;
        let next: Edge | null = null;
        for (const d of [cur.dir.cw, cur.dir, cur.dir.ccw]) {
          const nxt = this.node(cur.b.i + d.di, cur.b.j + d.dj);
          if (!nxt) continue;
          const candidate = this.edges.get(cur.b.id)?.get(nxt.id);
          if (candidate) {
            const idx = remaining.indexOf(candidate);
            if (idx >= 0) { remaining.splice(idx, 1); next = candidate; break; }
          }
        }
        if (!next) break;
        chain.push(next);
        cur = next;
      } while (cur.b !== chain[0].a);
    }

    return chains.length > 0 ? chains[0] : [];
  }

  /** Flood fill from first edge of contour to get interior cells */
  contour2area(contour: Edge[]): Cell[] {
    const contourSet = new Set(contour);
    const start = this.edge2cell(contour[0]);
    if (!start) return [];
    const area: Cell[] = [start];
    const queue: Cell[] = [start];

    while (queue.length > 0) {
      const c = queue.pop()!;
      for (const dir of Dir.CARDINAL) {
        const n = this.cell(c.i + dir.di, c.j + dir.dj);
        if (!n) continue;
        const e = this.cellNdir2edge(c, dir);
        if (e && contourSet.has(e)) continue;
        if (!area.some(x => x.i === n.i && x.j === n.j)) {
          area.push(n);
          queue.push(n);
        }
      }
    }
    return area;
  }

  /** Check if all cells in area form a single connected component */
  isConnected(area: Cell[]): boolean {
    const remaining = area.slice();
    const visited: Cell[] = [remaining.pop()!];

    while (remaining.length > 0) {
      let found = false;
      for (let i = 0; i < remaining.length; i++) {
        const c = remaining[i];
        for (const dir of Dir.CARDINAL) {
          const n = this.cell(c.i + dir.di, c.j + dir.dj);
          if (n && visited.some(v => v.i === n.i && v.j === n.j)) {
            visited.push(c);
            remaining.splice(i, 1);
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (!found) return false;
    }
    return true;
  }

  /** Convert a cloud of {x,y} points to a compact grid */
  static cloud2grid(cloud: { x: number; y: number }[]): {
    grid: Grid; area: Cell[]; trimX: number; trimY: number;
  } {
    if (cloud.length === 0) throw new Error("Empty cloud");
    let minX = cloud[0].x, maxX = cloud[0].x;
    let minY = cloud[0].y, maxY = cloud[0].y;
    for (const p of cloud) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const grid = new Grid(w, h);
    const area = cloud.map(p => grid.cells[p.y - minY][p.x - minX]!);
    return { grid, area, trimX: minX, trimY: minY };
  }
}
