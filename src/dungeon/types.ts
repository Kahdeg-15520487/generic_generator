// ===========================================================================
// One Page Dungeon — exported JSON types
// Matches com.watabou.dungeon.model.Dungeon.getData() output format
// ===========================================================================

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  rotunda?: boolean;
  ending?: boolean;
}

export interface Door {
  x: number;
  y: number;
  dir: { x: number; y: number };
  type: number; // 0=normal, 8=stairs?
}

export interface Note {
  text: string;
  ref: string;
  pos: { x: number; y: number };
}

export interface Column {
  x: number;
  y: number;
}

export interface DungeonData {
  version: string;
  title: string;
  story: string;
  rects: Rect[];
  doors: Door[];
  notes: Note[];
  columns: Column[];
  water: number[][];
}

export type DungeonTag =
  | "small" | "medium" | "large"
  | "chaotic" | "ordered"
  | "cramped" | "spacious" | "winding" | "compact"
  | "multi-level"
  | "round"
  | "string"
  | string;
