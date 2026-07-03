// ===========================================================================
// Dwellings — JSON exporter
// Port of com.watabou.dwellings.model.JsonExporter
// ===========================================================================

import { Dir } from "../lib/dir.js";
import { Grid, type Cell, type Edge } from "../lib/grid.js";
import type { House, Floor, Room, Door, Window, Stair } from "./types.js";

interface InternalRoom {
  area: Cell[];
  type: { name: string } | null;
  doors: { edge: Edge }[];
}

interface InternalFloor {
  rooms: InternalRoom[];
  entrance: { door: Edge } | null;
  spiral: { entrance: Edge; landing: Cell } | null;
  windows: Edge[];
  stairs: { cell: Cell; dir: Dir; up: boolean }[];
}

export function exportHouse(
  floors: InternalFloor[],
  exitEdge: Edge,
  grid: Grid,
  hasBasement: boolean,
): House {
  const outFloors: Floor[] = [];

  for (let i = 0; i < floors.length; i++) {
    const level = hasBasement ? (i === 0 ? -1 : i - 1) : i;
    outFloors.push(exportFloor(floors[i], grid, level));
  }

  const exit: House["exit"] = {
    cell: cellData(grid.edge2cell(exitEdge)),
    dir: dirStr(exitEdge.dir),
  };

  const result: House = { floors: outFloors, exit };

  const gf = floors[hasBasement ? 1 : 0];
  if (gf.spiral) {
    result.spiral = {
      cell: cellData(gf.spiral.landing),
      dir: dirStr(gf.spiral.entrance.dir),
    };
  }

  return result;
}

function exportFloor(floor: InternalFloor, grid: Grid, level: number): Floor {
  const rooms: Room[] = floor.rooms.map(r => ({
    name: r.type?.name,
    cells: r.area.map(c => ({ i: c.j, j: c.i })),
  }));

  const doors: Door[] = [];
  for (const room of floor.rooms) {
    for (const d of room.doors) {
      const cell = grid.edge2cell(d.edge);
      doors.push({
        edge: { cell: cellData(cell), dir: dirStr(d.edge.dir) },
        type: "regular",
      });
    }
  }

  const windows: Window[] = floor.windows.map(e => ({
    cell: cellData(grid.edge2cell(e)),
    dir: dirStr(e.dir),
  }));

  const stairs: Stair[] = floor.stairs.map(s => ({
    cell: { i: s.cell.j, j: s.cell.i },
    dir: dirStr(s.dir),
    up: s.up,
  }));

  return { level, rooms, doors, windows, stairs };
}

function cellData(c: Cell | null): { i: number; j: number } {
  if (!c) return { i: 0, j: 0 };
  return { i: c.j, j: c.i };
}

function dirStr(d: Dir): "n" | "s" | "e" | "w" {
  if (d === Dir.N) return "n";
  if (d === Dir.S) return "s";
  if (d === Dir.E) return "e";
  if (d === Dir.W) return "w";
  return "n";
}
