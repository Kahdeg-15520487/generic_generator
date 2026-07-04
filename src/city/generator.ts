// ===========================================================================
// City Generator
// Port of com.watabou.mfcg.model.City + DistrictBuilder + wards
// Outputs GeoJSON-compatible format matching JsonExporter
// ===========================================================================

import { RNG } from "../lib/rng.js";

export interface CityData {
  values: {
    generator: string;
    version: string;
    roadWidth: number;
    wallThickness: number;
    towerRadius: number;
  };
  bounds: [number, number, number, number];
  districts: DistrictData[];
  buildings: BuildingPoly[];
  walls?: WallPoly[];
  gates?: number[][];
  water?: number[][];
}

interface DistrictData {
  name: string;
  type: string;
  border: number[][];
}

interface BuildingPoly { type: "Polygon"; coordinates: number[][][]; }
interface WallPoly { type: "LineString"; coordinates: number[][]; }

interface Ward {
  name: string;
  type: string;
  x: number; y: number; w: number; h: number;
  buildings: { x: number; y: number; w: number; h: number }[];
}

const WARD_TYPES = [
  { name: "Merchant Ward", type: "merchant" },
  { name: "Craftsmen Ward", type: "craftsmen" },
  { name: "Patriciate Ward", type: "patriciate" },
  { name: "Market Square", type: "market" },
  { name: "Administration", type: "administration" },
  { name: "Military Ward", type: "military" },
  { name: "Common Ward", type: "common" },
  { name: "Harbour", type: "harbour" },
  { name: "Park", type: "park" },
];

const CITY_NAMES = [
  "Stormhaven", "Ironford", "Silverdale", "Ravenport", "Highwall",
  "Thornburg", "Goldcrest", "Ashbridge", "Northkeep", "Suncross",
];

export class CityGenerator {
  private rng!: RNG;

  generate(seed: number): CityData {
    this.rng = new RNG(seed);
    this.rng.float();

    const w = this.rng.int(60, 100);
    const h = this.rng.int(50, 80);

    // ── City outline (organic shape via noise) ──────────────────────────
    const cx = w / 2, cy = h / 2;
    const outline: number[][] = [];
    const numPoints = 24;
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const rx = w * 0.35 + this.rng.int(-8, 8);
      const ry = h * 0.35 + this.rng.int(-5, 5);
      outline.push([cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry]);
    }
    outline.push(outline[0]!); // close

    // ── Wards ───────────────────────────────────────────────────────────
    const wards: Ward[] = [];

    // Castle at center
    wards.push({
      name: "Castle Ward", type: "castle",
      x: cx - 6, y: cy - 5, w: 12, h: 10,
      buildings: [],
    });

    // Cathedral nearby
    const cathX = cx + this.rng.int(-8, 8);
    const cathY = cy + this.rng.int(8, 12);
    wards.push({
      name: "Cathedral Ward", type: "cathedral",
      x: cathX - 4, y: cathY - 3, w: 8, h: 6,
      buildings: [],
    });

    // Market
    wards.push({
      name: "Market Ward", type: "market",
      x: cx - 10, y: cy + 3, w: 10, h: 6,
      buildings: [],
    });

    // Surrounding wards
    const shuffledTypes = this.rng.shuffle([...WARD_TYPES]);
    for (let i = 0; i < 5; i++) {
      const wt = shuffledTypes[i]!;
      const angle = this.rng.float() * Math.PI * 2;
      const dist = this.rng.int(14, 20);
      const wx = cx + Math.cos(angle) * dist;
      const wy = cy + Math.sin(angle) * dist;
      wards.push({
        name: wt.name, type: wt.type,
        x: wx - this.rng.int(5, 8), y: wy - this.rng.int(4, 6),
        w: this.rng.int(10, 16), h: this.rng.int(8, 12),
        buildings: [],
      });
    }

    // ── Fill wards with buildings ───────────────────────────────────────
    const allBuildings: { x: number; y: number; w: number; h: number; ward: string }[] = [];
    for (const ward of wards) {
      if (ward.type === "park" || ward.type === "market") continue; // no buildings
      const occupied = new Set<string>();
      for (let attempt = 0; attempt < 40; attempt++) {
        const bw = this.rng.int(2, 5);
        const bh = this.rng.int(2, 4);
        const bx = ward.x + this.rng.intMax(Math.max(1, ward.w - bw));
        const by = ward.y + this.rng.intMax(Math.max(1, ward.h - bh));
        let overlaps = false;
        for (let dx = 0; dx <= bw && !overlaps; dx++)
          for (let dy = 0; dy <= bh && !overlaps; dy++)
            if (occupied.has(`${bx + dx},${by + dy}`)) { overlaps = true; break; }
        if (overlaps) continue;
        for (let dx = 0; dx <= bw; dx++)
          for (let dy = 0; dy <= bh; dy++)
            occupied.add(`${bx + dx},${by + dy}`);
        allBuildings.push({ x: bx, y: by, w: bw, h: bh, ward: ward.name });
      }
    }

    // ── Walls ───────────────────────────────────────────────────────────
    const walls: WallPoly[] = [{
      type: "LineString",
      coordinates: outline.map(p => [p[0]!, p[1]!]),
    }];

    // Gates at road entry points
    const gates: number[][] = [];
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      gates.push([cx + Math.cos(angle) * w * 0.32, cy + Math.sin(angle) * h * 0.32]);
    }

    return {
      values: { generator: "mfcg", version: "1.0", roadWidth: 2, wallThickness: 1, towerRadius: 3 },
      bounds: [0, 0, w, h],
      districts: wards.map(w => ({
        name: w.name, type: w.type,
        border: [[w.x, w.y], [w.x + w.w, w.y], [w.x + w.w, w.y + w.h], [w.x, w.y + w.h], [w.x, w.y]],
      })),
      buildings: allBuildings.map(b => ({
        type: "Polygon",
        coordinates: [[[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h], [b.x, b.y]]],
      })),
      walls, gates,
    };
  }
}
