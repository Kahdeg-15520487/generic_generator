// ===========================================================================
// Dwellings — exported JSON types
// Matches com.watabou.dwellings.model.JsonExporter output format
// ===========================================================================

/** Grid cell in output (i=column, j=row) */
export interface Cell { i: number; j: number; }

export type DirStr = "n" | "s" | "e" | "w";

export interface Edge { cell: Cell; dir: DirStr; }

export interface Room {
  name?: string;
  cells: Cell[];
}

export interface Door {
  edge: Edge;
  type?: "doorway" | "regular";
}

export interface Window {
  cell: Cell;
  dir: DirStr;
}

export interface Stair {
  cell: Cell;
  dir: DirStr;
  /** true = goes up, false = goes down */
  up: boolean;
}

export interface Floor {
  /** -1=basement, 0=ground, 1+=upper */
  level: number;
  rooms: Room[];
  doors: Door[];
  windows: Window[];
  stairs: Stair[];
}

export interface House {
  floors: Floor[];
  exit: Edge;
  spiral?: Edge;
}

// ===========================================================================
// Generator options
// ===========================================================================

export type Tag =
  | "small" | "medium" | "large"
  | "low" | "tall"
  | "square" | "slab"
  | "mechanical" | "organic" | "hallways" | "generic"
  | "spiral" | "stairwell"
  | "blank" | "transparent"
  | "basement"
  | string;

export interface Options {
  /** Random seed (omit for random) */
  seed?: number;
  /** Generation tags */
  tags?: Tag[];
  /** Number of above-ground floors (1–4) */
  floors?: number;
  /** Hex-encoded blueprint plan */
  plan?: string;
}
