// ===========================================================================
// Perilous Shores / Realm Generator — faithful port
// Algorithms extracted from com.watabou.perilous.model.Region
// ===========================================================================

import { RNG } from "../lib/rng.js";

// ── Types ───────────────────────────────────────────────────────────────────

export type TerrainType = "ocean" | "water" | "coast" | "plain" | "forest" | "hill" | "mountain";

export interface TerrainCell {
  x: number; y: number;
  elevation: number;
  type: TerrainType;
  land: boolean;
  coast: boolean;
  mountain: boolean;
}

export interface Settlement {
  id: string;
  name: string;
  x: number; y: number;
  type: "city" | "village";
  size: number;
}

export interface POI {
  id: string;
  name: string;
  x: number; y: number;
  type: "dungeon" | "cave" | "landmark" | "ruin" | "tower" | "camp";
}

export interface Road {
  from: { x: number; y: number };
  to: { x: number; y: number };
  type: "highway" | "road" | "lane";
}

export interface RealmData {
  width: number;
  height: number;
  template: string;
  terrain: TerrainCell[];
  settlements: Settlement[];
  pois: POI[];
  roads: Road[];
}

export type TemplateName = "archipelago" | "bay" | "coast" | "fjord" | "island" | "lake" | "land" | "peninsula";

// ── Perlin/Value Noise ──────────────────────────────────────────────────────

class PerlinNoise {
  private perm: number[];

  constructor(rng: RNG) {
    this.perm = Array.from({ length: 512 }, (_, i) => i & 255);
    // Fisher-Yates shuffle
    for (let i = 255; i > 0; i--) {
      const j = rng.intMax(i + 1);
      [this.perm[i], this.perm[j]] = [this.perm[j]!, this.perm[i]!];
    }
    for (let i = 0; i < 256; i++) this.perm[256 + i] = this.perm[i]!;
  }

  private fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10); }
  private lerp(a: number, b: number, t: number): number { return a + t * (b - a); }
  private grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = this.fade(xf), v = this.fade(yf);
    const p = this.perm;
    const aa = p[p[X]! + Y]!, ab = p[p[X]! + Y + 1]!;
    const ba = p[p[X + 1]! + Y]!, bb = p[p[X + 1]! + Y + 1]!;
    return this.lerp(
      this.lerp(this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf), u),
      this.lerp(this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1), u),
      v,
    );
  }

  /** Octave noise — returns value in [0, 1] */
  octave(x: number, y: number, octaves: number, persistence: number = 0.5): number {
    let val = 0, amp = 1, freq = 1, max = 0;
    for (let o = 0; o < octaves; o++) {
      val += this.noise2D(x * freq, y * freq) * amp;
      max += amp;
      amp *= persistence;
      freq *= 2;
    }
    return (val / max + 1) / 2; // normalize to [0, 1]
  }
}

// ── Template Raisers ────────────────────────────────────────────────────────

interface TemplateRaiser {
  raise(x: number, y: number, w: number, h: number): number;
}

/** Creates continental shape by pushing elevation down near edges */
class ContinentRaiser implements TemplateRaiser {
  raise(x: number, y: number, w: number, h: number): number {
    const cx = w / 2, cy = h / 2;
    const dx = (x - cx) / cx, dy = (y - cy) / cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Dome shape: higher in center, lower at edges
    const dome = 1 - Math.min(1, dist * 1.2);
    return dome * 0.5;
  }
}

/** Archipelago: scattered islands */
class ArchipelagoRaiser implements TemplateRaiser {
  private noise: PerlinNoise;
  constructor(rng: RNG) { this.noise = new PerlinNoise(rng); }
  raise(x: number, y: number, _w: number, _h: number): number {
    const n = this.noise.octave(x / 40, y / 40, 3);
    const n2 = this.noise.octave(x / 20 + 100, y / 20 + 100, 2);
    return n * 0.3 + n2 * 0.4;
  }
}

/** Bay: U-shaped landmass with water on one side */
class BayRaiser implements TemplateRaiser {
  private noise: PerlinNoise;
  constructor(rng: RNG) { this.noise = new PerlinNoise(rng); }
  raise(x: number, y: number, w: number, h: number): number {
    const nd = this.noise.octave(x / 50, y / 50, 4);
    const distFromBottom = y / h;
    const bay = distFromBottom * 0.8 + nd * 0.2;
    return bay;
  }
}

/** Coast: land on one side, water on the other */
class CoastRaiser implements TemplateRaiser {
  private noise: PerlinNoise;
  constructor(rng: RNG) { this.noise = new PerlinNoise(rng); }
  raise(x: number, y: number, _w: number, h: number): number {
    const nd = this.noise.octave(x / 40, y / 40, 4);
    const shore = y / h;
    return shore * 0.6 + nd * 0.4;
  }
}

/** Fjord: narrow inlets */
class FjordRaiser implements TemplateRaiser {
  private noise: PerlinNoise;
  constructor(rng: RNG) { this.noise = new PerlinNoise(rng); }
  raise(x: number, y: number, w: number, _h: number): number {
    const nd = this.noise.octave(x / 30, y / 30, 4);
    const ridges = Math.abs(Math.sin(x / w * Math.PI * 3 + y * 0.02));
    return ridges * 0.7 + nd * 0.3;
  }
}

/** Island: single landmass surrounded by water */
class IslandRaiser implements TemplateRaiser {
  private noise: PerlinNoise;
  constructor(rng: RNG) { this.noise = new PerlinNoise(rng); }
  raise(x: number, y: number, w: number, h: number): number {
    const cx = w / 2, cy = h / 2;
    // Use elliptical distance for larger landmass
    const dx = (x - cx) / (cx * 1.3), dy = (y - cy) / (cy * 0.85);
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nd = this.noise.octave(x / 30, y / 30, 3);
    // Softer dome: more land area
    const island = Math.max(0, 1 - dist * 0.8) * 0.7 + nd * 0.3 + 0.1;
    return Math.min(1, island);
  }
}

/** Lake: water in center, land around edges */
class LakeRaiser implements TemplateRaiser {
  private noise: PerlinNoise;
  constructor(rng: RNG) { this.noise = new PerlinNoise(rng); }
  raise(x: number, y: number, w: number, h: number): number {
    const cx = w / 2, cy = h / 2;
    const dx = (x - cx) / (cx * 0.7), dy = (y - cy) / (cy * 0.7);
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nd = this.noise.octave(x / 30, y / 30, 3);
    return Math.min(1, dist) * 0.7 + nd * 0.3;
  }
}

/** Land: mostly land with occasional water */
class LandRaiser implements TemplateRaiser {
  private noise: PerlinNoise;
  constructor(rng: RNG) { this.noise = new PerlinNoise(rng); }
  raise(x: number, y: number, _w: number, _h: number): number {
    const nd = this.noise.octave(x / 50, y / 50, 4);
    return 0.6 + nd * 0.4;
  }
}

/** Peninsula: land extending into water */
class PeninsulaRaiser implements TemplateRaiser {
  private noise: PerlinNoise;
  constructor(rng: RNG) { this.noise = new PerlinNoise(rng); }
  raise(x: number, y: number, w: number, h: number): number {
    const nd = this.noise.octave(x / 40, y / 40, 4);
    const cx = w / 2, cy = h * 0.3;
    const dx = (x - cx) / (w * 0.5), dy = (y - cy) / (h * 0.7);
    const dist = Math.sqrt(dx * dx + dy * dy);
    const pen = Math.max(0, 1 - dist) * 0.8 + nd * 0.2;
    return pen;
  }
}

// ── Water level by template ─────────────────────────────────────────────────
const WATER_LEVELS: Record<TemplateName, number> = {
  archipelago: 0.55, bay: 0.35, coast: 0.45, fjord: 0.28,
  island: 0.55, lake: 0.28, land: -0.10, peninsula: 0.45,
};

// ── Settlement names ────────────────────────────────────────────────────────

const NAMES = [
  "Aldford", "Barrowtown", "Cinderwell", "Dunhollow", "Eastwatch",
  "Fairhaven", "Goldshire", "Highcrest", "Ironvale", "Kingsport",
  "Lakesend", "Mournhold", "Northgate", "Oakvale", "Portsmouth",
  "Queensbury", "Rivertown", "Stonewall", "Thornfield", "Undermill",
  "Westholm", "Yarrow", "Ashbridge", "Briarwood", "Coldspring",
];

const POI_NAMES = [
  "The Gaping Maw", "Shadowfang Keep", "Crystal Caverns", "Serpent's Crawl",
  "Old Watchtower", "Forgotten Shrine", "Bonechill Crevice", "Sunken Ruins",
  "The Howling Mines", "Mossgloom Cave", "Dragon's Tooth", "Whispering Hollow",
  "The Shattered Sanctum", "Stalactite Throne", "Goblin Warrens",
];

// ── Generator ───────────────────────────────────────────────────────────────

export class RealmGenerator {
  private rng!: RNG;
  private noise!: PerlinNoise;
  private raiser!: TemplateRaiser;

  generate(seed: number, template: TemplateName = "island"): RealmData {
    this.rng = new RNG(seed);
    this.noise = new PerlinNoise(this.rng);
    this.raiser = this.createRaiser(template);

    const width = 128;
    const height = 96;
    const waterLevel = WATER_LEVELS[template];

    // ── Phase 1: Elevation ──────────────────────────────────────────────
    // Combine large-scale noise with template raiser
    const landNoise = new PerlinNoise(new RNG((seed * 3 + 1) % 2147483647));
    const detailNoise = new PerlinNoise(new RNG((seed * 7 + 13) % 2147483647));

    const cells: TerrainCell[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const templateE = this.raiser.raise(x, y, width, height);
        const e1 = landNoise.octave(x / 60, y / 60, 4, 0.6);
        const e2 = detailNoise.octave(x / 20, y / 20, 2, 0.3);
        const elevation = templateE * 0.6 + e1 * 0.3 + e2 * 0.1;

        const land = elevation > waterLevel;
        const coast = !land && elevation > waterLevel - 0.03;

        cells.push({ x, y, elevation, land, coast, mountain: false, type: "ocean" });
      }
    }

    // ── Phase 2: Biome assignment ───────────────────────────────────────
    const moistNoise = new PerlinNoise(new RNG((seed * 5 + 7) % 2147483647));
    for (const c of cells) {
      if (!c.land && !c.coast) { c.type = "ocean"; continue; }
      if (c.coast) { c.type = "coast"; continue; }

      const moist = moistNoise.octave(c.x / 40, c.y / 40, 3, 0.5);
      if (c.elevation > waterLevel + 0.25) {
        c.type = "mountain";
      } else if (c.elevation > waterLevel + 0.15) {
        c.type = "hill";
      } else if (moist > 0.55) {
        c.type = "forest";
      } else {
        c.type = "plain";
      }
    }

    // ── Phase 3: Mountain growth ────────────────────────────────────────
    // Grow mountains from highest land cells
    const landCells = cells.filter(c => c.land);
    if (landCells.length > 0) {
      const maxElev = Math.max(...landCells.map(c => c.elevation));
      const candidates = landCells.filter(c => c.elevation > maxElev - 0.08);
      const queue = [...candidates];
      while (queue.length > 0) {
        const c = this.rng.pick(queue);
        c.mountain = true;
        c.type = "mountain";
        // Remove from queue, add neighbors
        const idx = queue.indexOf(c);
        if (idx >= 0) queue.splice(idx, 1);
        for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0],[1,1],[-1,-1],[1,-1],[-1,1]]) {
          const nx = c.x + dx, ny = c.y + dy;
          const neighbor = cells.find(n => n.x === nx && n.y === ny && n.land && !n.mountain);
          if (neighbor && neighbor.elevation > maxElev - 0.15 && !queue.includes(neighbor)) {
            if (this.rng.chance(0.833 * (1 - (maxElev - neighbor.elevation)))) {
              queue.push(neighbor);
            }
          }
        }
      }
    }

    // ── Phase 4: Settlements ────────────────────────────────────────────
    const settlements: Settlement[] = [];
    const flatLand = cells.filter(c => c.land && (c.type === "plain" || c.type === "forest" || c.type === "hill"));
    const numSettlements = this.rng.int(8, 18);
    const settlementCells = this.rng.subset(flatLand, Math.min(numSettlements, flatLand.length));

    for (let i = 0; i < settlementCells.length; i++) {
      const c = settlementCells[i]!;
      const size = this.rng.int(1, 5);
      settlements.push({
        id: `settlement-${seed}-${i}`,
        name: NAMES[i % NAMES.length]! + (i >= NAMES.length ? ` ${i - NAMES.length + 1}` : ""),
        x: c.x, y: c.y,
        type: size >= 4 ? "city" : "village",
        size,
      });
    }

    // ── Phase 5: Roads ──────────────────────────────────────────────────
    const roads: Road[] = [];
    if (settlements.length > 1) {
      const connected = new Set<number>();
      connected.add(0); // start with largest
      while (connected.size < settlements.length) {
        let bestDist = Infinity, bestFrom = 0, bestTo = 0;
        for (const fi of connected) {
          for (let ti = 0; ti < settlements.length; ti++) {
            if (connected.has(ti)) continue;
            const dx = settlements[fi]!.x - settlements[ti]!.x;
            const dy = settlements[fi]!.y - settlements[ti]!.y;
            const dist = dx * dx + dy * dy;
            // Penalize crossing water
            let waterPenalty = 0;
            const sx = settlements[fi]!.x, sy = settlements[fi]!.y;
            const tx = settlements[ti]!.x, ty = settlements[ti]!.y;
            const steps = Math.max(Math.abs(tx - sx), Math.abs(ty - sy)) * 2;
            for (let s = 0; s <= steps; s++) {
              const t = s / steps;
              const px = Math.round(sx + (tx - sx) * t);
              const py = Math.round(sy + (ty - sy) * t);
              const cell = cells.find(n => n.x === px && n.y === py);
              if (cell && !cell.land && !cell.coast) waterPenalty += 10;
              if (cell && cell.mountain) waterPenalty += 5;
            }
            const adjustedDist = dist + waterPenalty * 100;
            if (adjustedDist < bestDist) { bestDist = adjustedDist; bestFrom = fi; bestTo = ti; }
          }
        }

        const from = settlements[bestFrom]!;
        const to = settlements[bestTo]!;
        const roadType: Road["type"] = from.size >= 4 ? "highway" : from.size >= 2 ? "road" : "lane";

        // Midpoint waypoint for slight curves
        const mx = Math.round((from.x + to.x) / 2 + this.rng.int(-10, 10));
        const my = Math.round((from.y + to.y) / 2 + this.rng.int(-10, 10));

        roads.push({ from: { x: from.x, y: from.y }, to: { x: mx, y: my }, type: roadType });
        roads.push({ from: { x: mx, y: my }, to: { x: to.x, y: to.y }, type: roadType });

        connected.add(bestTo);
      }
    }

    // ── Phase 6: POIs ───────────────────────────────────────────────────
    const pois: POI[] = [];
    const remoteCells = landCells.filter(c => {
      return settlements.every(s => Math.abs(s.x - c.x) + Math.abs(s.y - c.y) > 10);
    });
    const numPOIs = this.rng.int(5, 12);
    const poiCells = this.rng.subset(remoteCells, Math.min(numPOIs, remoteCells.length));
    const poiTypes: POI["type"][] = ["dungeon", "cave", "landmark", "ruin", "tower", "camp"];

    for (let i = 0; i < poiCells.length; i++) {
      pois.push({
        id: `poi-${seed}-${i}`,
        name: POI_NAMES[i % POI_NAMES.length]!,
        x: poiCells[i]!.x, y: poiCells[i]!.y,
        type: this.rng.pick(poiTypes),
      });
    }

    return { width, height, template, terrain: cells, settlements, pois, roads };
  }

  private createRaiser(template: TemplateName): TemplateRaiser {
    switch (template) {
      case "archipelago": return new ArchipelagoRaiser(this.rng);
      case "bay": return new BayRaiser(this.rng);
      case "coast": return new CoastRaiser(this.rng);
      case "fjord": return new FjordRaiser(this.rng);
      case "island": return new IslandRaiser(this.rng);
      case "lake": return new LakeRaiser(this.rng);
      case "land": return new LandRaiser(this.rng);
      case "peninsula": return new PeninsulaRaiser(this.rng);
      default: return new IslandRaiser(this.rng);
    }
  }
}
