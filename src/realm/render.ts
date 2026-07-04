// ===========================================================================
// ASCII renderer for realm maps
// ===========================================================================

import type { RealmData, SettlementPlacement, POIPlacement, TerrainType } from "../core/types.js";

const TERRAIN_CHARS: Record<TerrainType, string> = {
  ocean: "~", sea: "~", lake: "~", river: "~",
  plain: ".", grassland: ",", forest: "T", swamp: "v", desert: "_",
  hill: "n", mountain: "A",
  farmland: "=", urban: "#",
};

const SETTLEMENT_CHARS: Record<string, string> = {
  city: "◎", village: "○",
};

const POI_CHARS: Record<string, string> = {
  dungeon: "◈", cave: "○", landmark: "▲", ruin: "▣", tower: "♜", camp: "⚑",
};

const ASCII_CHARS: Record<string, string> = {
  ocean: "~", sea: "~", lake: "~", river: "~",
  plain: ".", grassland: ".", forest: "T", swamp: "s", desert: "_",
  hill: "h", mountain: "M",
  farmland: "=", urban: "#",
};

export function renderRealm(realm: RealmData): string {
  // Find bounds
  let maxX = 0, maxY = 0;
  for (const c of realm.terrain) {
    if (c.pos.x > maxX) maxX = c.pos.x;
    if (c.pos.y > maxY) maxY = c.pos.y;
  }

  const step = Math.max(1, Math.floor(maxX / 60)); // scale to fit terminal
  const w = Math.floor(maxX / step) + 1;
  const h = Math.floor(maxY / step) + 1;

  // Downsample terrain by averaging
  const grid: string[][] = Array.from({ length: h }, () => Array(w).fill(" "));

  // Place terrain
  for (const c of realm.terrain) {
    const gx = Math.floor(c.pos.x / step);
    const gy = Math.floor(c.pos.y / step);
    if (gx < w && gy < h) {
      grid[gy]![gx] = ASCII_CHARS[c.type] ?? "?";
    }
  }

  // Place settlements
  for (const s of realm.settlements) {
    const gx = Math.floor(s.pos.x / step);
    const gy = Math.floor(s.pos.y / step);
    if (gx < w && gy < h) {
      grid[gy]![gx] = SETTLEMENT_CHARS[s.type] ?? "O";
    }
  }

  // Place POIs
  for (const p of realm.pointsOfInterest) {
    const gx = Math.floor(p.pos.x / step);
    const gy = Math.floor(p.pos.y / step);
    if (gx < w && gy < h) {
      grid[gy]![gx] = POI_CHARS[p.type] ?? "X";
    }
  }

  let out = grid.map(r => r.join("")).join("\n");
  out += "\n\nLegend: ◎ City  ○ Village  ◈ Dungeon  ▲ Landmark  T Forest  M Mountain  . Plain  ~ Water";

  for (const s of realm.settlements) {
    out += `\n  ${SETTLEMENT_CHARS[s.type]} ${s.name} (${s.pos.x},${s.pos.y}) size=${s.size}`;
  }
  for (const p of realm.pointsOfInterest) {
    out += `\n  ${POI_CHARS[p.type]} ${p.name} (${p.pos.x},${p.pos.y})`;
  }

  return out;
}
