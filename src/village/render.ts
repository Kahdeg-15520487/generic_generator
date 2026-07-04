// ===========================================================================
// ASCII renderer for village maps
// ===========================================================================

import type { VillageData } from "./generator.js";

export function renderVillage(data: VillageData): string {
  const [bx, by, bw, bh] = data.bounds as number[];
  const w = Math.floor(bw) + 2;
  const h = Math.floor(bh) + 2;
  const g: string[][] = Array.from({ length: h }, () => Array(w).fill(" "));

  // Buildings
  for (const b of data.buildings) {
    const ring = b.coordinates[0] as number[][];
    const [x1, y1] = ring[0] as number[];
    const [x3, y3] = ring[2] as number[];
    for (let dy = Math.floor(y1); dy < Math.floor(y3); dy++)
      for (let dx = Math.floor(x1); dx < Math.floor(x3); dx++)
        if (dx >= 0 && dy >= 0 && dx < w && dy < h) g[dy]![dx] = "#";
  }

  // Roads
  for (const r of data.roads) {
    const pts = r.coordinates as number[][];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i]!;
      const [x2, y2] = pts[i + 1]!;
      const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 2;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = Math.round(x1 + (x2 - x1) * t);
        const py = Math.round(y1 + (y2 - y1) * t);
        if (px >= 0 && py >= 0 && px < w && py < h && g[py]![px] === " ") g[py]![px] = ".";
      }
    }
  }

  // Palisade
  if (data.palisade) {
    const pts = data.palisade.coordinates as number[][];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i]!;
      const [x2, y2] = pts[i + 1]!;
      const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 2;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = Math.round(x1 + (x2 - x1) * t);
        const py = Math.round(y1 + (y2 - y1) * t);
        if (px >= 0 && py >= 0 && px < w && py < h) g[py]![px] = "o";
      }
    }
  }

  // Gates
  if (data.gates) {
    for (const gate of data.gates) {
      const [x, y] = gate.coordinates as number[];
      if (x >= 0 && y >= 0 && x < w && y < h) g[Math.floor(y)]![Math.floor(x)] = "G";
    }
  }

  // Water
  if (data.water) {
    for (const wb of data.water) {
      for (const ring of (wb.coordinates as any) as number[][][]) {
        for (const [x, y] of ring as number[][]) {
          if (x >= 0 && y >= 0 && x < w && y < h) g[Math.floor(y)]![Math.floor(x)] = "~";
        }
      }
    }
  }

  // Trees
  for (const t of data.trees) {
    const [x, y] = t.coordinates as number[];
    if (x >= 0 && y >= 0 && x < w && y < h && g[Math.floor(y)]![Math.floor(x)] === " ") {
      g[Math.floor(y)]![Math.floor(x)] = "t";
    }
  }

  return g.map(r => r.join("").replace(/ +$/, "")).join("\n");
}
