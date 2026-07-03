// ===========================================================================
// Dwellings — shape generation (polyomino + box)
// Port of com.watabou.dwellings.model.Drafter + Polyomino
// ===========================================================================

import { RNG } from "../lib/rng.js";
import { Grid } from "../lib/grid.js";
import type { Cell } from "../lib/grid.js";

// Tetromino shapes (standard + rotations)
const TETROMINOES: number[][][] = [
  [[1,1,1,1]], [[1],[1],[1],[1]],                       // I
  [[1,1],[1,1]],                                          // O
  [[0,1,0],[1,1,1]], [[1,0],[1,1],[1,0]],               // T
  [[1,0],[1,0],[1,1]], [[1,1,1],[1,0,0]],               // L
  [[0,1],[0,1],[1,1]], [[1,0,0],[1,1,1]],               // J
  [[0,1,1],[1,1,0]], [[1,0],[1,1],[0,1]],               // S
  [[1,1,0],[0,1,1]], [[0,1],[1,1],[1,0]],               // Z
];

const PENTOMINOES: number[][][] = [
  [[1,0,0],[1,1,1],[0,0,1]],                              // F
  [[1,1,1,1,1]], [[1],[1],[1],[1],[1]],                   // I
  [[1,0,0,0],[1,1,1,1]], [[1,1],[1,0],[1,0],[1,0]],      // L
  [[1,1,0,0],[0,1,1,1]],                                  // N
  [[1,1],[1,1],[1,0]], [[1,1,1],[1,1,0]],                 // P
  [[1,1,1],[0,1,0],[0,1,0]],                              // T (pento)
  [[1,0,1],[1,1,1]], [[1,1],[0,1],[1,1]],                 // U
  [[1,0,0],[1,0,0],[1,1,1]],                              // V
  [[1,0,0],[1,1,0],[0,1,1]],                              // W
  [[0,1,0],[1,1,1],[0,1,0]],                              // X
  [[1,0],[1,1],[1,0],[1,0]], [[0,1,0,0],[1,1,1,1]],      // Y
  [[1,1,0],[0,1,0],[0,1,1]],                              // Z (pento)
];

function createPolyomino(rng: RNG, minCols: number, maxCols: number): { x: number; y: number }[] {
  const size = Math.max(8, 3 * maxCols + 2);
  const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const mirrorX = rng.chance(0.5);
  const mirrorY = rng.chance(0.5);
  const rotate = rng.chance(0.5);

  let shape = rng.pick([...TETROMINOES, ...PENTOMINOES]);
  if (mirrorX) shape = shape.map(r => [...r].reverse());
  if (mirrorY) shape = [...shape].reverse();
  if (rotate) {
    const h = shape[0].length, w = shape.length;
    shape = Array.from({ length: w }, (_, x) =>
      Array.from({ length: h }, (_, y) => shape[w - 1 - x]?.[y] ?? 0)
    );
  }

  // Place in center
  const cy = Math.floor(size / 2) - Math.floor(shape.length / 2);
  const cx = Math.floor(size / 2) - Math.floor(shape[0].length / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c]) grid[cy + r]![cx + c] = true;

  // Grow by cellular automata
  for (let iter = 0; iter < 10; iter++) {
    const cands: [number, number][] = [];
    for (let y = 1; y < size - 1; y++)
      for (let x = 1; x < size - 1; x++)
        if (!grid[y][x]) {
          let n = 0;
          if (grid[y - 1]?.[x]) n++; if (grid[y + 1]?.[x]) n++;
          if (grid[y]?.[x - 1]) n++; if (grid[y]?.[x + 1]) n++;
          if (n >= 2) cands.push([x, y]);
        }
    if (cands.length === 0) break;
    const [x, y] = rng.pick(cands);
    grid[y][x] = true;
  }

  const points: { x: number; y: number }[] = [];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (grid[y][x]) points.push({ x, y });
  return points;
}

export function generateShape(
  rng: RNG,
  minArea: number,
  maxArea: number,
  square: boolean,
): { grid: Grid; area: Cell[] } {
  // Try polyomino
  if (!square) {
    const cols = Math.max(1, Math.round(minArea / 10));
    for (let i = 0; i < 30; i++) {
      const pts = createPolyomino(rng, cols, cols + 1);
      if (pts.length >= minArea && pts.length <= maxArea)
        return Grid.cloud2grid(pts);
    }
  }
  // Fallback: rectangle
  for (let i = 0; i < 50; i++) {
    const c = Math.round(2 + 6 * rng.float());
    const d = Math.round(2 + 6 * rng.float());
    if (c * d >= minArea && c * d <= maxArea) {
      const pts: { x: number; y: number }[] = [];
      for (let y = 0; y < d; y++)
        for (let x = 0; x < c; x++) pts.push({ x, y });
      return Grid.cloud2grid(pts);
    }
  }
  // Last resort
  const n = Math.round(Math.sqrt(minArea));
  const pts: { x: number; y: number }[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) pts.push({ x, y });
  return Grid.cloud2grid(pts);
}
