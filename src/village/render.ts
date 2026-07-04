// ===========================================================================
// ASCII renderer for village maps — updated for new data format
// ===========================================================================

import type { VillageData } from "./generator.js";

export function renderVillage(data: VillageData): string {
  const w = data.width + 2;
  const h = data.height + 2;
  const g: string[][] = Array.from({ length: h }, () => Array(w).fill(" "));

  // Buildings
  for (const b of data.buildings) {
    for (let dy = 0; dy < b.h; dy++)
      for (let dx = 0; dx < b.w; dx++)
        if (b.x + dx >= 0 && b.y + dy >= 0 && b.x + dx < w && b.y + dy < h)
          g[b.y + dy]![b.x + dx] = "#";
  }

  // Roads
  for (const r of data.roads) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const p1 = r.points[i]!, p2 = r.points[i + 1]!;
      const steps = Math.max(Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y)) * 2;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = Math.round(p1.x + (p2.x - p1.x) * t);
        const py = Math.round(p1.y + (p2.y - p1.y) * t);
        if (px >= 0 && py >= 0 && px < w && py < h && g[py]![px] === " ") g[py]![px] = ".";
      }
    }
  }

  // Palisade
  if (data.palisade) {
    for (const seg of data.palisade) {
      const steps = Math.max(Math.abs(seg.x2 - seg.x1), Math.abs(seg.y2 - seg.y1)) * 2;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = Math.round(seg.x1 + (seg.x2 - seg.x1) * t);
        const py = Math.round(seg.y1 + (seg.y2 - seg.y1) * t);
        if (px >= 0 && py >= 0 && px < w && py < h) g[py]![px] = "o";
      }
    }
  }

  // Gates
  if (data.gates) {
    for (const gate of data.gates) {
      if (gate.x >= 0 && gate.y >= 0 && gate.x < w && gate.y < h)
        g[gate.y]![gate.x] = "G";
    }
  }

  // Water
  if (data.water) {
    for (let i = 0; i < data.water.points.length - 1; i++) {
      const p1 = data.water.points[i]!, p2 = data.water.points[i + 1]!;
      const px = Math.floor((p1.x + p2.x) / 2);
      const py = Math.floor((p1.y + p2.y) / 2);
      if (px >= 0 && py >= 0 && px < w && py < h) g[py]![px] = "~";
    }
  }

  // Forest
  for (const t of data.forest) {
    if (t.x >= 0 && t.y >= 0 && t.x < w && t.y < h && g[t.y]![t.x] === " ")
      g[t.y]![t.x] = "t";
  }

  // Farmland
  for (const f of data.farmland) {
    for (let dy = 0; dy < f.h; dy++)
      for (let dx = 0; dx < f.w; dx++)
        if (f.x + dx >= 0 && f.y + dy >= 0 && f.x + dx < w && f.y + dy < h && g[f.y + dy]![f.x + dx] === " ")
          g[f.y + dy]![f.x + dx] = "=";
  }

  return g.map(r => r.join("").replace(/ +$/, "")).join("\n");
}
