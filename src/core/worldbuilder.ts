// ===========================================================================
// WorldBuilder — orchestrates multi-level generation with seed cascading
// Updated for faithful Realm/City/Village generators
// ===========================================================================

import { RNG } from "../lib/rng.js";
import { RealmGenerator, type RealmData, type Settlement, type POI } from "../realm/generator.js";
import { CityGenerator, type CityData } from "../city/model.js";
import { VillageGenerator, type VillageData } from "../village/generator.js";
import { DungeonGenerator } from "../dungeon/generator.js";
import { CaveGenerator } from "../cave/generator.js";
import { DwellingsGenerator } from "../dwellings/generator.js";

// ── Seed derivation ─────────────────────────────────────────────────────────
function childSeed(parentSeed: number, index: number): number {
  return Math.abs(((parentSeed * 48271 + index * 7919) % 2147483647));
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface GeneratedLocation {
  id: string;
  type: string;
  name: string;
  seed: number;
  parentId: string | null;
  children: string[];
  data: unknown;
}

export interface GeneratedWorld {
  realmId: string;
  seed: number;
  realmData: RealmData;
  locations: Record<string, GeneratedLocation>;
  cache: Record<string, unknown>;
  generatedAt: number;
}

export interface BuildOptions {
  seed: number;
  depth?: number;
  template?: string;
}

// ── Builder ─────────────────────────────────────────────────────────────────

export class WorldBuilder {
  build(opts: BuildOptions): GeneratedWorld {
    const seed = opts.seed;
    const depth = opts.depth ?? 3;

    const world: GeneratedWorld = {
      realmId: `realm-${seed}`,
      seed,
      realmData: null as any,
      locations: {},
      cache: {},
      generatedAt: Date.now(),
    };

    // ── Level 1: Realm ──────────────────────────────────────────────────
    const realmGen = new RealmGenerator();
    const realmData = realmGen.generate(seed, (opts.template as any) || "island");
    world.realmData = realmData;

    world.locations[world.realmId] = {
      id: world.realmId,
      type: "realm",
      name: `Realm #${seed}`,
      seed,
      parentId: null,
      children: [],
      data: realmData,
    };

    if (depth < 2) return world;

    // ── Level 2: Settlements ────────────────────────────────────────────
    for (let i = 0; i < realmData.settlements.length; i++) {
      const s = realmData.settlements[i]!;
      const locSeed = childSeed(seed, i);
      const locId = s.id;

      if (s.type === "city") {
        const cityGen = new CityGenerator();
        const cityData = cityGen.generate({ seed: locSeed });
        world.cache[locId] = cityData;
        world.locations[locId] = {
          id: locId, type: "city", name: s.name, seed: locSeed,
          parentId: world.realmId, children: [], data: cityData,
        };
      } else {
        const villageGen = new VillageGenerator();
        const villageData = villageGen.generate(locSeed);
        world.cache[locId] = villageData;
        world.locations[locId] = {
          id: locId, type: "village", name: s.name, seed: locSeed,
          parentId: world.realmId, children: [], data: villageData,
        };
      }
      world.locations[world.realmId]!.children.push(locId);
    }

    // ── Level 2: POIs ───────────────────────────────────────────────────
    for (let i = 0; i < realmData.pois.length; i++) {
      const poi = realmData.pois[i]!;
      const locSeed = childSeed(seed, i + 1000);
      const locId = poi.id;

      let poiData: unknown;
      if (poi.type === "dungeon") {
        poiData = new DungeonGenerator().generate(locSeed, ["small"]);
      } else if (poi.type === "cave") {
        poiData = new CaveGenerator().generate(locSeed);
      }

      world.cache[locId] = poiData;
      world.locations[locId] = {
        id: locId, type: poi.type, name: poi.name, seed: locSeed,
        parentId: world.realmId, children: [], data: poiData,
      };
      world.locations[world.realmId]!.children.push(locId);
    }

    if (depth < 3) return world;

    // ── Level 3: Building interiors ─────────────────────────────────────
    for (const childId of [...world.locations[world.realmId]!.children]) {
      const loc = world.locations[childId];
      if (!loc || loc.type !== "city") continue;
      const cityData = world.cache[childId] as CityData;
      if (!cityData?.districts) continue;

      // Count lots across all districts to determine number of interiors
      let totalLots = 0;
      for (const district of cityData.districts) {
        for (const group of district.groups) {
          for (const block of group.blocks) {
            totalLots += block.lots.length;
          }
        }
      }
      if (totalLots === 0) continue;

      const rng = new RNG(loc.seed);
      const numInteriors = Math.min(3, totalLots);
      for (let j = 0; j < numInteriors; j++) {
        const interiorSeed = childSeed(loc.seed, j + 100);
        const interiorId = `dwelling-${interiorSeed}`;
        const house = new DwellingsGenerator().generate(interiorSeed, ["small"]);

        world.cache[interiorId] = house;
        world.locations[interiorId] = {
          id: interiorId, type: "dwelling",
          name: `House in ${loc.name}`,
          seed: interiorSeed, parentId: childId, children: [], data: house,
        };
        loc.children.push(interiorId);
      }
    }

    return world;
  }
}
