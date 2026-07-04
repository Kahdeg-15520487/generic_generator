// ===========================================================================
// WorldBuilder — orchestrates multi-level generation with seed cascading
//
// Flow:  seed → Realm → settlements → City/Village → buildings → Dwellings
//                     → POIs       → Dungeons/Caves
//
// Each child level gets a deterministic seed derived from its parent,
// so the same world seed always produces the same hierarchy.
// ===========================================================================

import { RNG } from "../lib/rng.js";
import { RealmGenerator } from "../realm/generator.js";
import { CityGenerator, type CityData } from "../city/generator.js";
import { VillageGenerator, type VillageData } from "../village/generator.js";
import { DwellingsGenerator } from "../dwellings/generator.js";
import { DungeonGenerator } from "../dungeon/generator.js";
import type { World, Location, Point, RoadConnection, RealmData, SettlementPlacement, POIPlacement } from "../core/types.js";

// ── Seed derivation ─────────────────────────────────────────────────────────
function childSeed(parentSeed: number, index: number): number {
  return Math.abs(((parentSeed * 48271 + index * 7919) % 2147483647));
}

// ── Result types ────────────────────────────────────────────────────────────

export interface GeneratedWorld extends World {
  /** Pre-generated data cached by location ID */
  cache: Record<string, unknown>;
}

export interface BuildOptions {
  /** Realm seed (all other seeds derived from this) */
  seed: number;
  /** Max depth to generate (1=realm only, 2=+settlements, 3=+interiors) */
  depth?: number;
}

// ── Builder ─────────────────────────────────────────────────────────────────

export class WorldBuilder {
  private world!: GeneratedWorld;
  private realmData!: RealmData;

  build(opts: BuildOptions): GeneratedWorld {
    const seed = opts.seed;
    const depth = opts.depth ?? 3;

    this.world = {
      locations: {},
      realmId: `realm-${seed}`,
      roadNetwork: { segments: [] },
      generatedAt: Date.now(),
      seed,
      cache: {},
    };

    // ── Level 1: Realm ──────────────────────────────────────────────────
    const realmGen = new RealmGenerator();
    const rawWorld = realmGen.generate(seed);
    const realmLoc = rawWorld.locations[rawWorld.realmId]!;
    this.realmData = realmLoc.data as RealmData;

    this.world.locations[rawWorld.realmId] = realmLoc;
    this.world.roadNetwork = rawWorld.roadNetwork;

    if (depth < 2) return this.world;

    // ── Level 2: Settlements & POIs ─────────────────────────────────────
    for (let i = 0; i < this.realmData.settlements.length; i++) {
      const s = this.realmData.settlements[i]!;
      const locSeed = childSeed(seed, i);
      const locId = `settlement-${seed}-${i}`;

      if (s.type === "city") {
        this.generateCity(locId, locSeed, s, i);
      } else {
        this.generateVillage(locId, locSeed, s, i);
      }
    }

    for (let i = 0; i < this.realmData.pointsOfInterest.length; i++) {
      const poi = this.realmData.pointsOfInterest[i]!;
      const locSeed = childSeed(seed, i + 1000); // offset to avoid collision
      const locId = `poi-${seed}-${i}`;

      this.generatePOI(locId, locSeed, poi, i);
    }

    if (depth < 3) return this.world;

    // ── Level 3: Building interiors ─────────────────────────────────────
    // For cities with buildings, generate dwellings inside some of them
    for (const locId of this.world.locations[this.world.realmId]!.children) {
      const loc = this.world.locations[locId];
      if (!loc || loc.type !== "city") continue;

      const cityData = this.world.cache[locId] as CityData | undefined;
      if (!cityData) continue;

      // Pick a few buildings to host dwellings
      const rng = new RNG(loc.seed);
      const candidates = cityData.buildings.filter((b: any) => {
        const ring = b.coordinates[0];
        const w = ring[2][0] - ring[0][0];
        const h = ring[2][1] - ring[0][1];
        return w >= 3 && h >= 3;
      });

      const numInteriors = Math.min(3, candidates.length);
      for (let j = 0; j < numInteriors; j++) {
        const bld = candidates[rng.intMax(candidates.length)];
        if (!bld) continue;
        const interiorSeed = childSeed(loc.seed, j + 100);
        const interiorId = `dwelling-${interiorSeed}`;
        const ring = bld.coordinates[0];
        const bx = ring[0][0];
        const by = ring[0][1];

        const dwellingGen = new DwellingsGenerator();
        const house = dwellingGen.generate(interiorSeed, ["small"]);

        this.world.locations[interiorId] = {
          id: interiorId, type: "dwelling", name: `House near ${loc.name}`,
          bounds: { x: 0, y: 0, w: 16, h: 16 },
          seed: interiorSeed, tags: ["small"],
          roadConnections: [{
            localPos: { x: house.exit.cell.i, y: house.exit.cell.j },
            direction: { x: 0, y: 1 },
            targetId: locId,
            targetPos: { x: bx + ring[2][0] / 2, y: by + ring[2][1] / 2 },
            roadType: "path",
          }],
          parentId: locId,
          children: [],
          data: house,
        };
        this.world.cache[interiorId] = house;
        loc.children.push(interiorId);
      }
    }

    return this.world;
  }

  // ── City generation ───────────────────────────────────────────────────────

  private generateCity(locId: string, seed: number, s: SettlementPlacement, index: number) {
    const gen = new CityGenerator();
    const data = gen.generate(seed);

    this.world.cache[locId] = data;

    // Road connections: realm roads that touch this settlement
    const roadConns: RoadConnection[] = [];
    for (const seg of this.world.roadNetwork.segments) {
      const dx1 = seg.from.x - s.pos.x, dy1 = seg.from.y - s.pos.y;
      const dx2 = seg.to.x - s.pos.x, dy2 = seg.to.y - s.pos.y;
      const near = (Math.abs(dx1) + Math.abs(dy1) < 5) || (Math.abs(dx2) + Math.abs(dy2) < 5);
      if (near) {
        const endpoint = Math.abs(dx1) + Math.abs(dy1) < Math.abs(dx2) + Math.abs(dy2) ? seg.from : seg.to;
        roadConns.push({
          localPos: { x: 32, y: 32 + index * 10 },
          direction: { x: endpoint.x - s.pos.x, y: endpoint.y - s.pos.y },
          targetId: this.world.realmId,
          targetPos: { x: s.pos.x, y: s.pos.y },
          roadType: seg.type,
        });
      }
    }

    this.world.locations[locId] = {
      id: locId, type: "city", name: s.name,
      bounds: { x: 0, y: 0, w: Math.max(...data.buildings.map((b: any) => b.coordinates[0]?.[2]?.[0] ?? 0)) + 4, h: Math.max(...data.buildings.map((b: any) => b.coordinates[0]?.[2]?.[1] ?? 0)) + 4 },
      seed, tags: ["large"],
      roadConnections: roadConns,
      parentId: this.world.realmId,
      children: [],
      data,
    };
    this.world.locations[this.world.realmId]!.children.push(locId);
  }

  // ── Village generation ────────────────────────────────────────────────────

  private generateVillage(locId: string, seed: number, s: SettlementPlacement, index: number) {
    const gen = new VillageGenerator();
    const data = gen.generate(seed);
    this.world.cache[locId] = data;

    const [bx, by, bw, bh] = data.bounds as number[];

    this.world.locations[locId] = {
      id: locId, type: "village", name: s.name,
      bounds: { x: 0, y: 0, w: bw, h: bh },
      seed, tags: ["small"],
      roadConnections: [{
        localPos: { x: bw / 2, y: 0 },
        direction: { x: 0, y: -1 },
        targetId: this.world.realmId,
        targetPos: { x: s.pos.x, y: s.pos.y },
        roadType: "road",
      }],
      parentId: this.world.realmId,
      children: [],
      data,
    };
    this.world.locations[this.world.realmId]!.children.push(locId);
  }

  // ── POI generation ────────────────────────────────────────────────────────

  private generatePOI(locId: string, seed: number, poi: POIPlacement, index: number) {
    let data: unknown;

    if (poi.type === "dungeon" || poi.type === "cave") {
      const gen = new DungeonGenerator();
      data = gen.generate(seed, ["small"]);
    }

    this.world.cache[locId] = data;

    this.world.locations[locId] = {
      id: locId, type: poi.type,
      name: poi.name,
      bounds: { x: 0, y: 0, w: 32, h: 32 },
      seed, tags: [],
      roadConnections: [],
      parentId: this.world.realmId,
      children: [],
      data,
    };
    this.world.locations[this.world.realmId]!.children.push(locId);
  }
}
