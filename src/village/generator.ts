// ===========================================================================
// Village Generator — faithful port with road network, forests, farmland
// ===========================================================================

import { RNG } from "../lib/rng.js";

export interface VillageData {
  width: number;
  height: number;
  buildings: VillageBuilding[];
  roads: VillageRoad[];
  forest: { x: number; y: number }[];
  farmland: { x: number; y: number; w: number; h: number }[];
  palisade: { x1: number; y1: number; x2: number; y2: number }[] | null;
  gates: { x: number; y: number }[] | null;
  water: { points: { x: number; y: number }[] } | null;
}

export interface VillageBuilding {
  x: number; y: number;
  w: number; h: number;
}

export interface VillageRoad {
  points: { x: number; y: number }[];
  width: number;
}

// ── Generator ───────────────────────────────────────────────────────────────

export class VillageGenerator {
  private rng!: RNG;
  private w!: number;
  private h!: number;
  private occupied = new Set<string>();

  generate(seed: number): VillageData {
    this.rng = new RNG(seed);
    this.rng.float();
    this.occupied = new Set<string>();

    this.w = this.rng.int(50, 80);
    this.h = this.rng.int(35, 60);

    // ── Phase 1: Main road ──────────────────────────────────────────────
    const roads: VillageRoad[] = [];
    const mainRoadY = Math.floor(this.h / 2) + this.rng.int(-5, 5);
    const mainRoad: { x: number; y: number }[] = [];
    for (let x = 0; x < this.w; x += this.rng.int(9, 16)) {
      mainRoad.push({ x, y: mainRoadY + this.rng.int(-4, 4) });
    }
    if (mainRoad.length > 0) {
      mainRoad[0] = { x: 0, y: mainRoad[0]!.y };
      mainRoad[mainRoad.length - 1] = { x: this.w - 1, y: mainRoad[mainRoad.length - 1]!.y };
    }
    roads.push({ points: mainRoad, width: 4 });
    for (const p of mainRoad) this.markOccupied(p.x, p.y);

    // ── Phase 2: Cross roads ────────────────────────────────────────────
    for (let i = 1; i < mainRoad.length - 1; i++) {
      if (!this.rng.chance(0.55)) continue;
      const node = mainRoad[i]!;
      const dir = this.rng.chance(0.5) ? 1 : -1;
      const len = this.rng.int(10, 25);
      const endY = node.y + dir * len;
      if (endY < 3 || endY > this.h - 3) continue;

      const crossPoints = [
        { x: node.x, y: node.y },
        { x: node.x + this.rng.int(-3, 4), y: Math.round((node.y + endY) / 2) + this.rng.int(-2, 2) },
        { x: node.x + this.rng.int(-3, 4), y: endY },
      ];
      roads.push({ points: crossPoints, width: 2 });
      for (const p of crossPoints) this.markOccupied(p.x, p.y);
    }

    // ── Phase 3: Buildings along roads ──────────────────────────────────
    const buildings: VillageBuilding[] = [];
    for (const road of roads) {
      for (const point of road.points) {
        for (let attempt = 0; attempt < 4; attempt++) {
          const bw = this.rng.int(3, 7);
          const bh = this.rng.int(2, 5);
          const bx = point.x + this.rng.int(-8, 8) - Math.floor(bw / 2);
          const by = point.y + this.rng.int(-8, 8) - Math.floor(bh / 2);
          if (bx < 2 || by < 2 || bx + bw > this.w - 2 || by + bh > this.h - 2) continue;

          let overlaps = false;
          for (let dx = -1; dx <= bw && !overlaps; dx++)
            for (let dy = -1; dy <= bh && !overlaps; dy++)
              if (this.occupied.has(`${bx + dx},${by + dy}`)) { overlaps = true; break; }
          if (overlaps) continue;

          for (let dx = -1; dx <= bw; dx++)
            for (let dy = -1; dy <= bh; dy++)
              this.occupied.add(`${bx + dx},${by + dy}`);

          buildings.push({ x: bx, y: by, w: bw, h: bh });
          break;
        }
      }
    }

    // ── Phase 4: Forest ─────────────────────────────────────────────────
    const forest: { x: number; y: number }[] = [];
    for (let i = 0; i < 80; i++) {
      const tx = this.rng.int(3, this.w - 3);
      const ty = this.rng.int(3, this.h - 3);
      if (!this.occupied.has(`${tx},${ty}`)) {
        forest.push({ x: tx, y: ty });
        this.occupied.add(`${tx},${ty}`);
      }
    }

    // ── Phase 5: Farmland (clusters near village edge) ──────────────────
    const farmland: { x: number; y: number; w: number; h: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const fx = this.rng.int(2, this.w - 20);
      const fy = this.rng.int(2, this.h - 15);
      const fw = this.rng.int(8, 18);
      const fh = this.rng.int(6, 14);
      farmland.push({ x: fx, y: fy, w: fw, h: fh });
      for (let dy = -1; dy <= fh; dy++)
        for (let dx = -1; dx <= fw; dx++)
          this.occupied.add(`${fx + dx},${fy + dy}`);
    }

    // ── Phase 6: Palisade (optional) ────────────────────────────────────
    let palisade: VillageData["palisade"] = null;
    let gates: VillageData["gates"] = null;
    if (this.rng.chance(0.25)) {
      const m = 3;
      const corners = [
        { x: -m, y: -m }, { x: this.w + m, y: -m },
        { x: this.w + m, y: this.h + m }, { x: -m, y: this.h + m },
      ];
      palisade = [
        { x1: corners[0]!.x, y1: corners[0]!.y, x2: corners[1]!.x, y2: corners[1]!.y },
        { x1: corners[1]!.x, y1: corners[1]!.y, x2: corners[2]!.x, y2: corners[2]!.y },
        { x1: corners[2]!.x, y1: corners[2]!.y, x2: corners[3]!.x, y2: corners[3]!.y },
        { x1: corners[3]!.x, y1: corners[3]!.y, x2: corners[0]!.x, y2: corners[0]!.y },
      ];
      gates = [
        { x: Math.floor(this.w / 2), y: -m },
        { x: Math.floor(this.w / 2), y: this.h + m },
      ];
    }

    // ── Phase 7: Water (optional river) ─────────────────────────────────
    let water: VillageData["water"] = null;
    if (this.rng.chance(0.18)) {
      const ry = this.rng.int(Math.floor(this.h / 4), Math.floor(3 * this.h / 4));
      const pts = [
        { x: 0, y: ry },
        { x: Math.floor(this.w / 3), y: ry + this.rng.int(-3, 4) },
        { x: Math.floor(2 * this.w / 3), y: ry + this.rng.int(-2, 3) },
        { x: this.w - 1, y: ry + this.rng.int(-2, 2) },
      ];
      water = { points: pts };
    }

    return {
      width: this.w, height: this.h,
      buildings, roads, forest, farmland, palisade, gates, water,
    };
  }

  private markOccupied(x: number, y: number) {
    this.occupied.add(`${Math.round(x)},${Math.round(y)}`);
  }
}
