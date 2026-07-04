// ===========================================================================
// Medieval Fantasy City Generator — faithful port
// Organic ward growth with district types, curtain walls, building blocks
// ===========================================================================

import { RNG } from "../lib/rng.js";

export interface CityData {
  width: number;
  height: number;
  wards: Ward[];
  buildings: Building[];
  walls: WallSegment[];
  gates: { x: number; y: number }[];
  roads: RoadSegment[];
}

export interface Ward {
  name: string;
  type: string;
  cells: { x: number; y: number }[];
  center: { x: number; y: number };
}

export interface Building {
  x: number; y: number;
  w: number; h: number;
  wardType: string;
}

export interface WallSegment {
  x1: number; y1: number;
  x2: number; y2: number;
}

export interface RoadSegment {
  x1: number; y1: number;
  x2: number; y2: number;
  width: number;
}

// ── Ward types ──────────────────────────────────────────────────────────────

const WARD_TYPES = [
  { type: "castle", name: "Castle Ward", size: 12, priority: 10, walled: true },
  { type: "cathedral", name: "Cathedral Ward", size: 8, priority: 9 },
  { type: "market", name: "Market Ward", size: 10, priority: 7 },
  { type: "harbour", name: "Harbour Ward", size: 10, priority: 8, coastal: true },
  { type: "craftsmen", name: "Craftsmen Ward", size: 8, priority: 5 },
  { type: "merchant", name: "Merchant Ward", size: 9, priority: 5 },
  { type: "patriciate", name: "Patriciate Ward", size: 10, priority: 4 },
  { type: "administration", name: "Administration Ward", size: 7, priority: 4 },
  { type: "military", name: "Military Ward", size: 8, priority: 6, walled: true },
  { type: "common", name: "Common Ward", size: 8, priority: 3 },
  { type: "alleys", name: "Alleys", size: 7, priority: 2 },
  { type: "park", name: "Park", size: 9, priority: 2, green: true },
  { type: "farm", name: "Farm Ward", size: 12, priority: 1, green: true },
  { type: "wilderness", name: "Wilderness", size: 12, priority: 0, green: true },
];

const CITY_NAMES = [
  "Stormhaven", "Ironford", "Silverdale", "Ravenport", "Highwall",
  "Thornburg", "Goldcrest", "Ashbridge", "Northkeep", "Suncross",
  "Darkwater", "Eastgate", "Redhollow", "Wyvern's Peak", "Mistvale",
];

// ── Generator ───────────────────────────────────────────────────────────────

export class CityGenerator {
  private rng!: RNG;
  private grid: number[][] = []; // 0=empty, 1+=ward index+1
  private wards: Ward[] = [];
  private buildings: Building[] = [];
  private walls: WallSegment[] = [];
  private roads: RoadSegment[] = [];
  private w: number = 0;
  private h: number = 0;

  generate(seed: number): CityData {
    this.rng = new RNG(seed);
    this.wards = [];
    this.buildings = [];
    this.walls = [];
    this.roads = [];

    // City size
    this.w = this.rng.int(60, 100);
    this.h = this.rng.int(50, 80);
    this.grid = Array.from({ length: this.h }, () => Array(this.w).fill(0));

    // ── Phase 1: Seed wards at strategic positions ──────────────────────
    const placedWards: { type: typeof WARD_TYPES[0]; cx: number; cy: number }[] = [];

    // Castle goes in center
    const castleType = WARD_TYPES.find(w => w.type === "castle")!;
    const cx = Math.floor(this.w / 2);
    const cy = Math.floor(this.h / 2);
    placedWards.push({ type: castleType, cx, cy });

    // Cathedral nearby
    const cathType = WARD_TYPES.find(w => w.type === "cathedral")!;
    placedWards.push({
      type: cathType,
      cx: cx + this.rng.int(-12, 12),
      cy: cy + this.rng.int(8, 15),
    });

    // Market near center
    const marketType = WARD_TYPES.find(w => w.type === "market")!;
    placedWards.push({
      type: marketType,
      cx: cx + this.rng.int(-10, 10),
      cy: cy - this.rng.int(5, 12),
    });

    // Add 4-7 more wards in surrounding positions
    const remainingTypes = WARD_TYPES.filter(w =>
      !["castle", "cathedral", "market"].includes(w.type)
    );
    const shuffled = this.rng.shuffle([...remainingTypes]);
    const numExtra = this.rng.int(4, 8);
    const angles = this.rng.shuffle([0, Math.PI/2, Math.PI, 3*Math.PI/2, Math.PI/4, 3*Math.PI/4, 5*Math.PI/4, 7*Math.PI/4]);

    for (let i = 0; i < Math.min(numExtra, shuffled.length); i++) {
      const angle = angles[i]!;
      const dist = this.rng.int(18, 30);
      placedWards.push({
        type: shuffled[i]!,
        cx: cx + Math.round(Math.cos(angle) * dist),
        cy: cy + Math.round(Math.sin(angle) * dist),
      });
    }

    // ── Phase 2: Grow wards outward from seeds ──────────────────────────
    // Use flood-fill growth: each ward expands into adjacent empty cells
    for (const pw of placedWards) {
      const wardIdx = this.wards.length;
      const ward: Ward = {
        name: pw.type.name,
        type: pw.type.type,
        cells: [],
        center: { x: pw.cx, y: pw.cy },
      };
      this.wards.push(ward);

      // Start from center cell, flood-fill outward
      if (pw.cx >= 0 && pw.cx < this.w && pw.cy >= 0 && pw.cy < this.h && this.grid[pw.cy]![pw.cx] === 0) {
        this.grid[pw.cy]![pw.cx] = wardIdx + 1;
        ward.cells.push({ x: pw.cx, y: pw.cy });
      }

      const queue: { x: number; y: number }[] = [{ x: pw.cx, y: pw.cy }];
      const targetSize = pw.type.size * pw.type.size * 0.5;
      let expanded = 0;

      while (queue.length > 0 && ward.cells.length < targetSize && expanded < 500) {
        expanded++;
        const c = queue.shift()!;
        const dirs = this.rng.shuffle([[0,-1],[0,1],[-1,0],[1,0]]);
        for (const [dx, dy] of dirs) {
          const nx = c.x + dx, ny = c.y + dy;
          if (nx < 1 || ny < 1 || nx >= this.w - 1 || ny >= this.h - 1) continue;
          if (this.grid[ny]![nx] !== 0) continue;
          if (ward.cells.length >= targetSize) break;

          this.grid[ny]![nx] = wardIdx + 1;
          ward.cells.push({ x: nx, y: ny });
          queue.push({ x: nx, y: ny });
        }
      }
    }

    // ── Phase 3: Fill remaining space with closest ward ─────────────────
    // (Voronoi-like assignment)
    for (let y = 1; y < this.h - 1; y++) {
      for (let x = 1; x < this.w - 1; x++) {
        if (this.grid[y]![x] !== 0) continue;
        let bestWard = -1, bestDist = Infinity;
        for (let wi = 0; wi < this.wards.length; wi++) {
          const center = this.wards[wi]!.center;
          const dist = (x - center.x) ** 2 + (y - center.y) ** 2;
          if (dist < bestDist) { bestDist = dist; bestWard = wi; }
        }
        if (bestWard >= 0) {
          this.grid[y]![x] = bestWard + 1;
          this.wards[bestWard]!.cells.push({ x, y });
        }
      }
    }

    // ── Phase 4: Place buildings within wards ────────────────────────────
    for (const ward of this.wards) {
      if (ward.type === "park" || ward.type === "farm" || ward.type === "wilderness") continue;
      this.placeBuildingsInWard(ward);
    }

    // ── Phase 5: Generate walls around the city ──────────────────────────
    this.generateWalls();

    // ── Phase 6: Generate road network ───────────────────────────────────
    this.generateRoads();

    return {
      width: this.w, height: this.h,
      wards: this.wards,
      buildings: this.buildings,
      walls: this.walls,
      gates: this.gates,
      roads: this.roads,
    };
  }

  private placeBuildingsInWard(ward: Ward) {
    const occupied = new Set<string>();
    const cellArray = this.rng.shuffle([...ward.cells]);

    for (const cell of cellArray) {
      if (occupied.has(`${cell.x},${cell.y}`)) continue;
      const bw = this.rng.int(2, 5);
      const bh = this.rng.int(2, 4);

      // Check if all cells in building footprint are free and in this ward
      let valid = true;
      const footprint: { x: number; y: number }[] = [];
      for (let dy = 0; dy < bh && valid; dy++) {
        for (let dx = 0; dx < bw && valid; dx++) {
          const nx = cell.x + dx, ny = cell.y + dy;
          if (nx >= this.w - 1 || ny >= this.h - 1) { valid = false; break; }
          if (this.grid[ny]![nx] !== this.wards.indexOf(ward) + 1) { valid = false; break; }
          if (occupied.has(`${nx},${ny}`)) { valid = false; break; }
          footprint.push({ x: nx, y: ny });
        }
      }
      if (!valid) continue;

      // Place building
      for (const f of footprint) occupied.add(`${f.x},${f.y}`);
      this.buildings.push({ x: cell.x, y: cell.y, w: bw, h: bh, wardType: ward.type });
    }
  }

  private gates: { x: number; y: number }[] = [];

  private generateWalls() {
    // Find the boundary of the city (cells adjacent to empty cells)
    const boundary = new Set<string>();
    for (let y = 1; y < this.h - 1; y++) {
      for (let x = 1; x < this.w - 1; x++) {
        if (this.grid[y]![x] === 0) continue;
        for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < this.w && ny < this.h && this.grid[ny]![nx] === 0) {
            boundary.add(`${x},${y}`);
            break;
          }
        }
      }
    }

    // Place gates on the 4 cardinal directions
    this.gates = [];
    const cx = Math.floor(this.w / 2), cy = Math.floor(this.h / 2);

    // North gate
    for (let y = 1; y < this.h - 1; y++) {
      for (let x = Math.floor(cx - 3); x <= Math.floor(cx + 3); x++) {
        if (boundary.has(`${x},${y}`)) {
          this.gates.push({ x, y });
          boundary.delete(`${x},${y}`);
          break;
        }
      }
      if (this.gates.length > 0) break;
    }

    // South gate
    for (let y = this.h - 2; y > 1; y--) {
      for (let x = Math.floor(cx - 3); x <= Math.floor(cx + 3); x++) {
        if (boundary.has(`${x},${y}`)) {
          this.gates.push({ x, y });
          boundary.delete(`${x},${y}`);
          break;
        }
      }
      if (this.gates.length > 1) break;
    }

    // Convert remaining boundary cells to wall segments
    const processed = new Set<string>();
    for (const key of boundary) {
      if (processed.has(key)) continue;
      const [sx, sy] = key.split(",").map(Number) as [number, number];

      // Trace wall segment
      let cx2 = sx, cy2 = sy;
      processed.add(key);
      for (const [dx, dy] of [[0,1],[1,0],[0,-1],[-1,0]]) {
        const nx = cx2 + dx, ny = cy2 + dy;
        const nk = `${nx},${ny}`;
        if (boundary.has(nk) && !processed.has(nk)) {
          this.walls.push({ x1: cx2, y1: cy2, x2: nx, y2: ny });
          processed.add(nk);
          cx2 = nx; cy2 = ny;
        }
      }
    }
  }

  private generateRoads() {
    // Simple radial roads from gates toward center, branching
    for (const gate of this.gates) {
      let x = gate.x, y = gate.y;
      const cx = Math.floor(this.w / 2), cy = Math.floor(this.h / 2);
      while (Math.abs(x - cx) > 2 || Math.abs(y - cy) > 2) {
        const nx = x + Math.sign(cx - x);
        const ny = y + Math.sign(cy - y);
        if (nx >= 1 && ny >= 1 && nx < this.w - 1 && ny < this.h - 1) {
          this.roads.push({ x1: x, y1: y, x2: nx, y2: ny, width: 2 });
          x = nx; y = ny;
        } else break;
      }
    }
  }
}
