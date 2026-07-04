// ===========================================================================
// Perilous Shores / Realm generator
// Port of com.watabou.perilous.model.Region + terrain/features
// ===========================================================================

import { RNG } from "../lib/rng.js";
import type { World, Location, Point, RoadNetwork, RoadSegment, RoadType, RealmData, SettlementPlacement, POIPlacement, TerrainCell, TerrainType } from "../core/types.js";

// ── Noise (simplified value noise) ──────────────────────────────────────────

class NoiseField {
  private rng: RNG;
  private grid: number[][];
  private size: number;

  constructor(rng: RNG, size: number) {
    this.rng = rng;
    this.size = size;
    this.grid = Array.from({ length: size }, () => Array(size).fill(0));
  }

  /** Simple value noise at multiple octaves */
  sample(x: number, y: number, octaves = 4): number {
    let val = 0, amp = 1, freq = 1, max = 0;
    for (let o = 0; o < octaves; o++) {
      const sx = (x * freq) / this.size;
      const sy = (y * freq) / this.size;
      const ix = Math.floor(sx);
      const iy = Math.floor(sy);
      const fx = sx - ix;
      const fy = sy - iy;
      const h = this.hash(ix, iy, o);
      val += h * amp * this.smooth(fx) * this.smooth(fy);
      max += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return val / max;
  }

  private hash(ix: number, iy: number, octave: number): number {
    const key = `${ix},${iy},${octave}`;
    let h = 0;
    for (let i = 0; i < key.length; i++) {
      h = ((h << 5) - h + key.charCodeAt(i)) | 0;
    }
    return ((h % 10000) / 10000 + 1) / 2;
  }

  private smooth(t: number): number {
    return t * t * (3 - 2 * t);
  }
}

// ── Road network builder ────────────────────────────────────────────────────

function buildRoadNetwork(rng: RNG, settlements: SettlementPlacement[], width: number, height: number): RoadNetwork {
  const segments: RoadSegment[] = [];
  const connected = new Set<number>();

  if (settlements.length < 2) return { segments };

  // Start from largest settlement
  const start = settlements.reduce((a, b) => a.size > b.size ? a : b);
  connected.add(settlements.indexOf(start));

  // Prim-like: connect nearest unconnected settlement
  while (connected.size < settlements.length) {
    let bestDist = Infinity;
    let bestFrom = 0, bestTo = 0;

    for (const fi of connected) {
      for (let ti = 0; ti < settlements.length; ti++) {
        if (connected.has(ti)) continue;
        const dx = settlements[fi]!.pos.x - settlements[ti]!.pos.x;
        const dy = settlements[fi]!.pos.y - settlements[ti]!.pos.y;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) { bestDist = dist; bestFrom = fi; bestTo = ti; }
      }
    }

    const from = settlements[bestFrom]!;
    const to = settlements[bestTo]!;
    const roadType: RoadType = from.size >= 4 ? "highway" : from.size >= 2 ? "road" : "lane";

    // Add slight curve: waypoint at midpoint with random offset
    const midX = (from.pos.x + to.pos.x) / 2 + rng.int(-15, 15);
    const midY = (from.pos.y + to.pos.y) / 2 + rng.int(-15, 15);

    segments.push({ id: `r${bestFrom}-${bestTo}a`, from: from.pos, to: { x: midX, y: midY }, type: roadType, width: from.size >= 4 ? 3 : 2 });
    segments.push({ id: `r${bestFrom}-${bestTo}b`, from: { x: midX, y: midY }, to: to.pos, type: roadType, width: from.size >= 4 ? 3 : 2 });

    connected.add(bestTo);
  }

  return { segments };
}

// ── Realm Generator ─────────────────────────────────────────────────────────

const REALM_SIZE = 128;

const SETTLEMENT_NAMES = [
  "Aldford", "Barrowtown", "Cinderwell", "Dunhollow", "Eastwatch",
  "Fairhaven", "Goldshire", "Highcrest", "Ironvale", "Kingsport",
  "Lakesend", "Mournhold", "Northgate", "Oakvale", "Portsmouth",
  "Queensbury", "Rivertown", "Stonewall", "Thornfield", "Undermill",
];

export class RealmGenerator {
  private rng!: RNG;

  generate(seed: number): World {
    this.rng = new RNG(seed);

    const realmId = `realm-${seed}`;

    // ── Terrain ──────────────────────────────────────────────────────────
    // Use a mix of noise layers for varied terrain
    const terrain: TerrainCell[] = [];
    const elevNoise = new NoiseField(this.rng, REALM_SIZE);
    const moistNoise = new NoiseField(new RNG(seed * 2 + 1), REALM_SIZE);

    for (let y = 0; y < REALM_SIZE; y++) {
      for (let x = 0; x < REALM_SIZE; x++) {
        const elev = elevNoise.sample(x, y, 5);
        const moist = moistNoise.sample(x, y, 3);
        const distFromCenter = Math.sqrt((x - REALM_SIZE/2)**2 + (y - REALM_SIZE/2)**2) / (REALM_SIZE/2);

        let type: TerrainType;
        // Island/continent: center is land, edges are water
        if (distFromCenter > 0.7 + elev * 0.15) type = "ocean";
        else if (distFromCenter > 0.6 + elev * 0.15) type = "sea";
        else if (elev > 0.75) type = "mountain";
        else if (elev > 0.6) type = "hill";
        else if (moist > 0.6) type = "forest";
        else if (moist > 0.75 && elev < 0.35) type = "swamp";
        else type = "plain";

        terrain.push({ pos: { x, y }, type, elevation: elev });
      }
    }

    // ── Rivers ───────────────────────────────────────────────────────────
    // Simple: pick mountain/hill cells, flow downhill to sea
    // (simplified — just mark a few river paths)

    // ── Settlements ──────────────────────────────────────────────────────
    const settlements: SettlementPlacement[] = [];
    const landCells = terrain.filter(t => t.type === "plain" || t.type === "grassland" || t.type === "hill");

    const numTowns = this.rng.int(8, 20);
    const picked = this.rng.subset(landCells, numTowns);

    for (let i = 0; i < picked.length; i++) {
      const cell = picked[i]!;
      const size = this.rng.int(1, 5);
      const type: "city" | "village" = size >= 4 ? "city" : "village";
      const name = this.rng.pick(SETTLEMENT_NAMES) + (i > 0 ? ` ${i}` : "");

      settlements.push({
        locationId: `settlement-${seed}-${i}`,
        pos: cell.pos,
        type,
        name,
        size,
        roadConnections: [],
      });
    }

    // ── Roads ────────────────────────────────────────────────────────────
    const roadNetwork = buildRoadNetwork(this.rng, settlements, REALM_SIZE, REALM_SIZE);

    // Update settlement road connections
    for (const seg of roadNetwork.segments) {
      for (const s of settlements) {
        if (s.pos.x === seg.from.x && s.pos.y === seg.from.y) {
          s.roadConnections.push({
            dir: { x: seg.to.x - seg.from.x, y: seg.to.y - seg.from.y },
            type: seg.type,
          });
        }
      }
    }

    // ── Points of Interest ───────────────────────────────────────────────
    const pois: POIPlacement[] = [];
    const remoteCells = landCells.filter(c => {
      // Not too close to settlements
      return settlements.every(s => Math.abs(s.pos.x - c.pos.x) + Math.abs(s.pos.y - c.pos.y) > 8);
    });

    const numPOIs = this.rng.int(5, 15);
    const poiCells = this.rng.subset(remoteCells, numPOIs);
    const poiTypes: POIPlacement["type"][] = ["dungeon", "cave", "landmark", "ruin", "tower", "camp"];

    for (let i = 0; i < poiCells.length; i++) {
      pois.push({
        locationId: `poi-${seed}-${i}`,
        pos: poiCells[i]!.pos,
        type: this.rng.pick(poiTypes),
        name: `${this.rng.pick(["Old", "Dark", "Forgotten", "Cursed", "Hidden", "Ancient"])} ${this.rng.pick(["Keep", "Tower", "Cave", "Ruins", "Mines", "Shrine"])}`,
      });
    }

    // ── Build location hierarchy ─────────────────────────────────────────
    const locations: Record<string, Location> = {};

    // Realm
    locations[realmId] = {
      id: realmId, type: "realm", name: `Realm #${seed}`,
      bounds: { x: 0, y: 0, w: REALM_SIZE, h: REALM_SIZE },
      seed, tags: [],
      roadConnections: [],
      parentId: null,
      children: [],
      data: { terrain, settlements, pointsOfInterest: pois } satisfies RealmData,
    };

    // Settlements
    for (const s of settlements) {
      const conns = s.roadConnections.map(rc => ({
        localPos: s.pos,
        direction: rc.dir,
        targetId: realmId,
        targetPos: s.pos,
        roadType: rc.type,
      }));

      locations[s.locationId] = {
        id: s.locationId, type: s.type, name: s.name,
        bounds: { x: 0, y: 0, w: 64, h: 64 },
        seed: this.rng.int(0, 2147483647),
        tags: s.type === "city" ? ["large"] : ["small"],
        roadConnections: conns,
        parentId: realmId,
        children: [],
      };
      locations[realmId]!.children.push(s.locationId);
    }

    // POIs
    for (const poi of pois) {
      locations[poi.locationId] = {
        id: poi.locationId, type: poi.type, name: poi.name,
        bounds: { x: 0, y: 0, w: 32, h: 32 },
        seed: this.rng.int(0, 2147483647),
        tags: [],
        roadConnections: [],
        parentId: realmId,
        children: [],
      };
      locations[realmId]!.children.push(poi.locationId);
    }

    return {
      locations,
      realmId,
      roadNetwork,
      generatedAt: Date.now(),
      seed,
    };
  }
}
