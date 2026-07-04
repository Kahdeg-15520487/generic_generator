// ===========================================================================
// Web UI server for multi-level world navigation
//   npx tsx web/server.ts
// ===========================================================================

import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { WorldBuilder } from "../src/core/worldbuilder.js";
import { RealmGenerator } from "../src/realm/generator.js";
import { CityGenerator } from "../src/city/generator.js";
import { VillageGenerator } from "../src/village/generator.js";
import { DungeonGenerator } from "../src/dungeon/generator.js";
import { CaveGenerator } from "../src/cave/generator.js";
import { DwellingsGenerator } from "../src/dwellings/generator.js";
import type { GeneratedWorld, World, Location } from "../src/core/worldbuilder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png",
};

// ── Global world state ──────────────────────────────────────────────────────
let world: GeneratedWorld | null = null;

function getWorld(): GeneratedWorld {
  if (!world) world = new WorldBuilder().build({ seed: Math.floor(Math.random() * 2147483647), depth: 3 });
  return world;
}

// ── API handlers ────────────────────────────────────────────────────────────

function apiWorld(_url: URL): object {
  const w = getWorld();
  const realm = w.locations[w.realmId]!;
  const realmData = realm.data as any;
  return {
    realmId: w.realmId,
    locationCount: Object.keys(w.locations).length,
    realm: {
      name: realm.name,
      settlements: realmData.settlements.map((s: any) => ({
        id: s.locationId, name: s.name, type: s.type, pos: s.pos, size: s.size,
      })),
      pois: realmData.pointsOfInterest.map((p: any) => ({
        id: p.locationId, name: p.name, type: p.type, pos: p.pos,
      })),
      terrain: realmData.terrain.map((t: any) => ({
        x: t.pos.x, y: t.pos.y, type: t.type, elevation: t.elevation,
      })),
    },
    roadSegments: w.roadNetwork.segments.map(s => ({
      from: s.from, to: s.to, type: s.type,
    })),
  };
}

function apiLocation(url: URL): object {
  const id = url.searchParams.get("id") || "";
  const w = getWorld();
  const loc = w.locations[id];
  if (!loc) return { error: "not found" };

  const data = w.cache[id] || loc.data;
  return {
    id: loc.id, type: loc.type, name: loc.name, seed: loc.seed,
    parentId: loc.parentId,
    children: loc.children.map(cid => {
      const child = w.locations[cid];
      return child ? { id: cid, type: child.type, name: child.name } : null;
    }).filter(Boolean),
    roadConnections: loc.roadConnections,
    data: data,
  };
}

function apiRegenerate(url: URL): object {
  const seed = parseInt(url.searchParams.get("seed") || "0") || Math.floor(Math.random() * 2147483647);
  world = new WorldBuilder().build({ seed, depth: 3 });
  return { seed, locationCount: Object.keys(world.locations).length };
}

// ── Server ──────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // API routes
  if (pathname === "/api/world") return json(res, apiWorld(url));
  if (pathname === "/api/location") return json(res, apiLocation(url));
  if (pathname === "/api/regenerate") return json(res, apiRegenerate(url));

  // Static files
  let filePath = pathname === "/" ? "/index.html" : pathname;
  filePath = path.join(__dirname, filePath);
  if (!filePath.startsWith(__dirname)) { res.writeHead(403); res.end(); return; }

  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not Found"); return; }
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
});

function json(res: http.ServerResponse, data: object) {
  res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}

const PORT = parseInt(process.env.PORT || "3000");
server.listen(PORT, () => {
  console.log(`\n  🌍 World Navigator → http://localhost:${PORT}\n`);
});
