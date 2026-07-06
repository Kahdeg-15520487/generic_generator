// ===========================================================================
// MFCG Topology — Doubly Connected Edge List
// Port of com.watabou.mfcg.model.Topology + DCEL operations
// ===========================================================================

/**
 * A point in 2D space (matching watabou's I class).
 */
export class Pt {
  constructor(public x: number, public y: number) {}
  subtract(p: Pt): Pt { return new Pt(this.x - p.x, this.y - p.y); }
  add(p: Pt): Pt { return new Pt(this.x + p.x, this.y + p.y); }
  scale(s: number): Pt { return new Pt(this.x * s, this.y * s); }
  length(): number { return Math.hypot(this.x, this.y); }
  lengthSq(): number { return this.x * this.x + this.y * this.y; }
  distance(p: Pt): number { return this.subtract(p).length(); }
  static lerp(a: Pt, b: Pt, t: number = 0.5): Pt {
    return new Pt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  }
  static centroid(pts: Pt[]): Pt {
    let sx = 0, sy = 0;
    for (const p of pts) { sx += p.x; sy += p.y; }
    return new Pt(sx / pts.length, sy / pts.length);
  }
  static polar(r: number, a: number): Pt {
    return new Pt(r * Math.cos(a), r * Math.sin(a));
  }
  equals(p: Pt): boolean { return this.x === p.x && this.y === p.y; }
  toString(): string { return `(${this.x},${this.y})`; }
}

// ── DCEL types ──────────────────────────────────────────────────────────────

export interface Vertex {
  point: Pt;
  edges: HalfEdge[];   // incident half-edges
  id: number;
}

export interface Face {
  halfEdge: HalfEdge;  // any half-edge bounding this face
  shape: Pt[];         // polygon vertices (CW or CCW)
  id: number;
}

export interface HalfEdge {
  origin: Vertex;
  twin: HalfEdge | null;
  next: HalfEdge;
  prev: HalfEdge;
  face: Face;
  data: string | null;  // Edge tag: HORIZON, COAST, ROAD, WALL, CANAL
  id: number;
}

// ── DCEL Builder ────────────────────────────────────────────────────────────

let nextVertexId = 0;
let nextEdgeId = 0;
let nextFaceId = 0;

/**
 * Build a complete DCEL from a set of polygonal faces (Voronoi cells).
 * Each face's shape array defines its polygon vertices in order.
 * Shared vertices between adjacent faces are welded by position equality.
 */
export function buildDCEL(faces: Pt[][]): { vertices: Map<string, Vertex>; edges: HalfEdge[]; faces: Face[] } {
  const vertices = new Map<string, Vertex>();
  const halfEdges: HalfEdge[] = [];
  const dcelFaces: Face[] = [];
  const edgeMap = new Map<string, HalfEdge>(); // "v1Id,v2Id" → halfEdge from v1 to v2

  for (const shape of faces) {
    // Create face
    const faceObj: Face = {
      halfEdge: null as any,
      shape: [...shape],
      id: nextFaceId++,
    };
    dcelFaces.push(faceObj);

    // Ensure vertices exist
    const faceVerts: Vertex[] = [];
    for (const p of shape) {
      const key = `${p.x},${p.y}`;
      let v = vertices.get(key);
      if (!v) {
        v = { point: p, edges: [], id: nextVertexId++ };
        vertices.set(key, v);
      }
      faceVerts.push(v);
    }

    // Create half-edges around face
    const n = faceVerts.length;
    const faceEdges: HalfEdge[] = [];
    for (let i = 0; i < n; i++) {
      const origin = faceVerts[i]!;
      const dest = faceVerts[(i + 1) % n]!;

      const edgeKey = `${origin.id},${dest.id}`;
      let he: HalfEdge;
      const existing = edgeMap.get(edgeKey);
      if (existing) {
        // Edge already exists (from adjacent face) — create twin
        he = {
          origin,
          twin: null as any,
          next: null as any,
          prev: null as any,
          face: faceObj,
          data: null,
          id: existing.id,
        };
        // Link twins
        he.twin = existing;
        existing.twin = he;
      } else {
        he = {
          origin,
          twin: null,
          next: null as any,
          prev: null as any,
          face: faceObj,
          data: null,
          id: nextEdgeId++,
        };
        edgeMap.set(edgeKey, he);
      }

      origin.edges.push(he);
      faceEdges.push(he);
      halfEdges.push(he);
    }

    // Chain half-edges around face
    for (let i = 0; i < n; i++) {
      faceEdges[i]!.next = faceEdges[(i + 1) % n]!;
      faceEdges[i]!.prev = faceEdges[(i - 1 + n) % n]!;
    }

    faceObj.halfEdge = faceEdges[0]!;
  }

  return { vertices, edges: halfEdges, faces: dcelFaces };
}

// ── DCEL operations ─────────────────────────────────────────────────────────

/** Get the polygon shape of a face by walking its edges */
export function faceToPoly(face: Face): Pt[] {
  const pts: Pt[] = [];
  let he = face.halfEdge;
  const start = he;
  do {
    pts.push(he.origin.point);
    he = he.next;
  } while (he !== start);
  return pts;
}

/**
 * Find the circumference (boundary) edges of a set of faces.
 * Returns all half-edges whose twins don't belong to any face in the set.
 */
export function circumference(seed: HalfEdge | null, faces: Face[]): HalfEdge[] {
  const faceSet = new Set(faces);
  const result: HalfEdge[] = [];

  // If seed provided, start from there; otherwise scan all edges
  if (seed) {
    let he = seed;
    const start = he;
    do {
      if (!he.twin || !faceSet.has(he.twin.face)) {
        result.push(he);
      }
      he = he.next;
    } while (he !== start);
  } else {
    const seen = new Set<HalfEdge>();
    for (const face of faces) {
      let he = face.halfEdge;
      const start = he;
      do {
        if (seen.has(he)) { he = he.next; continue; }
        seen.add(he);
        if (!he.twin || !faceSet.has(he.twin.face)) {
          result.push(he);
        }
        he = he.next;
      } while (he !== start);
    }
  }

  return result;
}

/**
 * Collapse a short edge, merging its two vertices.
 * Returns the set of edges that changed.
 */
export function collapseEdge(he: HalfEdge, vertices: Map<string, Vertex>, faces: Face[]): HalfEdge[] {
  const changed: HalfEdge[] = [];

  // The edge to collapse: origin → next.origin
  const a = he.origin;   // keep
  const b = he.next.origin;  // merge into a

  // Move b's point to midpoint
  b.point = Pt.lerp(a.point, b.point);

  // Reassign all of b's outgoing edges to originate from a
  for (const edge of [...b.edges]) {
    if (edge.origin === b) {
      edge.origin = a;
      a.edges.push(edge);
    }
    changed.push(edge);
  }

  // Remove b from vertices
  const key = `${b.point.x},${b.point.y}`;
  vertices.delete(key); // Note: after position change this won't find old key
  // Actually, just mark b as dead
  b.edges.length = 0;

  // Update face shapes
  for (const face of faces) {
    face.shape = faceToPoly(face);
  }

  return changed;
}

/**
 * Split a face along the edge from v1 to v2.
 * Both vertices must lie on the boundary of the face.
 * Returns the existing half-edge and its new twin.
 */
export function splitFace(
  face: Face,
  v1: Vertex,
  v2: Vertex,
  vertices: Map<string, Vertex>,
): { face: Face; twinFace: Face } {
  // Find the two half-edges on the face's boundary whose origins are v1 and v2
  let he1: HalfEdge | null = null;
  let he2: HalfEdge | null = null;

  let he = face.halfEdge;
  const start = he;
  do {
    if (he.origin === v1) he1 = he;
    if (he.origin === v2) he2 = he;
    he = he.next;
  } while (he !== start);

  if (!he1 || !he2) throw new Error("splitFace: vertices not on face boundary");

  // Create two new half-edges (twins) along the split line
  const heA: HalfEdge = {
    origin: v1, twin: null as any, next: null as any, prev: null as any,
    face: null as any, data: null, id: nextEdgeId++,
  };
  const heB: HalfEdge = {
    origin: v2, twin: heA, next: null as any, prev: null as any,
    face: null as any, data: null, id: nextEdgeId++,
  };
  heA.twin = heB;

  // Build new face: half of original face from he1 to he2
  const newFace: Face = {
    halfEdge: heA, shape: [], id: nextFaceId++,
  };

  // Walk from he1 (incl) to he2 (incl), assign to new face
  let curr = he1;
  while (curr !== he2) {
    // reassign edge to new face
    curr.face = newFace;
    curr = curr.next;
  }
  he2.face = newFace;

  // Walk from he2 back to he1, assign to old face
  curr = he2;
  while (curr !== he1) {
    curr.face = face;
    curr = curr.next;
  }

  // Chain the split edges
  heA.next = he2;
  heA.prev = he1.prev;
  he1.prev.next = heA;
  he2.prev = heA;

  heB.next = he1;
  heB.prev = he2.prev;
  he2.prev.next = heB;
  he1.prev = heB;

  heA.face = newFace;
  heB.face = face;

  v1.edges.push(heA);
  v2.edges.push(heB);

  newFace.halfEdge = heA;
  face.halfEdge = heB;

  newFace.shape = faceToPoly(newFace);
  face.shape = faceToPoly(face);

  return { face, twinFace: newFace };
}

/**
 * Chain of connected half-edges → polygon points.
 * Same as faceToPoly but works on a list of edges.
 */
export function toPoly(edges: HalfEdge[]): Pt[] {
  if (edges.length === 0) return [];
  const pts: Pt[] = [];
  for (const he of edges) pts.push(he.origin.point);
  // Close the loop
  pts.push(edges[0]!.origin.point);
  return pts;
}

/**
 * Assign data tags to a chain of edges.
 */
export function assignData(edges: HalfEdge[], tag: string, twinToo: boolean = false): void {
  for (const he of edges) {
    he.data = tag;
    if (twinToo && he.twin) he.twin.data = tag;
  }
}

/**
 * Convert face set → edge chain = circumference of the faces.
 */
export function facesToEdgeChain(faces: Face[]): HalfEdge[] {
  const faceSet = new Set(faces);
  const edges: HalfEdge[] = [];
  const seen = new Set<HalfEdge>();
  for (const face of faces) {
    let he = face.halfEdge;
    const start = he;
    do {
      if (seen.has(he)) { he = he.next; continue; }
      seen.add(he);
      if (!he.twin || !faceSet.has(he.twin.face)) {
        edges.push(he);
      }
      he = he.next;
    } while (he !== start);
  }
  return edges;
}

/**
 * Split faces into connected groups.
 */
export function splitFacesByComponent(faces: Face[]): Face[][] {
  const visited = new Set<Face>();
  const groups: Face[][] = [];

  for (const face of faces) {
    if (visited.has(face)) continue;
    const group: Face[] = [];
    const queue = [face];
    visited.add(face);
    while (queue.length > 0) {
      const f = queue.pop()!;
      group.push(f);
      let he = f.halfEdge;
      const start = he;
      do {
        if (he.twin && !visited.has(he.twin.face) && faces.includes(he.twin.face)) {
          visited.add(he.twin.face);
          queue.push(he.twin.face);
        }
        he = he.next;
      } while (he !== start);
    }
    groups.push(group);
  }

  return groups;
}

/** Convert vertex → chain of connected half-edges ending at that vertex */
export function vertexToChain(v: Vertex, dcelEdges: HalfEdge[]): HalfEdge[] {
  const chain: HalfEdge[] = [];
  for (const he of v.edges) {
    if (dcelEdges.includes(he)) chain.push(he);
  }
  return chain;
}
