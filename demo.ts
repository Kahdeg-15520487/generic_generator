/**
 * Watabou Generators demo
 *
 *   npx tsx demo.ts realm 42              realm with settlements
 *   npx tsx demo.ts dwellings 42 large slab
 *   npx tsx demo.ts dungeon 42 small
 */
import { DwellingsGenerator, DungeonGenerator, RealmGenerator, renderRealm } from "./src/index.js";
import { renderFloor } from "./src/render.js";
import { renderDungeon } from "./src/dungeon/render.js";

const args = process.argv.slice(2);
const mode = args[0] ?? "realm";
const rest = (["realm","dwellings","dungeon"].includes(args[0]!)) ? args.slice(1) : args;
const seed = parseInt(rest[0]!, 10) || Math.floor(Math.random() * 2147483647);
const tags = rest.slice(1).filter(a => !a.startsWith("--"));

if (mode === "realm") {
  console.log(`🌍 Realm  seed=${seed}\n`);

  const gen = new RealmGenerator();
  const world = gen.generate(seed);
  const realm = world.locations[world.realmId]!;
  const data = realm.data as any;

  console.log(`Locations: ${Object.keys(world.locations).length}`);
  console.log(`Settlements: ${data.settlements.length}  POIs: ${data.pointsOfInterest.length}`);
  console.log(`Road segments: ${world.roadNetwork.segments.length}\n`);
  console.log(renderRealm(data));

  import("node:fs").then(fs => {
    fs.writeFileSync("realm_output.json", JSON.stringify(world, null, 2));
    console.log(`\n💾 realm_output.json  (${JSON.stringify(world).length}B)`);
  });
} else if (mode === "dungeon") {
  console.log(`🕳  One Page Dungeon  seed=${seed}  tags=[${tags.join(",")}]\n`);
  const gen = new DungeonGenerator();
  const dungeon = gen.generate(seed, tags);
  console.log(`Title: ${dungeon.title}\nStory: ${dungeon.story}\nRooms: ${dungeon.rects.length}  Doors: ${dungeon.doors.length}\n`);
  console.log(renderDungeon(dungeon));
  for (const n of dungeon.notes) console.log(`  ${n.ref}. ${n.text}  (${n.pos.x},${n.pos.y})`);
  import("node:fs").then(fs => {
    fs.writeFileSync("dungeon_output.json", JSON.stringify(dungeon, null, 2));
    console.log(`\n💾 dungeon_output.json`);
  });
} else {
  console.log(`🏠 Dwellings  seed=${seed}  tags=[${tags.join(",")}]\n`);
  const gen = new DwellingsGenerator();
  const house = gen.generate(seed, tags);
  console.log(`Floors: ${house.floors.length}  Exit: (${house.exit.cell.i},${house.exit.cell.j}) ${house.exit.dir}`);
  const sorted = [...house.floors].sort((a, b) => a.level - b.level);
  for (const f of sorted) {
    const label: Record<number, string> = { [-1]: "Basement", 0: "Ground" };
    console.log(`\n${"=".repeat(60)}`);
    console.log(`${label[f.level] ?? `Floor ${f.level}`} (L${f.level})  ${f.rooms.length}r ${f.doors.length}d ${f.windows.length}w ${f.stairs.length}s`);
    console.log(renderFloor(f));
    for (const r of f.rooms) {
      const letter = r.name ? r.name.charAt(0).toUpperCase() : "?";
      console.log(`  ${letter} ${r.name || "(unnamed)"} [${r.cells.length}c]`);
    }
    for (const s of f.stairs) console.log(`  ${s.up ? "↑ up" : "↓ down"}`);
  }
  import("node:fs").then(fs => {
    fs.writeFileSync("dwelling_output.json", JSON.stringify(house, null, 2));
    console.log(`\n💾 dwelling_output.json`);
  });
}
