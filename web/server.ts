// ===========================================================================
// Web UI server for multi-level world navigation
// ===========================================================================

import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { WorldBuilder, type GeneratedWorld } from "../src/core/worldbuilder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIME: Record<string, string> = { ".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json" };

let world: GeneratedWorld | null = null;

function getWorld(): GeneratedWorld {
  if (!world) world = new WorldBuilder().build({ seed: Math.floor(Math.random() * 2147483647), depth: 3 });
  return world;
}

function apiWorld(): object {
  const w = getWorld();
  const r = w.realmData;
  return {
    realmId: w.realmId,
    locationCount: Object.keys(w.locations).length,
    template: r.template,
    terrain: r.terrain,
    settlements: r.settlements,
    pois: r.pois,
    roads: r.roads,
  };
}

function apiLocation(id: string): object {
  const w = getWorld();
  const loc = w.locations[id];
  if (!loc) return { error: "not found" };
  return {
    id: loc.id, type: loc.type, name: loc.name, seed: loc.seed,
    parentId: loc.parentId,
    children: loc.children.map(cid => {
      const c = w.locations[cid];
      return c ? { id: cid, type: c.type, name: c.name } : null;
    }).filter(Boolean),
    data: w.cache[id] || loc.data,
  };
}

function apiRegenerate(seed: number): object {
  world = new WorldBuilder().build({ seed: seed || Math.floor(Math.random() * 2147483647), depth: 3 });
  return { seed: world.seed, locationCount: Object.keys(world.locations).length };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const pn = url.pathname;

  if (pn === "/api/world") return json(res, apiWorld());
  if (pn === "/api/location") return json(res, apiLocation(url.searchParams.get("id") || ""));
  if (pn === "/api/regenerate") return json(res, apiRegenerate(parseInt(url.searchParams.get("seed") || "0")));

  let fp = pn === "/" ? "/index.html" : pn;
  fp = path.join(__dirname, fp);
  if (!fp.startsWith(__dirname)) { res.writeHead(403); res.end(); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not Found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
    res.end(data);
  });
});

function json(res: http.ServerResponse, data: object) {
  res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}

const PORT = parseInt(process.env.PORT || "5174");
server.listen(PORT, () => console.log(`\n  🌍 World Navigator → http://localhost:${PORT}\n`));
