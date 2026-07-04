/**
 * Full hierarchical world demo
 *   npx tsx demo.ts world 42
 *   npx tsx demo.ts realm 42      — realm only
 *   npx tsx demo.ts city 42       — standalone city
 *   npx tsx demo.ts village 42    — standalone village
 *   npx tsx demo.ts dungeon 42    — standalone dungeon
 *   npx tsx demo.ts dwellings 42  — standalone dwelling
 */
import { WorldBuilder } from "./src/core/worldbuilder.js";
import { RealmGenerator, CityGenerator, VillageGenerator, DwellingsGenerator, DungeonGenerator } from "./src/index.js";
import { renderRealm } from "./src/realm/render.js";
import { renderFloor } from "./src/render.js";
import { renderDungeon } from "./src/dungeon/render.js";
import { renderVillage } from "./src/village/render.js";

const args = process.argv.slice(2);
const mode = args[0] ?? "world";
const seed = parseInt(args[1]!, 10) || Math.floor(Math.random() * 2147483647);
const tags = args.slice(2);

if (mode === "world") {
  console.log(`🌐 Building world with seed=${seed}...\n`);

  const builder = new WorldBuilder();
  const world = builder.build({ seed, depth: 3 });
  const realm = world.locations[world.realmId]!;
  const realmData = realm.data as any;

  console.log(`╔══════════════════════════════════════╗`);
  console.log(`║  WORLD #${seed}  —  ${Object.keys(world.locations).length} locations`);
  console.log(`╠══════════════════════════════════════╣`);
  console.log(`║  Realm:  ${realmData.settlements.length} settlements, ${realmData.pointsOfInterest.length} POIs`);
  console.log(`║  Road segments: ${world.roadNetwork.segments.length}`);
  console.log(`╚══════════════════════════════════════╝\n`);

  // Print realm
  console.log(renderRealm(realmData));

  // Print all locations with their connections
  console.log(`\n─── Location Tree ───`);
  printTree(world, world.realmId, 0);

  // Navigate into first city
  const firstCity = realm.children.find(id => world.locations[id]!.type === "city");
  if (firstCity) {
    const cityLoc = world.locations[firstCity]!;
    console.log(`\n─── Entering ${cityLoc.name} ───`);
    const cityData = world.cache[firstCity] as any;
    console.log(`Districts: ${cityData?.districts?.length ?? 0}  Buildings: ${cityData?.buildings?.length ?? 0}`);

    // Check for dwellings inside buildings
    const dwellings = cityLoc.children.filter(id => world.locations[id]!.type === "dwelling");
    if (dwellings.length > 0) {
      console.log(`\n  Interior dwellings: ${dwellings.length}`);
      for (const dwId of dwellings.slice(0, 1)) {
        const dw = world.locations[dwId]!;
        const house = dw.data as any;
        console.log(`  ── Entering ${dw.name} ──`);
        if (house?.floors) {
          const groundFloor = house.floors.find((f: any) => f.level === 0);
          if (groundFloor) {
            console.log(renderFloor(groundFloor));
          }
        }
      }
    }
  }

  // Navigate into first dungeon POI
  const firstDungeon = realm.children.find(id => world.locations[id]!.type === "dungeon");
  if (firstDungeon) {
    const dungLoc = world.locations[firstDungeon]!;
    const dungData = world.cache[firstDungeon] as any;
    console.log(`\n─── Entering ${dungLoc.name} ──`);
    if (dungData?.rects) {
      console.log(`${dungData.title}\nRooms: ${dungData.rects.length}  Doors: ${dungData.doors?.length ?? 0}\n`);
      console.log(renderDungeon(dungData));
    }
  }

  import("fs").then(fs => fs.writeFileSync("world_output.json", JSON.stringify(world, null, 2)));
  console.log(`\n💾 world_output.json`);

} else if (mode === "realm") {
  const world = new RealmGenerator().generate(seed);
  console.log(renderRealm(world.locations[world.realmId]!.data as any));
} else if (mode === "city") {
  const c = new CityGenerator().generate(seed);
  console.log(`Districts: ${c.districts.length}  Buildings: ${c.buildings.length}`);
  for (const d of c.districts) console.log(`  ${d.type}: ${d.name}`);
} else if (mode === "village") {
  const v = new VillageGenerator().generate(seed);
  console.log(`Buildings: ${v.buildings.length}  Roads: ${v.roads.length}`);
  console.log(renderVillage(v));
} else if (mode === "dungeon") {
  const d = new DungeonGenerator().generate(seed, tags);
  console.log(`${d.title}\n${d.story}\nRooms: ${d.rects.length}\n`);
  console.log(renderDungeon(d));
} else {
  const h = new DwellingsGenerator().generate(seed, tags);
  for (const f of [...h.floors].sort((a,b) => a.level - b.level))
    console.log(renderFloor(f));
}

function printTree(world: any, locId: string, depth: number) {
  const loc = world.locations[locId];
  if (!loc) return;
  const prefix = "  ".repeat(depth) + (depth > 0 ? "└─ " : "");
  const icon: Record<string, string> = { realm: "🌍", city: "🏰", village: "🏡", dwelling: "🏠", dungeon: "◈", cave: "○", landmark: "▲", ruin: "▣", tower: "♜", camp: "⚑" };
  console.log(`${prefix}${icon[loc.type] ?? "·"} ${loc.name} (${loc.type}) seed=${loc.seed}`);
  if (loc.roadConnections?.length > 0) {
    for (const rc of loc.roadConnections) {
      const target = world.locations[rc.targetId];
      console.log(`${"  ".repeat(depth+1)}↕ road to ${target?.name ?? rc.targetId}`);
    }
  }
  for (const childId of loc.children) {
    printTree(world, childId, depth + 1);
  }
}
