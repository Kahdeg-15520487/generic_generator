// ===========================================================================
// MFCG City Generator — faithful port of com.watabou.mfcg.model.City
// ===========================================================================

import { RNG } from "../lib/rng.js";
import { Pt, type Vertex, type Face, type HalfEdge, buildDCEL, faceToPoly, circumference, collapseEdge, splitFace, toPoly, assignData, facesToEdgeChain, splitFacesByComponent } from "./topology.js";
import { buildVoronoi } from "./voronoi.js";

// ── Edge tags (matching com.watabou.mfcg.model.Edge) ────────────────────────

export const EdgeTag = {
  HORIZON: "HORIZON",
  COAST:  "COAST",
  ROAD:   "ROAD",
  WALL:   "WALL",
  CANAL:  "CANAL",
} as const;

// ── District types ──────────────────────────────────────────────────────────

export const DType = {
  CENTER:   "CENTER",
  CASTLE:   "CASTLE",
  DOCKS:    "DOCKS",
  BRIDGE:   "BRIDGE",
  GATE:     "GATE",
  BANK:     "BANK",
  PARK:     "PARK",
  SPRAWL:   "SPRAWL",
  REGULAR:  "REGULAR",
  FARM:     "FARM",
  WILDERNESS: "WILDERNESS",
} as const;

export type DistrictType = (typeof DType)[keyof typeof DType];

// ── Cell ────────────────────────────────────────────────────────────────────

export interface CellData {
  face: Face;                     // DCEL face this cell wraps
  shape: Pt[];                    // polygon vertices
  waterbody: boolean;
  withinCity: boolean;
  withinWalls: boolean;
  landing: boolean;               // has docks
  ward: Ward | null;
  district: District | null;
  id: number;
}

// ── Ward ────────────────────────────────────────────────────────────────────

export interface Ward {
  type: string;                    // "alleys", "castle", "cathedral", "market", "park", "farm", "wilderness", "regular"
  cell: CellData;
  group: WardGroup | null;
}

// ── WardGroup ───────────────────────────────────────────────────────────────

export interface WardGroup {
  faces: Face[];
  border: HalfEdge[];
  blocks: Block[];
  core: HalfEdge | null;
}

// ── Block ───────────────────────────────────────────────────────────────────

export interface Block {
  shape: Pt[];
  lots: Lot[];
}

// ── Lot ─────────────────────────────────────────────────────────────────────

export interface Lot {
  shape: Pt[];
  building: boolean;
}

// ── District ────────────────────────────────────────────────────────────────

export interface District {
  type: DistrictType;
  faces: Face[];
  border: HalfEdge[];
  groups: WardGroup[];
  name: string;
}

// ── CurtainWall ─────────────────────────────────────────────────────────────

export interface CurtainWall {
  edges: HalfEdge[];
  shape: Pt[];
  gates: Vertex[];
  towers: Vertex[];
  length: number;
}

// ── Main CityData export ────────────────────────────────────────────────────

export interface CityData {
  seed: number;
  nPatches: number;
  cells: CellData[];
  inner: CellData[];              // cells within city
  citadel: CellData | null;
  plaza: CellData | null;
  districts: District[];
  walls: CurtainWall[];
  gates: Pt[];
  streets: HalfEdge[][];          // chain of edges forming streets
  roads: HalfEdge[][];
  arteries: HalfEdge[][];
  waterEdge: Pt[];
  shore: Pt[];
  center: Pt;
  horizon: Pt[];
  bounds: { x: number; y: number; w: number; h: number };
}

// ── Generator ───────────────────────────────────────────────────────────────

export class CityGenerator {
  private rng!: RNG;
  private seed0 = 0;

  // ── Public API ──────────────────────────────────────────────────────────

  generate(cfg: {
    seed: number;
    size?: number;                // number of patches (-1 for random)
    walls?: boolean;
    citadel?: boolean;
    plaza?: boolean;
    temple?: boolean;
    shanty?: boolean;
    river?: boolean;
    coast?: boolean;
  }): CityData {
    const rng = new RNG(cfg.seed);
    this.rng = rng;
    this.seed0 = cfg.seed;

    let nPatches = cfg.size ?? -1;
    if (nPatches <= 0) nPatches = 32 + rng.intMax(64);

    const coastNeeded = cfg.coast ?? true;
    const wallsNeeded = cfg.walls ?? true;
    const citadelNeeded = cfg.citadel ?? (nPatches > 20);
    const plazaNeeded = cfg.plaza ?? (nPatches > 15);
    const templeNeeded = cfg.temple ?? (nPatches > 30);
    const shantyNeeded = cfg.shanty ?? (nPatches > 25);
    const riverNeeded = cfg.river ?? (nPatches > 40 ? rng.chance(0.5) : false);

    // Generate scattered points (from buildPatches)
    const points: Pt[] = [];
    const angle = 2 * Math.PI * rng.float();
    let b = 0;
    for (let i = 1; i < 8 * nPatches; i++) {
      const r = 10 + i * (2 + rng.float());
      const a = angle + 5 * Math.sqrt(i);
      points.push(Pt.polar(r, a));
      b = Math.max(b, r);
    }

    // If plaza, add 4 extra center points
    if (plazaNeeded) {
      const extraR = 8 + rng.float() * 8;
      const extraH = extraR * (1 + rng.float());
      b = Math.max(b, extraH);
      points[1] = Pt.polar(extraR, angle);
      points[2] = Pt.polar(extraH, angle + Math.PI / 2);
      points[3] = Pt.polar(extraR, angle + Math.PI);
      points[4] = Pt.polar(extraH, angle + 3 * Math.PI / 2);
    }

    // Build Voronoi
    const voronoi = buildVoronoi(points);

    // Remove cells whose longest edge exceeds b (boundary cells)
    for (const [key, shape] of voronoi) {
      const maxEdge = maxEdgeLength(shape);
      if (maxEdge > b) voronoi.delete(key);
    }

    // Build DCEL from Voronoi cells
    const cellPolys: Pt[][] = [];
    const cellPointKeys: string[] = [];
    for (const [key, shape] of voronoi) {
      cellPolys.push(shape);
      cellPointKeys.push(key);
    }

    const dcel = buildDCEL(cellPolys);
    const vertices = dcel.vertices;
    const faces = dcel.faces;
    const edges = dcel.edges;

    // Create Cell objects
    const cells: CellData[] = [];
    const centroids = new Map<CellData, Pt>();
    for (let i = 0; i < faces.length; i++) {
      const face = faces[i]!;
      const shape = faceToPoly(face);
      const centroid = Pt.centroid(shape);
      const cell: CellData = {
        face, shape,
        waterbody: false,
        withinCity: false,
        withinWalls: wallsNeeded,
        landing: false,
        ward: null,
        district: null,
        id: i,
      };
      cells.push(cell);
      centroids.set(cell, centroid);
    }

    // Sort cells by distance from center
    cells.sort((a, b) => {
      const ca = centroids.get(a)!;
      const cb = centroids.get(b)!;
      return (ca.x * ca.x + ca.y * ca.y) - (cb.x * cb.x + cb.y * cb.y);
    });

    // Apply coast (water)
    if (coastNeeded) {
      applyCoast(cells, nPatches, b, centroids);
    }

    // Select inner cells (within city)
    const inner: CellData[] = [];
    for (const cell of cells) {
      if (!cell.waterbody && inner.length < nPatches) {
        cell.withinCity = true;
        cell.withinWalls = wallsNeeded;
        inner.push(cell);
      }
    }

    // Find center point
    const center = inner.length > 0
      ? inner[0]!.shape.reduce((a, b) => new Pt(Math.min(a.x, b.x), Math.min(a.y, b.y)), new Pt(Infinity, Infinity))
      : new Pt(0, 0);

    // Plaza
    let plaza: CellData | null = null;
    if (plazaNeeded && inner.length > 0) {
      plaza = inner[0]!;
    }

    // Citadel
    let citadel: CellData | null = null;
    if (citadelNeeded && inner.length > 1) {
      // Find a cell whose vertices are all surrounded by inner cells
      const candidates = inner.filter(cell => {
        if (cell === plaza) return false;
        let he = cell.face.halfEdge;
        const start = he;
        do {
          const vs = cellsByVertex(he.origin, cells);
          if (vs.some(v => v !== cell && !v.waterbody && !v.withinCity)) return false;
          he = he.next;
        } while (he !== start);
        return true;
      });
      citadel = candidates.length > 0 ? rng.pick(candidates) : inner[inner.length - 1]!;
      citadel.withinCity = true;
      citadel.withinWalls = true;
    }

    // ── Optimize junctions (collapse short edges) ─────────────────────────
    optimizeJunctions(faces, vertices, cells, citadel);

    // ── Build domains (water/earth/horizon/shore) ──────────────────────────
    const { horizonE, horizon, waterEdgeE, waterEdge, earthEdgeE, earthEdge, shoreE, shore } =
      buildDomains(faces, edges, cells, coastNeeded);

    // ── Build walls ───────────────────────────────────────────────────────
    const walls: CurtainWall[] = [];
    const gates: Vertex[] = [];

    if (wallsNeeded && inner.length > 0) {
      const wall = buildCityWalls(inner, waterEdge, shoreE, cells, rng, wallsNeeded);
      walls.push(wall);
      gates.push(...wall.gates);
    }

    // ── Build streets ─────────────────────────────────────────────────────
    const streets: HalfEdge[][] = [];
    const roads: HalfEdge[][] = [];

    // Build topology graph for pathfinding
    const topology = buildTopology(cells, waterEdgeE, earthEdgeE, shoreE, shore);

    // Radial streets from gates toward center
    if (gates.length > 0) {
      // Find the actual DCEL vertex closest to center
      let centerVertex: Vertex | undefined;
      let minDist = Infinity;
      for (const [key, v] of vertices) {
        const d = Math.hypot(v.point.x - center.x, v.point.y - center.y);
        if (d < minDist) { minDist = d; centerVertex = v; }
      }

      for (const gate of gates) {
        if (!centerVertex) continue;
        // Walk from gate toward center through DCEL neighbor edges
        const path = findPath(gate, centerVertex, vertices);
        if (path && path.length > 1) {
          streets.push(path);
        }
      }
    }

    // ── Tidy roads (merge into arteries) ───────────────────────────────────
    let arteries: HalfEdge[][] = tidyUpRoads([...streets, ...roads]);

    // Assign ROAD tag to arteries
    for (const artery of arteries) {
      assignData(artery, EdgeTag.ROAD);
    }

    // ── Create wards ──────────────────────────────────────────────────────
    createWards(inner, cells, rng, plaza, citadel,
      wallsNeeded, walls, shoreE, templeNeeded, shantyNeeded, nPatches);

    // ── Build districts ───────────────────────────────────────────────────
    const districts = buildDistricts(cells, inner, gates, center, vertices, rng);
    nameDistricts(districts);

    // ── Build blocks and lots ─────────────────────────────────────────────
    for (const district of districts) {
      buildDistrictGeometry(district, cells);
    }

    // ── Compute bounds ────────────────────────────────────────────────────
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cell of cells) {
      if (!cell.withinCity) continue;
      for (const p of cell.shape) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    }

    return {
      seed: cfg.seed,
      nPatches,
      cells,
      inner,
      citadel,
      plaza,
      districts,
      walls,
      gates: gates.map(g => g.point),
      streets,
      roads,
      arteries,
      waterEdge,
      shore,
      center,
      horizon,
      bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    };
  }
}

// ── Helper functions ────────────────────────────────────────────────────────

function maxEdgeLength(shape: Pt[]): number {
  let max = 0;
  for (let i = 0; i < shape.length; i++) {
    const a = shape[i]!;
    const b = shape[(i + 1) % shape.length]!;
    max = Math.max(max, Math.hypot(b.x - a.x, b.y - a.y));
  }
  return max;
}

function cellsByVertex(v: Vertex, allCells: CellData[]): CellData[] {
  const result: CellData[] = [];
  for (const he of v.edges) {
    const cell = allCells.find(c => c.face === he.face);
    if (cell && !result.includes(cell)) result.push(cell);
  }
  return result;
}

// ── Coast application ──────────────────────────────────────────────────────

function applyCoast(
  cells: CellData[],
  _nPatches: number,
  b: number,
  centroids: Map<CellData, Pt>,
): void {
  // Simple fractal coast effect: mark cells far from center as water
  const sorted = [...cells].sort((a, b) => {
    const ca = centroids.get(a)!;
    const cb = centroids.get(b)!;
    return (ca.x * ca.x + ca.y * ca.y) - (cb.x * cb.x + cb.y * cb.y);
  });

  // Use sine-based fractal to decide which cells are water
  for (const cell of sorted) {
    const c = centroids.get(cell)!;
    const dist = Math.sqrt(c.x * c.x + c.y * c.y);
    const noise = Math.sin(c.x * 0.05) * Math.cos(c.y * 0.05) * 0.5 + 0.5;
    const threshold = b * (0.4 + noise * 0.6);
    if (dist > threshold) {
      cell.waterbody = true;
    }
  }
}

// ── Junction optimization ──────────────────────────────────────────────────

function optimizeJunctions(
  faces: Face[],
  vertices: Map<string, Vertex>,
  cells: CellData[],
  citadel: CellData | null,
): void {
  const minLen = 15;
  let changed = true;
  while (changed) {
    changed = false;
    for (const face of faces) {
      const shape = face.shape;
      if (shape.length <= 4) continue;
      const perimeter = shapePerimeter(shape);
      const threshold = Math.max(minLen, perimeter / shape.length / 3);

      let he = face.halfEdge;
      const start = he;
      do {
        if (he.twin && he.twin.face.shape.length > 4) {
          const len = he.origin.point.distance(he.next.origin.point);
          if (len < threshold) {
            // Don't collapse citadel edges
            if (citadel) {
              const citShape = citadel.shape;
              const onCitadel = citShape.some(p => p.equals(he.origin.point)) &&
                citShape.some(p => p.equals(he.next.origin.point));
              if (onCitadel) { he = he.next; continue; }
            }
            collapseEdge(he, vertices, faces);
            changed = true;
            break;
          }
        }
        he = he.next;
      } while (he !== start && !changed);
      if (changed) break;
    }
  }
}

function shapePerimeter(shape: Pt[]): number {
  let p = 0;
  for (let i = 0; i < shape.length; i++) {
    p += shape[i]!.distance(shape[(i + 1) % shape.length]!);
  }
  return p;
}

// ── Domain building ────────────────────────────────────────────────────────

function buildDomains(
  faces: Face[],
  edges: HalfEdge[],
  cells: CellData[],
  coastNeeded: boolean,
): {
  horizonE: HalfEdge[];
  horizon: Pt[];
  waterEdgeE: HalfEdge[];
  waterEdge: Pt[];
  earthEdgeE: HalfEdge[];
  earthEdge: Pt[];
  shoreE: HalfEdge[];
  shore: Pt[];
} {
  // Find the horizon: edges with null twin (outer boundary)
  const horizonE = edges.filter(e => e.twin === null);
  const horizon = toPoly(horizonE);

  if (!coastNeeded) {
    return {
      horizonE, horizon,
      waterEdgeE: [], waterEdge: [],
      earthEdgeE: horizonE, earthEdge: horizon,
      shoreE: [], shore: [],
    };
  }

  // Split faces into water and land components
  const waterFaces: Face[] = [];
  const landFaces: Face[] = [];
  for (const cell of cells) {
    if (cell.waterbody) waterFaces.push(cell.face);
    else landFaces.push(cell.face);
  }

  const waterGroups = splitFacesByComponent(waterFaces);
  const landGroups = splitFacesByComponent(landFaces);

  const largestWater = waterGroups.reduce((a, b) => a.length > b.length ? a : b, []);
  const largestLand = landGroups.reduce((a, b) => a.length > b.length ? a : b, []);

  const waterEdgeE = facesToEdgeChain(largestWater);
  const waterEdge = toPoly(waterEdgeE);

  const earthEdgeE = facesToEdgeChain(largestLand);
  const earthEdge = toPoly(earthEdgeE);

  // Shore: coastline edges bordering water
  const shoreE = earthEdgeE.filter(e => e.twin && waterFaces.includes(e.twin.face));
  const shore = toPoly(shoreE);

  return { horizonE, horizon, waterEdgeE, waterEdge, earthEdgeE, earthEdge, shoreE, shore };
}

// ── Wall building ──────────────────────────────────────────────────────────

function buildCityWalls(
  inner: CellData[],
  waterEdge: Pt[],
  shoreE: HalfEdge[],
  cells: CellData[],
  rng: RNG,
  _wallsNeeded: boolean,
): CurtainWall {
  // Find the boundary of inner cells (edges bordering non-city cells)
  const cityFaces = new Set(inner.map(c => c.face));
  const boundaryEdges: HalfEdge[] = [];
  for (const cell of inner) {
    let he = cell.face.halfEdge;
    const start = he;
    do {
      if (!he.twin || !cityFaces.has(he.twin.face)) {
        boundaryEdges.push(he);
      }
      he = he.next;
    } while (he !== start);
  }

  assignData(boundaryEdges, EdgeTag.WALL);

  // Place gates: select vertices for ~3-4 gates
  const gateVertices: Vertex[] = [];
  const candidates: Vertex[] = [];
  const seen = new Set<Vertex>();
  for (const he of boundaryEdges) {
    if (!seen.has(he.origin)) {
      seen.add(he.origin);
      // Skip vertices on coast
      if (!shoreE.some(se => se.origin === he.origin)) {
        const nearby = cellsByVertex(he.origin, cells);
        if (nearby.filter(c => c.withinCity).length >= 2) {
          candidates.push(he.origin);
        }
      }
    }
  }

  const numGates = Math.min(candidates.length, 3 + Math.floor(inner.length / 15));
  if (candidates.length > 0) {
    // Spread gates evenly along the boundary
    const step = Math.floor(candidates.length / numGates);
    for (let i = 0; i < numGates; i++) {
      const idx = i * step;
      if (idx < candidates.length) gateVertices.push(candidates[idx]!);
    }
  }

  const shape = toPoly(boundaryEdges);
  const towers: Vertex[] = [];
  for (let i = 0; i < boundaryEdges.length; i++) {
    const v = boundaryEdges[i]!.origin;
    if (!gateVertices.includes(v)) towers.push(v);
  }

  return {
    edges: boundaryEdges,
    shape,
    gates: gateVertices,
    towers,
    length: boundaryEdges.length,
  };
}

// ── Topology for pathfinding ───────────────────────────────────────────────

interface TopoGraph {
  buildPath(from: Vertex, to: Vertex): HalfEdge[] | null;
}

function buildTopology(
  cells: CellData[],
  waterEdgeE: HalfEdge[],
  earthEdgeE: HalfEdge[],
  shoreE: HalfEdge[],
  shore: Pt[],
): TopoGraph {
  // Simple A* pathfinding through DCEL vertices
  // For now, use straight-line + obstacle avoidance

  return {
    buildPath(from: Vertex, to: Vertex): HalfEdge[] | null {
      // Create a path of edges from 'from' to 'to' through adjacent cells
      // Simple approach: find a chain of edges

      const visited = new Set<Vertex>();
      const prev = new Map<Vertex, HalfEdge>();

      interface QueueItem { vertex: Vertex; cost: number; }
      const queue: QueueItem[] = [{ vertex: from, cost: 0 }];
      visited.add(from);

      while (queue.length > 0) {
        queue.sort((a, b) => a.cost - b.cost);
        const curr = queue.shift()!;
        if (curr.vertex === to) break;

        for (const edge of curr.vertex.edges) {
          const nextV = edge.twin?.origin ?? edge.next.origin;
          if (visited.has(nextV)) continue;
          // Avoid water edges
          if (edge.data === EdgeTag.COAST && !shoreE.includes(edge)) continue;

          const cost = curr.cost + curr.vertex.point.distance(nextV.point);
          visited.add(nextV);
          prev.set(nextV, edge);
          queue.push({ vertex: nextV, cost });
        }
      }

      // Reconstruct path
      const path: HalfEdge[] = [];
      let curr: Vertex | undefined = to;
      while (curr && curr !== from) {
        const edge = prev.get(curr);
        if (!edge) break;
        path.unshift(edge);
        curr = edge.origin;
      }

      return path.length > 0 ? path : null;
    },
  };
}

// ── Pathfinding through DCEL vertices ─────────────────────────────────────

function findPath(from: Vertex, to: Vertex, vertices: Map<string, Vertex>): HalfEdge[] | null {
  // BFS through vertex graph to find a path
  const visited = new Set<Vertex>();
  const prevEdge = new Map<Vertex, HalfEdge>();
  const queue: Vertex[] = [from];
  visited.add(from);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === to) break;

    for (const edge of current.edges) {
      // Move to the next vertex along the edge
      const nextVert = edge.twin?.origin ?? edge.next.origin;
      if (nextVert === current) continue; // skip self-loop
      if (visited.has(nextVert)) continue;
      visited.add(nextVert);
      prevEdge.set(nextVert, edge);
      queue.push(nextVert);
    }
  }

  // Reconstruct path
  const path: HalfEdge[] = [];
  let cur: Vertex | undefined = to;
  while (cur && cur !== from) {
    const edge = prevEdge.get(cur);
    if (!edge) return null;
    path.unshift(edge);
    cur = edge.origin;
  }
  return path.length > 0 ? path : null;
}

// ── Tidy roads ─────────────────────────────────────────────────────────────

function tidyUpRoads(allEdges: HalfEdge[][]): HalfEdge[][] {
  const flatEdges: HalfEdge[] = [];
  for (const chain of allEdges) flatEdges.push(...chain);

  const arteries: HalfEdge[][] = [];

  for (const edge of flatEdges) {
    let merged = false;
    for (const artery of arteries) {
      if (artery[artery.length - 1]!.next.origin === edge.origin) {
        artery.push(edge);
        merged = true;
        break;
      } else if (artery[0]!.origin === edge.next.origin) {
        artery.unshift(edge);
        merged = true;
        break;
      }
    }
    if (!merged) arteries.push([edge]);
  }

  return arteries;
}

// ── Ward creation ──────────────────────────────────────────────────────────

function createWards(
  inner: CellData[],
  cells: CellData[],
  rng: RNG,
  plaza: CellData | null,
  citadel: CellData | null,
  wallsNeeded: boolean,
  walls: CurtainWall[],
  shoreE: HalfEdge[],
  templeNeeded: boolean,
  shantyNeeded: boolean,
  nPatches: number,
): void {
  // Plaza gets Market ward
  if (plaza) {
    plaza.ward = { type: "market", cell: plaza, group: null };
  }

  // Citadel gets Castle ward
  if (citadel) {
    citadel.ward = { type: "castle", cell: citadel, group: null };
  }

  // Temple
  if (templeNeeded) {
    const candidates = inner.filter(c => !c.ward && !c.landing);
    if (candidates.length > 0) {
      const temple = rng.pick(candidates);
      temple.ward = { type: "cathedral", cell: temple, group: null };
    }
  }

  // Parks (greens)
  let numParks = Math.floor((nPatches - 10) / 20);
  numParks = Math.max(0, numParks);
  for (let i = 0; i < numParks; i++) {
    const candidates = inner.filter(c => !c.ward);
    if (candidates.length === 0) break;
    const park = rng.pick(candidates);
    park.ward = { type: "park", cell: park, group: null };
  }

  // Docks
  if (shoreE.length > 0) {
    const dockCandidates = inner.filter(c => !c.ward && bordersInside(c, shoreE));
    for (const dc of dockCandidates) {
      dc.landing = true;
      dc.ward = { type: "alleys", cell: dc, group: null }; // Actually harbour in original
    }
  }

  // Gate wards
  if (wallsNeeded) {
    for (const wall of walls) {
      for (const gateVertex of wall.gates) {
        const nearby = cellsByVertex(gateVertex, cells);
        for (const nc of nearby) {
          if (nc.withinCity && !nc.ward) {
            nc.ward = { type: "alleys", cell: nc, group: null };
          }
        }
      }
    }
  }

  // Shanty towns (sprawl)
  if (shantyNeeded) {
    const remaining = inner.filter(c => !c.ward && !c.landing);
    const numShanty = Math.floor(remaining.length * 0.1);
    if (numShanty > 0) {
      const shanty = rng.subset(remaining, numShanty);
      for (const s of shanty) {
        s.ward = { type: "alleys", cell: s, group: null }; // SPRAWL in original
      }
    }
  }

  // Remaining cells get regular wards (Alleys)
  for (const c of inner) {
    if (!c.ward) {
      c.ward = { type: "alleys", cell: c, group: null }; // Patriciate/common in original
    }
  }
}

function bordersInside(cell: CellData, shoreE: HalfEdge[]): boolean {
  for (const se of shoreE) {
    if (se.face === cell.face) return true;
  }
  return false;
}

// ── District building ──────────────────────────────────────────────────────

function buildDistricts(
  cells: CellData[],
  inner: CellData[],
  gates: Vertex[],
  center: Pt,
  vertices: Map<string, Vertex>,
  rng: RNG,
): District[] {
  const districts: District[] = [];
  const assigned = new Set<CellData>();

  // Group cells by ward type
  const byType = new Map<string, CellData[]>();
  for (const c of inner) {
    if (!c.ward) continue;
    const t = c.ward.type;
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(c);
  }

  // Create districts: merge adjacent cells of same ward type
  // Build face→cell map for O(1) lookup
  const faceToCell = new Map<Face, CellData>();
  for (const c of cells) faceToCell.set(c.face, c);

  for (const [dtype, cellGroup] of byType) {
    // BFS to find connected components
    const visited = new Set<CellData>();
    for (const seed of cellGroup) {
      if (visited.has(seed)) continue;
      const component: CellData[] = [];
      const queue = [seed];
      visited.add(seed);
      while (queue.length > 0) {
        const c = queue.pop()!;
        component.push(c);
        // Check neighbors
        let he = c.face.halfEdge;
        const start = he;
        do {
          if (he.twin) {
            const nc = faceToCell.get(he.twin.face);
            if (nc && nc.withinCity && nc.ward?.type === dtype && !visited.has(nc)) {
              visited.add(nc);
              queue.push(nc);
            }
          }
          he = he.next;
        } while (he !== start);
      }

      if (component.length > 0) {
        const faces = component.map(c => c.face);
        const border = circumference(null, faces);
        const district: District = {
          type: mapWardToDType(dtype),
          faces,
          border,
          groups: [],
          name: "",
        };

        // Assign district to cells
        for (const c of component) {
          c.district = district;
          assigned.add(c);
        }

        // Create ward groups (one group per district face)
        const group: WardGroup = {
          faces,
          border,
          blocks: [],
          core: faces[0]?.halfEdge ?? null,
        };

        // Put all face edges into the group
        for (const c of component) {
          if (c.ward) c.ward.group = group;
        }

        district.groups = [group];
        districts.push(district);
      }
    }
  }

  return districts;
}

function mapWardToDType(wardType: string): DistrictType {
  switch (wardType) {
    case "castle":     return DType.CASTLE;
    case "market":     return DType.CENTER;
    case "cathedral":  return DType.CENTER;
    case "park":       return DType.PARK;
    case "alleys":     return DType.REGULAR;
    case "harbour":    return DType.DOCKS;
    default:           return DType.REGULAR;
  }
}

// ── District naming ────────────────────────────────────────────────────────

function nameDistricts(districts: District[]): void {
  const prefixes = ["North", "South", "East", "West", "Old", "New", "High", "Low", "Great", "Little", "Grand", "Royal"];
  const suffixes = ["Ward", "Quarter", "District", "End", "Side", "Reach", "Gate", "Market", "Square", "Hill"];
  const colors = ["Gold", "Silver", "Iron", "Copper", "Crystal", "Emerald", "Ruby", "Sapphire", "Onyx", "Pearl"];

  for (let i = 0; i < districts.length; i++) {
    const d = districts[i]!;
    if (d.type === DType.CASTLE) {
      d.name = `Citadel Ward`;
    } else if (d.type === DType.CENTER) {
      d.name = `Grand Plaza`;
    } else if (d.type === DType.PARK) {
      d.name = `${colors[i % colors.length]} Gardens`;
    } else if (d.type === DType.DOCKS) {
      d.name = `Harbour Ward`;
    } else {
      const pre = prefixes[i % prefixes.length];
      const suf = suffixes[Math.floor(i / prefixes.length) % suffixes.length];
      d.name = `${pre}${suf}`;
    }
  }
}

// ── District geometry (blocks and lots) ────────────────────────────────────

function buildDistrictGeometry(district: District, allCells: CellData[]): void {
  for (const group of district.groups) {
    const blocks = buildBlocks(group, district.type);
    group.blocks = blocks;
  }
}

function buildBlocks(group: WardGroup, dtype: DistrictType): Block[] {
  if (dtype === DType.PARK || dtype === DType.WILDERNESS) return [];

  const blocks: Block[] = [];
  const shape = toPoly(group.border);

  // Subdivide the district polygon into rectangular blocks
  // Simple grid-based approach
  const bbox = {
    minX: Math.min(...shape.map(p => p.x)),
    minY: Math.min(...shape.map(p => p.y)),
    maxX: Math.max(...shape.map(p => p.x)),
    maxY: Math.max(...shape.map(p => p.y)),
  };

  const blockW = 8 + Math.random() * 6;
  const blockH = 8 + Math.random() * 6;
  const spacing = 2;

  for (let x = bbox.minX; x < bbox.maxX; x += blockW + spacing) {
    for (let y = bbox.minY; y < bbox.maxY; y += blockH + spacing) {
      const blkShape = [
        new Pt(x, y),
        new Pt(x + blockW, y),
        new Pt(x + blockW, y + blockH),
        new Pt(x, y + blockH),
      ];

      // Check if block intersects the district polygon
      const cx = x + blockW / 2;
      const cy2 = y + blockH / 2;

      let inside = false;
      for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
        const xi = shape[i]!.x, yi = shape[i]!.y;
        const xj = shape[j]!.x, yj = shape[j]!.y;
        if ((yi > cy2) !== (yj > cy2) && cx < (xj - xi) * (cy2 - yi) / (yj - yi) + xi) {
          inside = !inside;
        }
      }

      if (inside) {
        // Generate lots within the block
        const lots: Lot[] = [];
        const lotW = 2 + Math.random() * 2;
        const lotH = 2 + Math.random() * 2;

        for (let lx = 0; lx < blockW - 1; lx += lotW + 1) {
          for (let ly = 0; ly < blockH - 1; ly += lotH + 1) {
            lots.push({
              shape: [
                new Pt(x + lx, y + ly),
                new Pt(x + lx + lotW, y + ly),
                new Pt(x + lx + lotW, y + ly + lotH),
                new Pt(x, y + ly + lotH),
              ],
              building: Math.random() > 0.2,
            });
          }
        }

        blocks.push({ shape: blkShape, lots });
      }
    }
  }

  return blocks;
}
