// ===========================================================================
// Dwellings — main generator
// Port of com.watabou.dwellings.model.House + Plan + RegularHouseType + Specs
// ===========================================================================

import { RNG } from "../lib/rng.js";
import { Dir } from "../lib/dir.js";
import { Grid, type Cell, type Edge } from "../lib/grid.js";
import { generateShape } from "./shapes.js";
import type { House, Floor, Room, Door, Window, Stair, Tag } from "./types.js";
import { exportHouse } from "./export.js";

// ── Internal types ──────────────────────────────────────────────────────────

interface RoomTypeDef {
  name: string;
  minSize: number;
  maxSize: number;
  allowedFloors: number[];
}

interface InternalRoom {
  area: Cell[];
  contour: Edge[];
  narrow: Cell[];
  doors: DoorDef[];
  type: RoomTypeDef | null;
}

interface DoorDef {
  edge: Edge;
  room1: InternalRoom;
  room2: InternalRoom | null;
}

interface Stairwell {
  stair: Cell;
  landing: Cell;
  exit: Dir;
  room: InternalRoom;
}

interface InternalFloor {
  grid: Grid;
  area: Cell[];
  contour: Edge[];
  rooms: InternalRoom[];
  entrance: { door: Edge; landing: Cell } | null;
  spiral: { entrance: Edge; exit: Edge; landing: Cell } | null;
  stairwell: Stairwell | null;
  windows: Edge[];
  stairs: StairEntry[];
}

interface StairEntry {
  cell: Cell;
  dir: Dir;
  up: boolean;
}

// ── Room type definitions ───────────────────────────────────────────────────

const SPECIALS: RoomTypeDef[] = [
  { name: "Study",         minSize: 3, maxSize: 12, allowedFloors: [0,1,2,3] },
  { name: "Library",       minSize: 4, maxSize: 14, allowedFloors: [0,1,2,3] },
  { name: "Gallery",       minSize: 4, maxSize: 16, allowedFloors: [0,1,2,3] },
  { name: "Armoury",       minSize: 3, maxSize: 10, allowedFloors: [0,-1] },
  { name: "Chapel",        minSize: 3, maxSize: 10, allowedFloors: [0] },
  { name: "Laboratory",    minSize: 3, maxSize: 10, allowedFloors: [-1,0] },
  { name: "Observatory",   minSize: 2, maxSize: 6,  allowedFloors: [2,3] },
  { name: "Greenhouse",    minSize: 3, maxSize: 10, allowedFloors: [0] },
  { name: "Studio",        minSize: 3, maxSize: 10, allowedFloors: [0,1,2,3] },
  { name: "Trophy Room",   minSize: 3, maxSize: 12, allowedFloors: [0,1,2,3] },
  { name: "Lookout",       minSize: 2, maxSize: 5,  allowedFloors: [2,3] },
  { name: "Vault",         minSize: 2, maxSize: 6,  allowedFloors: [-1] },
];

// ── Generator ───────────────────────────────────────────────────────────────

export class DwellingsGenerator {
  private rng!: RNG;
  private avgRoomSize = 6;

  /**
   * Generate a complete multi-story house.
   * @param seed  Random seed for reproducible output
   * @param tags  Optional style tags (e.g. "large", "slab", "spiral")
   * @param plan  Optional hex-encoded blueprint
   */
  generate(seed: number, tags: Tag[] = [], plan?: string): House {
    this.rng = new RNG(seed);
    this.rng.float(); // advance once (matches original)

    const size = tags.includes("large") ? [24,34] : tags.includes("small") ? [10,16] : [16,24];
    const isSquare = tags.includes("square");
    const isSlab = tags.includes("slab");
    const hasSpiral = tags.includes("spiral") || false;
    const hasStairwell = tags.includes("stairwell") || false;
    const noBasement = tags.includes("basement");
    const isGeneric = tags.includes("generic");

    // Shape
    const shape = generateShape(this.rng, size[0], size[1], isSquare);
    const { grid, area } = shape;
    const contour = grid.outline(area);

    // Floors
    let nFloors = 2;
    if (tags.includes("tall")) nFloors = 3;
    if (tags.includes("low")) nFloors = 1;
    if (hasSpiral || hasStairwell) nFloors = Math.max(2, nFloors);

    // Pick entrance
    const entrance = this.pickEntrance(grid, contour);
    const entranceCell = grid.edge2cell(entrance.door)!;

    // Stairwell (pick a cell for stacked stairs)
    let stairwell: Stairwell | null = null;
    if (nFloors > 1 && !hasSpiral) {
      stairwell = this.pickStairwell(grid, area, entranceCell);
    }

    // Build floors
    const floors: InternalFloor[] = [];
    let prevArea = [...area];

    // Ground floor
    const ground = this.buildFloor(grid, prevArea, stairwell, entrance, null);
    ground.entrance = entrance;
    floors.push(ground);

    // Upper floors
    for (let f = 1; f < nFloors; f++) {
      if (!isSlab && f > 0) {
        // Shrink upper floor: remove a room
        const prevFloor = floors[f - 1];
        const candidateRooms = prevFloor.rooms.filter(r =>
          r !== prevFloor.stairwell?.room &&
          r !== (prevFloor.spiral?.landing as unknown as InternalRoom)
        );
        if (candidateRooms.length > 0) {
          const room = this.rng.pick(candidateRooms);
          prevArea = prevArea.filter(c => !room.area.some(rc => rc.i === c.i && rc.j === c.j));
        }
      }
      const upper = this.buildFloor(grid, prevArea, stairwell, null, null);
      floors.push(upper);
      this.connectFloors(floors[f - 1], floors[f]);
    }

    // Basement (50% chance unless disabled)
    if (!noBasement && this.rng.chance(0.5)) {
      const largestRoom = [...ground.rooms].sort((a, b) => b.area.length - a.area.length)[0];
      const oldAvg = this.avgRoomSize;
      this.avgRoomSize = 12;
      const bsmt = this.buildFloor(grid, [...largestRoom.area], stairwell, null, null);
      this.avgRoomSize = oldAvg;
      this.connectFloors(bsmt, ground);
      floors.unshift(bsmt);
      // Re-label: basement = -1, ground = 0, etc.
      for (let i = 0; i < floors.length; i++) {
        // We'll handle levels in export
      }
    }

    // Assign room types
    this.assignRoomTypes(floors, isGeneric);

    // Compute doors (cell adjacency)
    for (const floor of floors) {
      this.computeDoors(floor);
    }

    // Generate windows
    for (let fi = 0; fi < floors.length; fi++) {
      floors[fi].windows = [];
      for (const e of floors[fi].contour) {
        if (floors[fi].entrance?.door === e) continue;
        if (floors[fi].spiral?.entrance === e) continue;
        if (this.rng.chance(0.25)) floors[fi].windows.push(e);
      }
    }

    // Export
    const isBasement = !noBasement && this.rng.chance(0.5); // match earlier logic
    // Re-determine: basement was already created above
    let hasBasementActual = floors.length > nFloors;
    
    return exportHouse(floors, entrance.door, grid, hasBasementActual);
  }

  // ── Floor construction ──────────────────────────────────────────────────

  private buildFloor(
    grid: Grid,
    area: Cell[],
    stairwell: Stairwell | null,
    entrance: { door: Edge; landing: Cell } | null,
    _spiral: any,
  ): InternalFloor {
    const contour = grid.outline(area);
    const rooms = this.partitionRooms(grid, area, contour);

    const floor: InternalFloor = {
      grid, area, contour, rooms,
      entrance: entrance ? { ...entrance } : null,
      spiral: null,
      stairwell: stairwell ? { ...stairwell, room: null as any } : null,
      windows: [],
      stairs: [],
    };

    // Create stairwell room if needed
    if (stairwell) {
      const swRoom = rooms.find(r =>
        r.area.some(c => c.i === stairwell.stair.i && c.j === stairwell.stair.j)
      );
      if (swRoom) stairwell.room = swRoom;
    }

    return floor;
  }

  /** Flood-fill based room partitioning */
  private partitionRooms(grid: Grid, area: Cell[], _contour: Edge[]): InternalRoom[] {
    const targetSize = this.avgRoomSize;
    if (area.length <= targetSize * 3) {
      // Single room
      const cont = grid.outline(area);
      const narrow = area.filter(c => this.isNarrowCell(area, grid, c));
      return [{ area, contour: cont, narrow, doors: [], type: null }];
    }

    const numRooms = Math.max(2, Math.floor(area.length / targetSize));
    const sorted = [...area].sort((a, b) => a.i - b.i || a.j - b.j);
    const assigned = new Set<string>();
    const groups: Cell[][] = [];

    for (let g = 0; g < numRooms; g++) {
      const seedIdx = g * Math.floor(sorted.length / numRooms);
      if (seedIdx >= sorted.length) break;
      const seed = sorted[seedIdx];
      if (assigned.has(seed.i + "," + seed.j)) continue;

      const group: Cell[] = [];
      const queue: Cell[] = [seed];
      const maxSize = Math.ceil(area.length / (numRooms - g));

      while (queue.length > 0 && group.length < maxSize) {
        const c = queue.shift()!;
        const key = c.i + "," + c.j;
        if (assigned.has(key)) continue;
        if (!area.some(a => a.i === c.i && a.j === c.j)) continue;
        assigned.add(key);
        group.push(c);

        for (const dir of Dir.CARDINAL) {
          const n = grid.cell(c.i + dir.di, c.j + dir.dj);
          if (n && !assigned.has(n.i + "," + n.j)) queue.push(n);
        }
      }

      if (group.length >= 2) groups.push(group);
    }

    return groups.map(cells => {
      const cont = grid.outline(cells);
      const narrow = cells.filter(c => this.isNarrowCell(cells, grid, c));
      return { area: cells, contour: cont, narrow, doors: [], type: null };
    });
  }

  private isNarrowCell(area: Cell[], grid: Grid, cell: Cell): boolean {
    const n = grid.cell(cell.i + Dir.N.di, cell.j + Dir.N.dj);
    const s = grid.cell(cell.i + Dir.S.di, cell.j + Dir.S.dj);
    const e = grid.cell(cell.i + Dir.E.di, cell.j + Dir.E.dj);
    const w = grid.cell(cell.i + Dir.W.di, cell.j + Dir.W.dj);
    const nIn = n && area.some(c => c.i === n.i && c.j === n.j);
    const sIn = s && area.some(c => c.i === s.i && c.j === s.j);
    const eIn = e && area.some(c => c.i === e.i && c.j === e.j);
    const wIn = w && area.some(c => c.i === w.i && c.j === w.j);
    if (!nIn && !sIn) return true;
    if (!eIn && !wIn) return true;
    return false;
  }

  // ── Entrance ─────────────────────────────────────────────────────────────

  private pickEntrance(grid: Grid, contour: Edge[]): { door: Edge; landing: Cell } {
    const scores = contour.map((curr, i) => {
      const prev = contour[(i + contour.length - 1) % contour.length];
      const next = contour[(i + 1) % contour.length];
      if (prev.dir === curr.dir && curr.dir === next.dir) return 5;
      if (prev.dir.cw === curr.dir && curr.dir.cw === next.dir) return 3;
      if (prev.dir.ccw !== curr.dir && curr.dir.ccw !== next.dir) return 1;
      return 0;
    });
    const door = this.rng.weighted(contour, scores);
    return { door, landing: grid.edge2cell(door)! };
  }

  // ── Stairwell ────────────────────────────────────────────────────────────

  private pickStairwell(grid: Grid, area: Cell[], entranceCell: Cell): Stairwell | null {
    const candidates = area.filter(c => {
      if (c.i === entranceCell.i && c.j === entranceCell.j) return false;
      const without = area.filter(x => !(x.i === c.i && x.j === c.j));
      const filled = this.floodFill(grid, without, without[0]);
      return filled.length === without.length;
    });
    if (candidates.length === 0) return null;

    const scores = candidates.map(c => {
      let walls = 0;
      for (const dir of Dir.CARDINAL) {
        const n = grid.cell(c.i + dir.di, c.j + dir.dj);
        if (n && !area.some(x => x.i === n.i && x.j === n.j)) walls++;
      }
      return 4 - walls;
    });
    const stair = this.rng.weighted(candidates, scores);

    const validDirs = Dir.CARDINAL.filter(d => {
      const n = grid.cell(stair.i + d.di, stair.j + d.dj);
      return n && area.some(c => c.i === n.i && c.j === n.j);
    });
    const exit = validDirs.length > 0 ? this.rng.pick(validDirs) : Dir.S;
    const landing = grid.cell(stair.i + exit.di, stair.j + exit.dj)!;

    return { stair, landing, exit, room: null as any };
  }

  private floodFill(grid: Grid, area: Cell[], start: Cell): Cell[] {
    const visited: Cell[] = [start];
    const queue: Cell[] = [start];
    const areaSet = new Set(area.map(c => `${c.i},${c.j}`));
    while (queue.length > 0) {
      const c = queue.pop()!;
      for (const dir of Dir.CARDINAL) {
        const n = grid.cell(c.i + dir.di, c.j + dir.dj);
        if (n && areaSet.has(`${n.i},${n.j}`) && !visited.some(v => v.i === n.i && v.j === n.j)) {
          visited.push(n);
          queue.push(n);
        }
      }
    }
    return visited;
  }

  // ── Stairs between floors ────────────────────────────────────────────────

  private connectFloors(lower: InternalFloor, upper: InternalFloor): void {
    const lowerCells = this.stairCandidates(lower);
    const upperCells = this.stairCandidates(upper);
    const common = lowerCells.filter(c => upperCells.some(u => u.i === c.i && u.j === c.j));

    if (common.length === 0) return;
    const cell = this.rng.pick(common);

    lower.stairs.push({ cell, dir: Dir.N, up: true });
    upper.stairs.push({ cell, dir: Dir.S, up: false });
  }

  private stairCandidates(floor: InternalFloor): Cell[] {
    const exclude = new Set<string>();
    if (floor.entrance) exclude.add(`${floor.entrance.landing.i},${floor.entrance.landing.j}`);
    if (floor.stairwell) {
      exclude.add(`${floor.stairwell.stair.i},${floor.stairwell.stair.j}`);
      exclude.add(`${floor.stairwell.landing.i},${floor.stairwell.landing.j}`);
    }

    const cells: Cell[] = [];
    for (const room of floor.rooms) {
      for (const c of room.area) {
        if (exclude.has(`${c.i},${c.j}`)) continue;
        const n = floor.grid.cell(c.i + Dir.N.di, c.j + Dir.N.dj);
        const s = floor.grid.cell(c.i + Dir.S.di, c.j + Dir.S.dj);
        const e = floor.grid.cell(c.i + Dir.E.di, c.j + Dir.E.dj);
        const w = floor.grid.cell(c.i + Dir.W.di, c.j + Dir.W.dj);
        const nIn = n && room.area.some(x => x.i === n.i && x.j === n.j);
        const sIn = s && room.area.some(x => x.i === s.i && x.j === s.j);
        const eIn = e && room.area.some(x => x.i === e.i && x.j === e.j);
        const wIn = w && room.area.some(x => x.i === w.i && x.j === w.j);
        if ((nIn || sIn) && (eIn || wIn)) continue; // interior cell, skip
        cells.push(c);
      }
    }
    return cells;
  }

  // ── Room types ───────────────────────────────────────────────────────────

  private assignRoomTypes(floors: InternalFloor[], isGeneric: boolean): void {
    const allRooms: { room: InternalRoom; level: number }[] = [];
    for (let fi = 0; fi < floors.length; fi++) {
      const level = fi === 0 ? (floors.length > 2 ? -1 : 0) : fi === 1 ? 0 : fi - 1;
      for (const r of floors[fi].rooms) {
        allRooms.push({ room: r, level });
      }
    }

    // Primary types (always try to assign)
    const primary: RoomTypeDef[] = [
      { name: "Living Room", minSize: 6, maxSize: 30, allowedFloors: [0] },
      { name: "Bathroom",    minSize: 2, maxSize: 6,  allowedFloors: [0,1,2,3] },
      { name: "Bedroom",     minSize: 4, maxSize: 16, allowedFloors: [0,1,2,3] },
    ];

    // Special rooms
    if (!isGeneric) {
      const n = Math.floor(1 + this.rng.float() * 2);
      primary.push(...this.rng.subset(SPECIALS, n));
    }

    // Secondary types
    const secondary: RoomTypeDef[] = [
      { name: "Kitchen",  minSize: 3, maxSize: 12, allowedFloors: [0] },
      { name: "Storage",  minSize: 2, maxSize: 8,  allowedFloors: [-1,0,1,2,3] },
      { name: "Hall",     minSize: 2, maxSize: 8,  allowedFloors: [-1,0,1,2,3] },
      { name: "Gallery",  minSize: 4, maxSize: 16, allowedFloors: [0,1,2,3] },
    ];
    if (floors.length > 2) {
      secondary.push({ name: "Cellar", minSize: 3, maxSize: 14, allowedFloors: [-1] });
    }
    if (floors.length > 1) {
      secondary.push({ name: "Attic", minSize: 3, maxSize: 12, allowedFloors: [2,3] });
      secondary.push({ name: "Bedroom", minSize: 4, maxSize: 16, allowedFloors: [0,1,2,3] });
    }

    // Assign: try primary first, then secondary
    const unassigned = allRooms.filter(x => x.room.type === null);
    this.assignTypeSet(unassigned, primary);
    this.assignTypeSet(unassigned.filter(x => x.room.type === null), this.rng.shuffle([...secondary]));
  }

  private assignTypeSet(
    entries: { room: InternalRoom; level: number }[],
    types: RoomTypeDef[],
  ): void {
    for (const type of types) {
      for (const entry of entries) {
        if (entry.room.type !== null) continue;
        if (!type.allowedFloors.includes(entry.level)) continue;
        if (entry.room.area.length < type.minSize) continue;
        if (entry.room.area.length > type.maxSize) continue;
        entry.room.type = type;
        break; // each type assigned at most once
      }
    }
  }

  // ── Doors ────────────────────────────────────────────────────────────────

  private computeDoors(floor: InternalFloor): void {
    for (let i = 0; i < floor.rooms.length; i++) {
      for (let j = i + 1; j < floor.rooms.length; j++) {
        const r1 = floor.rooms[i];
        const r2 = floor.rooms[j];
        const r2set = new Set(r2.area.map(c => `${c.i},${c.j}`));
        const touching: { cell: Cell; dir: Dir }[] = [];

        for (const c of r1.area) {
          for (const dir of Dir.CARDINAL) {
            const n = floor.grid.cell(c.i + dir.di, c.j + dir.dj);
            if (n && r2set.has(`${n.i},${n.j}`)) {
              touching.push({ cell: c, dir });
            }
          }
        }

        if (touching.length > 0) {
          const pick = this.rng.pick(touching);
          const edge = floor.grid.cellNdir2edge(pick.cell, pick.dir);
          if (edge) {
            r1.doors.push({ edge, room1: r1, room2: r2 });
          }
        }
      }
    }
  }
}
