// ===========================================================================
// ASCII renderer for dungeon maps
// Renders rooms as rectangles with doors marked
// ===========================================================================

import type { DungeonData, Rect } from "../dungeon/types.js";

/**
 * Render dungeon as ASCII. Each cell is 1 character.
 * Legend: `#` wall boundary, `:` door, `.` floor, `+` column.
 */
export function renderDungeon(data: DungeonData): string {
  // Bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const r of data.rects) {
    if (r.x < minX) minX = r.x;
    if (r.x + r.w > maxX) maxX = r.x + r.w;
    if (r.y < minY) minY = r.y;
    if (r.y + r.h > maxY) maxY = r.y + r.h;
  }

  const w = maxX - minX + 3;
  const h = maxY - minY + 3;
  const grid: string[][] = Array.from({ length: h }, () => Array(w).fill(" "));

  // Fill room interiors
  for (const r of data.rects) {
    const rx = r.x - minX + 1;
    const ry = r.y - minY + 1;
    for (let dy = 0; dy < r.h; dy++) {
      for (let dx = 0; dx < r.w; dx++) {
        grid[ry + dy]![rx + dx] = ".";
      }
    }
  }

  // Draw room walls (where . borders space)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y]![x] !== ".") continue;
      for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || grid[ny]![nx] === " ") {
          grid[y]![x] = "#";
        }
      }
    }
  }

  // Re-fill interiors
  for (const r of data.rects) {
    const rx = r.x - minX + 1;
    const ry = r.y - minY + 1;
    for (let dy = 1; dy < r.h - 1; dy++) {
      for (let dx = 1; dx < r.w - 1; dx++) {
        grid[ry + dy]![rx + dx] = ".";
      }
    }
  }

  // Mark doors
  for (const d of data.doors) {
    const dx = d.x - minX + 1;
    const dy = d.y - minY + 1;
    if (dx >= 0 && dy >= 0 && dx < w && dy < h) {
      grid[dy]![dx] = d.type === 8 ? "S" : ":";
    }
  }

  // Mark columns
  for (const c of data.columns) {
    const cx = c.x - minX + 1;
    const cy = c.y - minY + 1;
    if (cx >= 0 && cy >= 0 && cx < w && cy < h && grid[cy]![cx] === ".") {
      grid[cy]![cx] = "+";
    }
  }

  return grid.map(row => row.join("")).join("\n");
}
