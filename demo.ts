/**
 * Watabou Generators demo
 *   npx tsx demo.ts world 42    — full world with cross-level generation
 *   npx tsx demo.ts realm 42    — realm only
 *   npx tsx demo.ts city 42     — city only
 *   npx tsx demo.ts village 42  — village only
 *   npx tsx demo.ts dungeon 42  — dungeon only
 */
import { DwellingsGenerator, DungeonGenerator, RealmGenerator, CityGenerator, VillageGenerator, WorldBuilder } from "./src/index.js";

const args = process.argv.slice(2);
const mode = args[0] ?? "realm";
const rest = ["realm","city","village","dungeon","dwellings","world"].includes(args[0]!) ? args.slice(1) : args;
const seed = parseInt(rest[0]!, 10) || Math.floor(Math.random() * 2147483647);
const tags = rest.slice(1).filter(a => !a.startsWith("--"));

if (mode === "world") {
  console.log(`🌐 Building world with seed=${seed}...\n`);
  const builder = new WorldBuilder();
  const world = builder.build({ seed, depth: 3 });
  const realm = world.realmData;

  console.log(`╔══════════════════════════════════════╗`);
  console.log(`║  WORLD #${seed}  —  ${Object.keys(world.locations).length} locations`);
  console.log(`║  Realm: ${realm.settlements.length} settlements, ${realm.pois.length} POIs`);
  console.log(`║  Template: ${realm.template}`);
  console.log(`╚══════════════════════════════════════╝\n`);

  // Terrain summary
  const counts: Record<string, number> = {};
  for (const t of realm.terrain) counts[t.type] = (counts[t.type] || 0) + 1;
  console.log("Terrain:", Object.entries(counts).map(([k,v]) => `${k}:${v}`).join(" "));
  console.log(`Settlements: ${realm.settlements.length}  POIs: ${realm.pois.length}  Roads: ${realm.roads.length}\n`);

  // Print location tree
  printTree(world, world.realmId, 0);

  import("fs").then(fs => fs.writeFileSync("world_output.json", JSON.stringify(world, null, 2)));
  console.log(`\n💾 world_output.json`);

} else if (mode === "realm") {
  console.log(`🌍 Realm seed=${seed}\n`);
  const realm = new RealmGenerator().generate(seed, "island");
  const counts: Record<string, number> = {};
  for (const t of realm.terrain) counts[t.type] = (counts[t.type] || 0) + 1;
  console.log(`Template: ${realm.template}  Size: ${realm.width}×${realm.height}`);
  console.log("Terrain:", Object.entries(counts).map(([k,v]) => `${k}:${v}`).join(" "));
  console.log(`Islands: ${realm.islands?.length ?? 0}  Rivers: ${realm.rivers?.length ?? 0}  SeaRoutes: ${realm.seaRoutes?.length ?? 0}`);
  console.log(`Settlements: ${realm.settlements.length}  POIs: ${realm.pois.length}  Roads: ${realm.roads.length}`);

} else if (mode === "city") {
  console.log(`🏰 City seed=${seed}\n`);
  const city = new CityGenerator().generate(seed);
  console.log(`Wards: ${city.wards.length}  Buildings: ${city.buildings.length}`);
  for (const w of city.wards) console.log(`  ${w.type}: ${w.name} [${w.cells.length}c]`);

} else if (mode === "village") {
  console.log(`🏡 Village seed=${seed}\n`);
  const v = new VillageGenerator().generate(seed);
  console.log(`Buildings: ${v.buildings.length}  Roads: ${v.roads.length}`);
  if (v.palisade) console.log("Palisade: yes");
  if (v.water) console.log("Water: yes");
  console.log("Forest trees:", v.forest.length, "Farmland:", v.farmland.length);

} else if (mode === "dungeon") {
  console.log(`🕳  Dungeon seed=${seed}\n`);
  const d = new DungeonGenerator().generate(seed, tags);
  console.log(`${d.title}\n${d.story}\nRooms: ${d.rects.length}  Doors: ${d.doors?.length ?? 0}`);

} else {
  console.log(`🏠 Dwellings seed=${seed}\n`);
  const h = new DwellingsGenerator().generate(seed, tags);
  console.log(`Floors: ${h.floors.length}`);
}

function printTree(world: any, locId: string, depth: number) {
  const loc = world.locations[locId];
  if (!loc) return;
  const prefix = "  ".repeat(depth) + (depth > 0 ? "└─ " : "");
  const icon: Record<string,string> = {realm:"🌍",city:"🏰",village:"🏡",dwelling:"🏠",dungeon:"◈",cave:"○"};
  console.log(`${prefix}${icon[loc.type]??"·"} ${loc.name} (${loc.type})`);
  for (const childId of loc.children || []) printTree(world, childId, depth + 1);
}
