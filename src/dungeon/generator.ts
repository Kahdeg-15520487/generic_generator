// ===========================================================================
// One Page Dungeon — generator
// Port of com.watabou.dungeon.model.Dungeon + Planner
// ===========================================================================

import { RNG } from "../lib/rng.js";
import type { DungeonData, Rect, Door, Note, Column, DungeonTag } from "./types.js";

// ── Internal types ──────────────────────────────────────────────────────────

interface InternalRoom {
  x: number; y: number;
  w: number; h: number;
  seed: number;
  round: boolean;
  desc: string | null;
  hidden: boolean;
  columns: boolean;
  axis: { x: number; y: number };
  ending: boolean;
}

interface InternalDoor {
  x: number; y: number;
  dir: { x: number; y: number };
  type: number;
  room1: InternalRoom;
  room2: InternalRoom | null;
}

type DirVec = { x: number; y: number };

const DIRS: DirVec[] = [
  { x: 0, y: -1 },  // up
  { x: 1, y: 0 },   // right
  { x: 0, y: 1 },   // down
  { x: -1, y: 0 },  // left
];

// ── Story generation (simplified Markov-like naming) ────────────────────────

const DUNGEON_NAMES = [
  "The Sunken Crypt", "Shadowfang Keep", "The Howling Mines",
  "Barrow of the Forgotten King", "The Labyrinth of Echoes",
  "Thornhall Bastion", "The Gilded Sepulcher", "Wormskull Catacombs",
  "The Iron Ossuary", "Cinderwell Depths", "The Crystal Vault",
  "Hollowmere Prison", "The Shattered Sanctum",
];

const ROOM_NAMES = [
  "Abandoned Guardpost", "Ancient Shrine", "Armory", "Banquet Hall",
  "Barracks", "Cell Block", "Chapel of Shadows", "Collapsed Tunnel",
  "Crypt", "Dark Pool", "Desecrated Altar", "Forgotten Library",
  "Fungal Grove", "Guard Room", "Hidden Vault", "Infested Chamber",
  "Kitchen", "Makeshift Camp", "Narrow Passage", "Ossuary",
  "Prison Pit", "Ritual Chamber", "Secret Study", "Spider Nest",
  "Storage Room", "Torture Chamber", "Trapped Corridor", "Treasure Vault",
  "Underground Spring", "Weapon Cache", "Well Room",
];

const HOOKS = [
  "Rumors speak of a forgotten treasure buried deep within...",
  "Something ancient stirs in the darkness below...",
  "The locals whisper of strange lights emanating from the ruins...",
  "No one who entered has ever returned...",
  "A foul miasma seeps from the entrance, poisoning the land above...",
];

// ── Generator ───────────────────────────────────────────────────────────────

export class DungeonGenerator {
  private rng!: RNG;
  private rooms: InternalRoom[] = [];
  private doors: InternalDoor[] = [];
  private queue: { seed: number; parent: InternalRoom | null; origin: { x: number; y: number }; axis: DirVec; w: number; h: number; mirror: number }[] = [];
  private minSize = 6;
  private maxSize = 15;
  private symmetry = true;
  private order: boolean[] = [true, true, true, true, false];
  private storyName = "";
  private storyHook = "";

  /**
   * Generate a one-page dungeon.
   */
  generate(seed: number, tags: DungeonTag[] = []): DungeonData {
    this.rng = new RNG(seed);
    this.rng.float(); // advance

    // Parse tags
    this.applyTags(tags);

    // Story
    this.storyName = this.rng.pick(DUNGEON_NAMES);
    this.storyHook = this.rng.pick(HOOKS);

    // Build: greedily expand rooms
    let attempts = 0;
    while (attempts++ < 50) {
      this.rooms = [];
      this.doors = [];

      // Seed room at origin
      const seedSize = this.randomRoomSize();
      const seedRoom: InternalRoom = {
        x: -Math.floor(seedSize.w / 2), y: -Math.floor(seedSize.h / 2),
        w: seedSize.w, h: seedSize.h, seed: 0, round: false,
        desc: null, hidden: false, columns: false,
        axis: DIRS[0]!, ending: false,
      };
      this.rooms.push(seedRoom);

      // Greedy expansion (limit total attempts to control density)
      let grew = true;
      let totalAttempts = 0;
      while (grew && this.countValidRooms() < this.maxSize && totalAttempts < 200) {
        grew = false;
        const shuffled = this.rng.shuffle([...this.rooms]);
        for (const parent of shuffled.slice(0, 10)) { // try only 10 rooms per iteration
          if (this.countValidRooms() >= this.maxSize) break;
          // Try each direction
          const dirs = this.rng.shuffle([...DIRS]);
          for (const dir of dirs) {
            if (this.countValidRooms() >= this.maxSize) break;
            const size = this.randomRoomSize();
            const room = this.tryPlaceRoom(parent, dir, size.w, size.h);
            totalAttempts++;
            if (room) {
              grew = true;
            }
          }
        }
      }

      if (this.countValidRooms() >= this.minSize) break;
    }

    // Place door connections between adjacent rooms
    this.connectRooms();

    // Assign descriptions
    this.assignDescriptions();

    // Build output
    return this.exportData();
  }

  // ── Tags ──────────────────────────────────────────────────────────────────

  private applyTags(tags: string[]) {
    if (tags.includes("small"))  { this.minSize = 3;  this.maxSize = 6; }
    if (tags.includes("medium")) { this.minSize = 6;  this.maxSize = 12; }
    if (tags.includes("large"))  { this.minSize = 12; this.maxSize = 25; }

    if (tags.includes("chaotic")) this.order = [false];
    if (tags.includes("ordered")) this.order = [true, true, true, true, true, true, false];
  }

  // ── Room placement ────────────────────────────────────────────────────────

  /** Try placing a room adjacent to parent in the given direction */
  private tryPlaceRoom(parent: InternalRoom, dir: DirVec, w: number, h: number): InternalRoom | null {
    let x = parent.x;
    let y = parent.y;

    if (dir.y === -1)      { x = parent.x + this.rng.intMax(Math.max(1, parent.w - w + 1)); y = parent.y - h; }
    else if (dir.x === 1)  { x = parent.x + parent.w; y = parent.y + this.rng.intMax(Math.max(1, parent.h - h + 1)); }
    else if (dir.y === 1)  { x = parent.x + this.rng.intMax(Math.max(1, parent.w - w + 1)); y = parent.y + parent.h; }
    else if (dir.x === -1) { x = parent.x - w; y = parent.y + this.rng.intMax(Math.max(1, parent.h - h + 1)); }

    // Check collision (no margin — rooms can touch)
    for (const other of this.rooms) {
      if (x < other.x + other.w && x + w > other.x &&
          y < other.y + other.h && y + h > other.y) return null;
    }

    const room: InternalRoom = {
      x, y, w, h, seed: 0, round: false, desc: null, hidden: false,
      columns: this.rng.chance(0.4), axis: dir, ending: false,
    };
    this.rooms.push(room);

    // Add door at midpoint
    const dx = Math.floor((parent.x + parent.w / 2 + x + w / 2) / 2);
    const dy = Math.floor((parent.y + parent.h / 2 + y + h / 2) / 2);
    this.doors.push({ x: dx, y: dy, dir, type: 0, room1: parent, room2: room });

    return room;
  }

  private collides(room: InternalRoom): boolean {
    // Add 1-tile margin
    const rx = room.x - 1, ry = room.y - 1, rw = room.w + 2, rh = room.h + 2;
    for (const other of this.rooms) {
      if (rx < other.x + other.w && rx + rw > other.x &&
          ry < other.y + other.h && ry + rh > other.y) {
        return true;
      }
    }
    return false;
  }

  private adjacent(a: InternalRoom, b: InternalRoom): boolean {
    // Check if a and b touch (share an edge)
    const ax = a.x - 1, ay = a.y - 1, aw = a.w + 2, ah = a.h + 2;
    return (ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y);
  }

  private countValidRooms(): number {
    return this.rooms.filter(r => r.w > 3 && r.h > 3).length;
  }

  private randomRoomSize(): { w: number; h: number } {
    const s = this.rng.int(2, 6);
    return { w: s, h: this.rng.int(2, 6) };
  }

  // ── Door connections ──────────────────────────────────────────────────────

  private connectRooms() {
    for (let i = 0; i < this.rooms.length; i++) {
      for (let j = i + 1; j < this.rooms.length; j++) {
        const a = this.rooms[i];
        const b = this.rooms[j];

        // Check if rooms touch
        const touches =
          (a.x + a.w === b.x && this.overlapY(a, b)) ||  // a right of b
          (b.x + b.w === a.x && this.overlapY(a, b)) ||  // b right of a
          (a.y + a.h === b.y && this.overlapX(a, b)) ||  // a below b
          (b.y + b.h === a.y && this.overlapX(a, b));     // b below a

        if (!touches) continue;

        // Check door doesn't already exist
        const exists = this.doors.some(d =>
          (d.room1 === a && d.room2 === b) || (d.room1 === b && d.room2 === a)
        );
        if (exists) continue;

        // Place door at midpoint of shared edge
        let dx: number, dy: number, dir: DirVec;
        if (a.x + a.w === b.x) {
          dx = a.x + a.w - 1;
          dy = Math.floor((Math.max(a.y, b.y) + Math.min(a.y + a.h, b.y + b.h)) / 2);
          dir = DIRS[1]; // right
        } else if (b.x + b.w === a.x) {
          dx = b.x + b.w - 1;
          dy = Math.floor((Math.max(a.y, b.y) + Math.min(a.y + a.h, b.y + b.h)) / 2);
          dir = DIRS[3]; // left
        } else if (a.y + a.h === b.y) {
          dx = Math.floor((Math.max(a.x, b.x) + Math.min(a.x + a.w, b.x + b.w)) / 2);
          dy = a.y + a.h - 1;
          dir = DIRS[2]; // down
        } else {
          dx = Math.floor((Math.max(a.x, b.x) + Math.min(a.x + a.w, b.x + b.w)) / 2);
          dy = b.y + b.h - 1;
          dir = DIRS[0]; // up
        }

        this.doors.push({ x: dx, y: dy, dir, type: 0, room1: a, room2: b });
      }
    }
  }

  private overlapX(a: InternalRoom, b: InternalRoom): boolean {
    return a.x < b.x + b.w && a.x + a.w > b.x;
  }

  private overlapY(a: InternalRoom, b: InternalRoom): boolean {
    return a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ── Descriptions ──────────────────────────────────────────────────────────

  private assignDescriptions() {
    const names = this.rng.shuffle([...ROOM_NAMES]);
    for (let i = 0; i < this.rooms.length && i < names.length; i++) {
      this.rooms[i].desc = names[i];
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────

  private exportData(): DungeonData {
    const rects: Rect[] = [];
    const doors: Door[] = [];
    const notes: Note[] = [];
    const columns: Column[] = [];

    for (const room of this.rooms) {
      const rect: Rect = { x: room.x, y: room.y, w: room.w, h: room.h };
      if (room.round) rect.rotunda = true;
      rects.push(rect);

      if (room.columns) {
        // Add columns at corners if room is large enough
        if (room.w > 4 && room.h > 4) {
          columns.push(
            { x: room.x + 1, y: room.y + 1 },
            { x: room.x + room.w - 2, y: room.y + 1 },
            { x: room.x + 1, y: room.y + room.h - 2 },
            { x: room.x + room.w - 2, y: room.y + room.h - 2 },
          );
        } else if (room.w > 6 || room.h > 6) {
          // Center columns
          const cx = Math.floor(room.x + room.w / 2);
          const cy = Math.floor(room.y + room.h / 2);
          columns.push({ x: cx, y: cy });
        }
      }

      if (room.desc) {
        const cx = Math.floor(room.x + room.w / 2);
        const cy = Math.floor(room.y + room.h / 2);
        notes.push({
          text: room.desc,
          ref: String(notes.length + 1),
          pos: { x: cx, y: cy },
        });
      }
    }

    for (const door of this.doors) {
      doors.push({
        x: door.x, y: door.y,
        dir: door.dir,
        type: door.type,
      });
    }

    // Simple water table (all zeros for now)
    const maxX = Math.max(...this.rooms.map(r => r.x + r.w), 0) + 2;
    const maxY = Math.max(...this.rooms.map(r => r.y + r.h), 0) + 2;
    const water: number[][] = Array.from({ length: maxY }, () => Array(maxX).fill(0));

    return {
      version: "1.0",
      title: this.storyName,
      story: this.storyHook,
      rects,
      doors,
      notes,
      columns,
      water,
    };
  }
}
