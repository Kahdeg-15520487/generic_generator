/**
 * Watabou Generators demo — all generators in one CLI
 *
 *   npx tsx demo.ts realm 42
 *   npx tsx demo.ts city 42
 *   npx tsx demo.ts village 42
 *   npx tsx demo.ts dwellings 42 large slab
 *   npx tsx demo.ts dungeon 42 small
 */
import { DwellingsGenerator, DungeonGenerator, RealmGenerator, CityGenerator, VillageGenerator, renderRealm } from "./src/index.js";
import { renderFloor } from "./src/render.js";
import { renderDungeon } from "./src/dungeon/render.js";
import { renderVillage } from "./src/village/render.js";

const args = process.argv.slice(2);
const modes = ["realm", "city", "village", "dwellings", "dungeon"];
const mode = modes.includes(args[0]!) ? args[0]! : "realm";
const rest = modes.includes(args[0]!) ? args.slice(1) : args;
const seed = parseInt(rest[0]!, 10) || Math.floor(Math.random() * 2147483647);
const tags = rest.slice(1).filter(a => !a.startsWith("--"));

const outfile = `${mode}_output.json`;

if (mode === "realm") {
  console.log(`🌍 Realm  seed=${seed}\n`);
  const world = new RealmGenerator().generate(seed);
  const data = world.locations[world.realmId]!.data as any;
  console.log(`Settlements: ${data.settlements.length}  POIs: ${data.pointsOfInterest.length}\n`);
  console.log(renderRealm(data));

} else if (mode === "city") {
  console.log(`🏰 City  seed=${seed}\n`);
  const city = new CityGenerator().generate(seed);
  console.log(`Districts: ${city.districts.length}  Buildings: ${city.buildings.length}`);
  for (const d of city.districts) console.log(`  ${d.type}: ${d.name}`);
  printGrid(city.bounds, city.buildings.map(b => ({ x: b.coordinates[0]![0]![0]!, y: b.coordinates[0]![0]![1]!, w: b.coordinates[0]![2]![0]! - b.coordinates[0]![0]![0]!, h: b.coordinates[0]![2]![1]! - b.coordinates[0]![0]![1]! })));
  import("fs").then(fs => fs.writeFileSync(outfile, JSON.stringify(city, null, 2)));

} else if (mode === "village") {
  console.log(`🏡 Village  seed=${seed}\n`);
  const village = new VillageGenerator().generate(seed);
  console.log(`Buildings: ${village.buildings.length}  Roads: ${village.roads.length}  Trees: ${village.trees.length}`);
  if (village.palisade) console.log(`Palisade: yes  Gates: ${village.gates?.length ?? 0}`);
  if (village.water) console.log(`Water: yes`);
  console.log(renderVillage(village));
  import("fs").then(fs => fs.writeFileSync(outfile, JSON.stringify(village, null, 2)));

} else if (mode === "dungeon") {
  console.log(`🕳  Dungeon  seed=${seed}  tags=[${tags.join(",")}]\n`);
  const d = new DungeonGenerator().generate(seed, tags);
  console.log(`${d.title}\n${d.story}\nRooms: ${d.rects.length}  Doors: ${d.doors.length}\n`);
  console.log(renderDungeon(d));
  for (const n of d.notes) console.log(`  ${n.ref}. ${n.text} (${n.pos.x},${n.pos.y})`);
  import("fs").then(fs => fs.writeFileSync(outfile, JSON.stringify(d, null, 2)));

} else {
  console.log(`🏠 Dwellings  seed=${seed}  tags=[${tags.join(",")}]\n`);
  const h = new DwellingsGenerator().generate(seed, tags);
  console.log(`Floors: ${h.floors.length}  Exit: (${h.exit.cell.i},${h.exit.cell.j}) ${h.exit.dir}`);
  for (const f of [...h.floors].sort((a,b) => a.level - b.level)) {
    const label: Record<number,string> = { [-1]: "Basement", 0: "Ground" };
    console.log(`\n${label[f.level] ?? `Floor ${f.level}`} (L${f.level})  ${f.rooms.length}r ${f.doors.length}d ${f.windows.length}w ${f.stairs.length}s`);
    console.log(renderFloor(f));
    for (const r of f.rooms) console.log(`  ${r.name?.[0] ?? "?"} ${r.name || "(unnamed)"} [${r.cells.length}c]`);
  }
  import("fs").then(fs => fs.writeFileSync(outfile, JSON.stringify(h, null, 2)));
}

console.log(`\n💾 ${outfile}`);

function printGrid(bounds: number[], rects: {x:number;y:number;w:number;h:number}[]) {
  const [bx, by, bw, bh] = bounds;
  const g: string[][] = Array.from({length: Math.floor(bh!)+2}, () => Array(Math.floor(bw!)+2).fill(" "));
  for (const r of rects) {
    for (let dy = 0; dy < r.h; dy++)
      for (let dx = 0; dx < r.w; dx++)
        g[Math.floor(r.y)+dy]![Math.floor(r.x)+dx] = "#";
  }
  console.log(g.map(r => r.join("")).join("\n"));
}
