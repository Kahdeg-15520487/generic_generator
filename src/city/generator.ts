// ===========================================================================
// City generator — public API
// ===========================================================================

import { CityGenerator, type CityData } from "./model.js";
import type { RNG } from "../lib/rng.js";

export { type CityData } from "./model.js";

// Re-export for convenience
export type { Ward, District, CurtainWall, CellData, Block, Lot } from "./model.js";

// ── Generator wrapper ──────────────────────────────────────────────────────

export function generateCity(seed: number, _rng?: RNG): CityData {
  const gen = new CityGenerator();
  return gen.generate({
    seed,
    walls: true,
    citadel: true,
    plaza: true,
    temple: true,
    shanty: true,
    coast: true,
    river: true,
  });
}
