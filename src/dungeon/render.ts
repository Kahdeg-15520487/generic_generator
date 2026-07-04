// ===========================================================================
// ASCII renderer for dungeon maps
// Double-resolution grid: walls between rooms are clearly shown.
// Legend: `-`/`|` wall, `+` corner, `:` door, `S` stairs, `·` column
//          Numbers 1-9 then letters for room interiors.
// ===========================================================================

import type { DungeonData } from "../dungeon/types.js";

const LABELS = "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function renderDungeon(data: DungeonData): string {
  if (data.rects.length === 0) return "(empty)";

  // ── Bounds ──────────────────────────────────────────────────────────────
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const r of data.rects) {
    if (r.x < minX) minX = r.x;
    if (r.x + r.w > maxX) maxX = r.x + r.w;
    if (r.y < minY) minY = r.y;
    if (r.y + r.h > maxY) maxY = r.y + r.h;
  }
  const w = maxX - minX;
  const h = maxY - minY;

  // ── Ownership grid: which room owns each cell ────────────────────────────
  // -1 = outside, 0+ = room index
  const owner: number[][] = Array.from({ length: h }, () => Array(w).fill(-1));
  for (let ri = 0; ri < data.rects.length; ri++) {
    const r = data.rects[ri]!;
    for (let dy = 0; dy < r.h; dy++) {
      for (let dx = 0; dx < r.w; dx++) {
        const gx = r.x - minX + dx;
        const gy = r.y - minY + dy;
        if (gx >= 0 && gy >= 0 && gx < w && gy < h) {
          owner[gy]![gx] = ri;
        }
      }
    }
  }

  // ── Door positions ──────────────────────────────────────────────────────
  const doorMap = new Map<string, { type: number }>();
  for (const d of data.doors) {
    const dx = d.x - minX;
    const dy = d.y - minY;
    doorMap.set(`${dx},${dy}`, { type: d.type });
  }

  // ── Column positions ────────────────────────────────────────────────────
  const colSet = new Set(data.columns.map(c => `${c.x - minX},${c.y - minY}`));

  // ── Double-resolution output: (2w+1) × (2h+1) ───────────────────────────
  const ow = 2 * w + 1;
  const oh = 2 * h + 1;
  const g: string[][] = Array.from({ length: oh }, () => Array(ow).fill(" "));

  // Fill cell interiors at odd positions
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const o = owner[y]![x]!;
      if (o < 0) continue;
      const ox = 2 * x + 1;
      const oy = 2 * y + 1;
      const cellKey = `${x},${y}`;

      if (colSet.has(cellKey)) {
        g[oy]![ox] = "·";
      } else {
        g[oy]![ox] = LABELS[o % LABELS.length]!;
      }
    }
  }

  // Walls: horizontal (between cells vertically adjacent)
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h - 1; y++) {
      const o1 = owner[y]![x]!;
      const o2 = owner[y + 1]![x]!;
      if (o1 === o2) continue;
      const ox = 2 * x + 1;
      const oy = 2 * (y + 1);  // between row y and y+1
      const cellKey = `${x},${y}`;
      const door = doorMap.get(cellKey);
      if (door) {
        g[oy]![ox] = door.type === 8 ? "S" : ":";
      } else if (o1 >= 0 && o2 >= 0) {
        g[oy]![ox] = "-";  // internal wall
      } else {
        g[oy]![ox] = "-";  // outer wall
      }
    }
  }

  // Walls: vertical (between cells horizontally adjacent)
  for (let x = 0; x < w - 1; x++) {
    for (let y = 0; y < h; y++) {
      const o1 = owner[y]![x]!;
      const o2 = owner[y]![x + 1]!;
      if (o1 === o2) continue;
      const ox = 2 * (x + 1);
      const oy = 2 * y + 1;
      const cellKey = `${x},${y}`;
      const door = doorMap.get(cellKey);
      if (door) {
        g[oy]![ox] = door.type === 8 ? "S" : ":";
      } else if (o1 >= 0 && o2 >= 0) {
        g[oy]![ox] = "|";
      } else {
        g[oy]![ox] = "|";
      }
    }
  }

  // Outer walls (top, bottom, left, right edges of rooms)
  for (let x = 0; x < w; x++) {
    // Top edge
    if (owner[0]![x]! >= 0) {
      const ox = 2 * x + 1, oy = 0;
      const door = doorMap.get(`${x},0`);
      g[oy]![ox] = door ? (door.type === 8 ? "S" : ":") : "-";
    }
    // Bottom edge
    if (owner[h - 1]![x]! >= 0) {
      const ox = 2 * x + 1, oy = oh - 1;
      const door = doorMap.get(`${x},${h - 1}`);
      g[oy]![ox] = door ? (door.type === 8 ? "S" : ":") : "-";
    }
  }
  for (let y = 0; y < h; y++) {
    // Left edge
    if (owner[y]![0]! >= 0) {
      const ox = 0, oy = 2 * y + 1;
      const door = doorMap.get(`${0},${y}`);
      g[oy]![ox] = door ? (door.type === 8 ? "S" : ":") : "|";
    }
    // Right edge
    if (owner[y]![w - 1]! >= 0) {
      const ox = ow - 1, oy = 2 * y + 1;
      const door = doorMap.get(`${w - 1},${y}`);
      g[oy]![ox] = door ? (door.type === 8 ? "S" : ":") : "|";
    }
  }

  // Corners
  for (let ox = 0; ox < ow; ox += 2) {
    for (let oy = 0; oy < oh; oy += 2) {
      const up    = oy > 0      ? g[oy - 1]![ox]! : " ";
      const down  = oy < oh - 1 ? g[oy + 1]![ox]! : " ";
      const left  = ox > 0      ? g[oy]![ox - 1]! : " ";
      const right = ox < ow - 1 ? g[oy]![ox + 1]! : " ";
      const hasV = up === "|" || down === "|" || up === ":" || down === ":";
      const hasH = left === "-" || right === "-" || left === ":" || right === ":";
      if (hasV && hasH) g[oy]![ox] = "+";
      else if (hasV)    g[oy]![ox] = "|";
      else if (hasH)    g[oy]![ox] = "-";
    }
  }

  // Trim empty rows/cols
  const lines = g.map(row => row.join("").replace(/ +$/, ""));
  while (lines.length > 0 && lines[0]!.trim() === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") lines.pop();
  return lines.join("\n");
}
