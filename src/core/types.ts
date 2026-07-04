// ===========================================================================
// Shared core types — hierarchical world model
// Connects: Realm → City/Village → Dwelling/Dungeon
// ===========================================================================

// ── Coordinates ─────────────────────────────────────────────────────────────

/** World-space position (arbitrary units, shared across all levels) */
export interface Point {
  x: number;
  y: number;
}

/** Axis-aligned bounding box */
export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ── Roads ───────────────────────────────────────────────────────────────────

export type RoadType = "highway" | "road" | "street" | "lane" | "path";

export interface RoadSegment {
  id: string;
  from: Point;
  to: Point;
  type: RoadType;
  /** Width in world units */
  width: number;
}

export interface RoadNetwork {
  segments: RoadSegment[];
}

// ── Terrain ─────────────────────────────────────────────────────────────────

export type TerrainType =
  | "ocean" | "sea" | "lake" | "river"
  | "plain" | "grassland" | "forest" | "swamp" | "desert"
  | "hill" | "mountain"
  | "farmland" | "urban";

export interface TerrainCell {
  pos: Point;
  type: TerrainType;
  elevation: number;
}

// ── Locations (hierarchical) ────────────────────────────────────────────────

export type LocationType = "realm" | "city" | "village" | "dwelling" | "dungeon" | "cave" | "landmark" | "ruin" | "tower" | "camp";

export interface Location {
  id: string;
  type: LocationType;
  name: string;
  bounds: Bounds;
  /** Seed for deterministic generation */
  seed: number;
  /** Tags for generation style */
  tags: string[];
  /** Road connection points (where roads enter/exit this location) */
  roadConnections: RoadConnection[];
  /** Parent location ID (null for realm) */
  parentId: string | null;
  /** Child location IDs generated within this location */
  children: string[];
  /** Custom data specific to the location type */
  data?: unknown;
}

/** A road endpoint that connects to the parent (or child) level */
export interface RoadConnection {
  /** Position within this location */
  localPos: Point;
  /** Direction the road leaves (for rendering continuity) */
  direction: Point;
  /** Connected location ID (parent or child) */
  targetId: string;
  /** Position in the target location's coordinate space */
  targetPos: Point;
  /** Road type at the connection point */
  roadType: RoadType;
}

// ── World (top-level container) ─────────────────────────────────────────────

export interface World {
  /** All locations indexed by ID */
  locations: Record<string, Location>;
  /** The root realm location ID */
  realmId: string;
  /** Global road network (for the realm level) */
  roadNetwork: RoadNetwork;
  /** Generation timestamp */
  generatedAt: number;
  /** World seed */
  seed: number;
}

// ── Realm-specific ──────────────────────────────────────────────────────────

export interface RealmData {
  terrain: TerrainCell[];
  /** Town/city placements with road connections */
  settlements: SettlementPlacement[];
  /** Landmarks, dangers, features */
  pointsOfInterest: POIPlacement[];
}

export interface SettlementPlacement {
  locationId: string;
  pos: Point;
  type: "city" | "village";
  name: string;
  size: number;  // 1-5 scale
  roadConnections: { dir: Point; type: RoadType }[];
}

export interface POIPlacement {
  locationId: string;
  pos: Point;
  type: "dungeon" | "cave" | "landmark" | "ruin" | "tower" | "camp";
  name: string;
}

// ── City-specific ───────────────────────────────────────────────────────────

export interface CityData {
  walls?: { points: Point[] }[];
  districts: DistrictData[];
}

export interface DistrictData {
  name: string;
  type: string;  // "castle", "cathedral", "market", "harbour", "farm", "park", "mansion", "alleys", "craftsmen", "merchant", "patriciate", "administration", "military", "gate"
  bounds: Bounds;
  buildings: BuildingPlacement[];
}

export interface BuildingPlacement {
  pos: Point;
  w: number;
  h: number;
  type?: string;
  /** Link to a dwelling/dungeon location if generated */
  interiorId?: string;
}

// ── Village-specific ────────────────────────────────────────────────────────

export interface VillageData {
  buildings: BuildingPlacement[];
  palisade?: { points: Point[] };
  gates?: Point[];
  water?: { river?: Point[][]; bridges?: { from: Point; to: Point }[] };
  roads: RoadSegment[];
  farmland?: Bounds[];
  forest?: Bounds[];
}
