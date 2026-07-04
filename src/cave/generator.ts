// ===========================================================================
// Cave/Glade Generator
// Port of com.watabou.cave.model.Model — cellular automata-based
// Distinct from dungeons: organic shapes, no rectangular rooms
// ===========================================================================

import { RNG } from "../lib/rng.js";

export interface CaveData {
  title: string;
  story: string;
  /** Grid of cells: 0=solid, 1=cave, 2=water */
  grid: number[][];
  width: number;
  height: number;
  exits: { x: number; y: number }[];
  doors: { x: number; y: number; toArea: number }[];
  areas: { id: number; cells: { x: number; y: number }[]; name: string }[];
}

const CAVE_NAMES = [
  "The Gaping Maw", "Crystalvein Caverns", "The Sunken Grotto",
  "Whispering Hollow", "Fungus Warren", "Echo Depths",
  "The Glittering Abyss", "Mossgloom Cave", "Serpent's Crawl",
  "The Drowned Gallery", "Stalactite Throne", "Bonechill Crevice",
];

const AREA_NAMES = [
  "Grand Chamber", "Narrow Passage", "Crystal Gallery", "Fungal Grove",
  "Underground Lake", "Bat Colony", "Ancient Shrine", "Collapsed Tunnel",
  "Mushroom Forest", "Spider Nest", "Flowing Stream", "Deep Pool",
  "Echo Chamber", "Bone Pit", "Mossy Alcove", "Dripping Ceiling",
];

// ── Generator ───────────────────────────────────────────────────────────────

export class CaveGenerator {
  private rng!: RNG;

  generate(seed: number, size: number = 40): CaveData {
    this.rng = new RNG(seed);

    const w = size;
    const h = Math.floor(size * 0.75);
    const fillProb = 0.45; // initial fill probability

    // ── Phase 1: Random fill ────────────────────────────────────────────
    let grid: number[][] = Array.from({ length: h }, () =>
      Array.from({ length: w }, () => this.rng.chance(fillProb) ? 1 : 0)
    );

    // ── Phase 2: Cellular automata (smoothing) ───────────────────────────
    for (let pass = 0; pass < 4; pass++) {
      const next: number[][] = Array.from({ length: h }, () => Array(w).fill(0));
      const t1 = pass < 2 ? 5 : 4; // death limit
      const t2 = pass < 2 ? 4 : 4; // birth limit

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let neighbors = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const ny = y + dy, nx = x + dx;
              if (ny >= 0 && ny < h && nx >= 0 && nx < w && grid[ny]![nx] === 1) {
                neighbors++;
              }
            }
          if (grid[y]![x] === 1) {
            next[y]![x] = neighbors >= t1 ? 1 : 0;
          } else {
            next[y]![x] = neighbors >= t2 ? 1 : 0;
          }
        }
      }
      grid = next;
    }

    // Force edges to be solid (bedrock)
    for (let y = 0; y < h; y++) grid[y]![0] = grid[y]![w - 1] = 0;
    for (let x = 0; x < w; x++) grid[0]![x] = grid[h - 1]![x] = 0;

    // ── Phase 3: Find connected cave areas (flood fill) ──────────────────
    const visited = Array.from({ length: h }, () => Array(w).fill(false));
    const areas: { id: number; cells: { x: number; y: number }[] }[] = [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (grid[y]![x] !== 1 || visited[y]![x]) continue;

        const cells: { x: number; y: number }[] = [];
        const queue: { x: number; y: number }[] = [{ x, y }];
        visited[y]![x] = true;

        while (queue.length > 0) {
          const c = queue.pop()!;
          cells.push(c);
          for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
            const nx = c.x + dx, ny = c.y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h && grid[ny]![nx] === 1 && !visited[ny]![nx]) {
              visited[ny]![nx] = true;
              queue.push({ x: nx, y: ny });
            }
          }
        }

        if (cells.length >= 8) { // minimum cave size
          areas.push({ id: areas.length, cells });
        }
      }
    }

    // Keep only the largest few areas
    areas.sort((a, b) => b.cells.length - a.cells.length);
    const keptAreas = areas.slice(0, this.rng.int(3, 7));

    // ── Phase 4: Connect areas with narrow passages ──────────────────────
    const doors: { x: number; y: number; toArea: number }[] = [];
    for (let i = 1; i < keptAreas.length; i++) {
      // Find closest pair of cells between area 0 and area i
      let bestDist = Infinity;
      let bestA: { x: number; y: number } | null = null;
      let bestB: { x: number; y: number } | null = null;

      for (const ca of keptAreas[0]!.cells) {
        for (const cb of keptAreas[i]!.cells) {
          const dist = Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y);
          if (dist < bestDist) { bestDist = dist; bestA = ca; bestB = cb; }
        }
      }

      if (bestA && bestB && bestDist < 15) {
        // Carve a narrow passage between the two closest cells
        let cx = bestA.x, cy = bestA.y;
        while (cx !== bestB.x || cy !== bestB.y) {
          grid[cy]![cx] = 1;
          if (cx < bestB.x) cx++;
          else if (cx > bestB.x) cx--;
          else if (cy < bestB.y) cy++;
          else if (cy > bestB.y) cy--;
        }
        grid[bestB.y]![bestB.x] = 1;
        doors.push({ x: Math.floor((bestA.x + bestB.x) / 2), y: Math.floor((bestA.y + bestB.y) / 2), toArea: i });
      }
    }

    // ── Phase 5: Water (fill small pits with water) ──────────────────────
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (grid[y]![x] !== 1) continue;
          let solidNeighbors = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              if (grid[y + dy]![x + dx] === 0) solidNeighbors++;
          if (solidNeighbors >= 8) grid[y]![x] = 2; // water
        }
      }
    }

    // ── Phase 6: Exits ───────────────────────────────────────────────────
    const exits: { x: number; y: number }[] = [];
    // Find cave cells near edges
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (grid[y]![x] !== 1) continue;
        let edgeNeighbors = 0;
        for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
          if (grid[y + dy]![x + dx] === 0) {
            // Check if this solid neighbor is on the boundary
            if (x + dx <= 1 || x + dx >= w - 2 || y + dy <= 1 || y + dy >= h - 2) {
              edgeNeighbors++;
            }
          }
        }
        if (edgeNeighbors >= 1 && exits.length < 4) {
          exits.push({ x, y });
        }
      }
    }

    return {
      title: this.rng.pick(CAVE_NAMES),
      story: `A natural cave system discovered beneath the realm...`,
      grid, width: w, height: h,
      exits,
      doors,
      areas: keptAreas.map((a, i) => ({
        id: a.id,
        cells: a.cells,
        name: this.rng.pick(AREA_NAMES) + (keptAreas.length > 1 ? ` ${i + 1}` : ""),
      })),
    };
  }
}
