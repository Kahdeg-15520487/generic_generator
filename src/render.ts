// ===========================================================================
// ASCII renderer for floor plans
// ===========================================================================

import type { Floor } from "./dwellings/types.js";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Assign a unique display character to each room */
function roomChar(index: number, name?: string): string {
  if (name) return name.charAt(0).toUpperCase();
  return CHARS[index % CHARS.length]!;
}

/**
 * Render a floor as an ASCII grid.
 * Uses double resolution: each logical cell → 1 char interior + wall borders.
 * Legend: `+` corner, `-`/`|` wall, `:` door, `~` window, `S` stairs.
 */
export function renderFloor(floor: Floor): string {
  const allCells = floor.rooms.flatMap((r: { cells: { i: number; j: number }[] }) => r.cells);
  if (allCells.length === 0) return "(empty)";

  // Bounds (i=col, j=row)
  let minI = Infinity, maxI = -Infinity, minJ = Infinity, maxJ = -Infinity;
  for (const c of allCells) {
    if (c.i < minI) minI = c.i; if (c.i > maxI) maxI = c.i;
    if (c.j < minJ) minJ = c.j; if (c.j > maxJ) maxJ = c.j;
  }

  const w = maxI - minI + 1;
  const h = maxJ - minJ + 1;

  // Ownership maps
  const cellChar: string[][] = Array.from({ length: w }, () => Array(h).fill(" "));
  const roomOwner: (string | null)[][] = Array.from({ length: w }, () => Array(h).fill(null));

  for (let ri = 0; ri < floor.rooms.length; ri++) {
    const room = floor.rooms[ri]!;
    const ch = roomChar(ri, room.name);
    for (const c of room.cells) {
      cellChar[c.i - minI]![c.j - minJ] = ch;
      roomOwner[c.i - minI]![c.j - minJ] = room.name ?? null;
    }
  }

  // Door/window/stair sets keyed by "ci,cj,dir"
  const doorSet = new Set(floor.doors.map((d: { edge: { cell: { i: number; j: number }; dir: string } }) =>
    `${d.edge.cell.i - minI},${d.edge.cell.j - minJ},${d.edge.dir}`));
  const windowSet = new Set(floor.windows.map((w: { cell: { i: number; j: number }; dir: string }) =>
    `${w.cell.i - minI},${w.cell.j - minJ},${w.dir}`));
  const stairSet = new Set(floor.stairs.map((s: { cell: { i: number; j: number } }) =>
    `${s.cell.i - minI},${s.cell.j - minJ}`));

  // Output grid: (2w+1) × (2h+1)
  const ow = 2 * w + 1, oh = 2 * h + 1;
  const g: string[][] = Array.from({ length: oh }, () => Array(ow).fill(" "));

  // Fill cell interiors
  for (let ci = 0; ci < w; ci++) {
    for (let cj = 0; cj < h; cj++) {
      const ox = 2 * ci + 1, oy = 2 * cj + 1;
      if (cellChar[ci]![cj] !== " ") {
        g[oy]![ox] = stairSet.has(`${ci},${cj}`) ? "S" : cellChar[ci]![cj]!;
      }
    }
  }

  // Walls between adjacent cells
  for (let ci = 0; ci < w; ci++) {
    for (let cj = 0; cj < h; cj++) {
      const myRoom = roomOwner[ci]![cj];
      if (!myRoom) continue;
      const myI = ci + minI, myJ = cj + minJ;

      // Right neighbor
      if (ci < w - 1) {
        const ox = 2 * (ci + 1), oy = 2 * cj + 1;
        if (roomOwner[ci + 1]![cj] !== myRoom) {
          g[oy]![ox] = doorSet.has(`${myI},${myJ},e`) ? ":" : "|";
        }
      }
      // Down neighbor
      if (cj < h - 1) {
        const ox = 2 * ci + 1, oy = 2 * (cj + 1);
        if (roomOwner[ci]![cj + 1] !== myRoom) {
          g[oy]![ox] = doorSet.has(`${myI},${myJ},s`) ? ":" : "-";
        }
      }
      // Outer walls
      if (cj === 0) {
        const k = `${myI},${myJ},n`;
        g[0]![2 * ci + 1] = doorSet.has(k) ? ":" : windowSet.has(k) ? "~" : "-";
      }
      if (cj === h - 1) {
        const k = `${myI},${myJ},s`;
        g[oh - 1]![2 * ci + 1] = doorSet.has(k) ? ":" : windowSet.has(k) ? "~" : "-";
      }
      if (ci === 0) {
        const k = `${myI},${myJ},w`;
        g[2 * cj + 1]![0] = doorSet.has(k) ? ":" : windowSet.has(k) ? "~" : "|";
      }
      if (ci === w - 1) {
        const k = `${myI},${myJ},e`;
        g[2 * cj + 1]![ow - 1] = doorSet.has(k) ? ":" : windowSet.has(k) ? "~" : "|";
      }
    }
  }

  // Corners
  for (let ox = 0; ox < ow; ox += 2) {
    for (let oy = 0; oy < oh; oy += 2) {
      const up = oy > 0 ? g[oy - 1]![ox]! : " ";
      const dn = oy < oh - 1 ? g[oy + 1]![ox]! : " ";
      const lt = ox > 0 ? g[oy]![ox - 1]! : " ";
      const rt = ox < ow - 1 ? g[oy]![ox + 1]! : " ";
      const hasV = up === "|" || up === "~" || dn === "|" || dn === "~";
      const hasH = lt === "-" || lt === "~" || rt === "-" || rt === "~";
      if (hasV && hasH) g[oy]![ox] = "+";
      else if (hasV) g[oy]![ox] = "|";
      else if (hasH) g[oy]![ox] = "-";
    }
  }

  return g.map(row => row.join("").trimEnd()).join("\n");
}
