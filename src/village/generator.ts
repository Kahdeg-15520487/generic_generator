// ===========================================================================
// Village Generator
// Port of com.watabou.village.model.Region + SquareBuilder
// Outputs GeoJSON-compatible format matching JSONExporter
// ===========================================================================

import { RNG } from "../lib/rng.js";

// ── Types ───────────────────────────────────────────────────────────────────

export interface VillageData {
  values: {
    generator: string;
    version: string;
    roadWidth: number;
    wallThickness: number;
  };
  bounds: [number, number, number, number]; // [x, y, w, h]
  buildings: Polygon[];
  roads: LineString[];
  water?: Polygon[];
  palisade?: LineString;
  gates?: Point[];
  trees: Point[];
  orchards?: Polygon[];
}

interface Polygon { type: "Polygon"; coordinates: number[][][]; }
interface LineString { type: "LineString"; coordinates: number[][]; }
interface Point { type: "Point"; coordinates: number[]; }

interface InternalBuilding { x: number; y: number; w: number; h: number; type: string; }
interface RoadNode { x: number; y: number; id: number; edges: number[]; }
interface RoadEdge { from: number; to: number; width: number; type: string; }

// ── Generator ───────────────────────────────────────────────────────────────

const BUILDING_NAMES = [
  "Smithy", "Bakery", "Inn", "Stables", "Tannery", "Mill",
  "Chapel", "Well", "Market Stall", "Granary", "Storehouse",
  "Carpenter", "Weaver", "Potter", "Brewery", "Butcher",
  "Cobbler", "Tailor", "Cooper", "Chandler",
];

const VILLAGE_NAMES = [
  "Ashwood", "Briar Glen", "Crooked Elm", "Dunmoss",
  "Elderwell", "Foxhollow", "Greenbarrow", "Hawthorn",
  "Ivybridge", "Kingsmead", "Littleroot", "Millbrook",
];

export class VillageGenerator {
  private rng!: RNG;

  generate(seed: number): VillageData {
    this.rng = new RNG(seed);
    this.rng.float();

    const w = this.rng.int(40, 70);
    const h = this.rng.int(30, 55);
    const buildings: InternalBuilding[] = [];
    const roadNodes: RoadNode[] = [];
    const roadEdges: RoadEdge[] = [];
    const occupied = new Set<string>();

    // Main road
    const roadY = Math.floor(h / 2);
    for (let x = 0; x <= w; x += this.rng.int(8, 14)) {
      const node: RoadNode = { x, y: roadY + this.rng.int(-3, 4), id: roadNodes.length, edges: [] };
      if (roadNodes.length > 0) {
        const prev = roadNodes[roadNodes.length - 1]!;
        roadEdges.push({ from: prev.id, to: node.id, width: 3, type: "highway" });
        prev.edges.push(node.id);
        node.edges.push(prev.id);
      }
      roadNodes.push(node);
    }

    // Cross roads
    for (const node of roadNodes) {
      if (this.rng.chance(0.6)) {
        const dir = this.rng.chance(0.5) ? 1 : -1;
        const len = this.rng.int(8, 22);
        const y = node.y + dir * len;
        if (y < 2 || y > h - 2) continue;
        const end: RoadNode = { x: node.x + this.rng.int(-2, 3), y, id: roadNodes.length, edges: [] };
        roadEdges.push({ from: node.id, to: end.id, width: 2, type: "lane" });
        node.edges.push(end.id);
        end.edges.push(node.id);
        roadNodes.push(end);
      }
    }

    // Buildings
    for (const node of roadNodes) {
      for (let a = 0; a < 4; a++) {
        const bw = this.rng.int(3, 7);
        const bh = this.rng.int(2, 5);
        const bx = node.x + this.rng.int(-6, 6) - Math.floor(bw / 2);
        const by = node.y + this.rng.int(-6, 6) - Math.floor(bh / 2);
        if (bx < 1 || by < 1 || bx + bw > w - 1 || by + bh > h - 1) continue;
        let overlaps = false;
        for (let dx = -1; dx <= bw && !overlaps; dx++)
          for (let dy = -1; dy <= bh && !overlaps; dy++)
            if (occupied.has(`${bx + dx},${by + dy}`)) { overlaps = true; break; }
        if (overlaps) continue;
        for (let dx = -1; dx <= bw; dx++)
          for (let dy = -1; dy <= bh; dy++)
            occupied.add(`${bx + dx},${by + dy}`);
        buildings.push({ x: bx, y: by, w: bw, h: bh, type: this.rng.chance(0.2) ? "large" : "small" });
      }
    }

    // Palisade
    let palisade: LineString | undefined;
    let gates: Point[] | undefined;
    if (this.rng.chance(0.25)) {
      const m = 2;
      const coords = [[-m, -m], [w + m, -m], [w + m, h + m], [-m, h + m], [-m, -m]];
      palisade = { type: "LineString", coordinates: coords as any };
      gates = [
        { type: "Point", coordinates: [Math.floor(w / 2), -m] as number[] },
        { type: "Point", coordinates: [Math.floor(w / 2), h + m] as number[] },
      ];
    }

    // Water
    let water: Polygon[] | undefined;
    if (this.rng.chance(0.15)) {
      const ry = this.rng.int(Math.floor(h / 3), Math.floor(2 * h / 3));
      const pts = [[0, ry], [Math.floor(w / 3), ry + 3], [Math.floor(2 * w / 3), ry - 2], [w, ry]];
      water = [{ type: "Polygon", coordinates: [pts] }];
    }

    // Trees
    const trees: Point[] = [];
    for (let i = 0; i < 50; i++) {
      const tx = this.rng.int(2, w - 2), ty = this.rng.int(2, h - 2);
      if (!occupied.has(`${tx},${ty}`)) {
        trees.push({ type: "Point", coordinates: [tx, ty] });
        occupied.add(`${tx},${ty}`);
      }
    }

    return {
      values: { generator: "vg", version: "1.0", roadWidth: 2, wallThickness: 1 },
      bounds: [0, 0, w, h],
      buildings: buildings.map(b => ({
        type: "Polygon",
        coordinates: [[[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h], [b.x, b.y]]],
      })),
      roads: roadEdges.map(e => ({
        type: "LineString",
        coordinates: [[roadNodes[e.from]!.x, roadNodes[e.from]!.y], [roadNodes[e.to]!.x, roadNodes[e.to]!.y]],
      })),
      water, palisade, gates, trees,
    };
  }
}
