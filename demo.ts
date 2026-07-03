/**
 * Dwellings generator demo — stats + ASCII floor plans.
 *
 *   npx tsx demo.ts                random seed
 *   npx tsx demo.ts 42             seed 42
 *   npx tsx demo.ts 42 large slab  seed + tags
 */
import { DwellingsGenerator, type House } from "./src/index.js";
import { renderFloor } from "./src/render.js";

const args = process.argv.slice(2);
const seed = parseInt(args[0]!, 10) || Math.floor(Math.random() * 2147483647);
const tags = args.slice(1).filter(a => !a.startsWith("--"));

console.log(`🏠 seed=${seed}  tags=[${tags.join(",")}]\n`);

const gen = new DwellingsGenerator();
const house = gen.generate(seed, tags);

printHouse(house);

import("node:fs").then(fs => {
  fs.writeFileSync("dwelling_output.json", JSON.stringify(house, null, 2));
  console.log(`\n💾 dwelling_output.json  (${JSON.stringify(house).length}B)`);
});

function printHouse(h: House) {
  console.log(`Floors: ${h.floors.length}  Exit: (${h.exit.cell.i},${h.exit.cell.j}) ${h.exit.dir}`);
  if (h.spiral) console.log(`Spiral: (${h.spiral.cell.i},${h.spiral.cell.j}) ${h.spiral.dir}`);

  const sorted = [...h.floors].sort((a, b) => a.level - b.level);
  for (const f of sorted) {
    const label: Record<number, string> = { [-1]: "Basement", 0: "Ground" };
    const name = label[f.level] ?? `Floor ${f.level}`;
    console.log(`\n${"=".repeat(60)}`);
    console.log(`${name} (L${f.level})  ${f.rooms.length}r ${f.doors.length}d ${f.windows.length}w ${f.stairs.length}s`);
    console.log(renderFloor(f));
    for (const r of f.rooms) {
      const letter = r.name ? r.name.charAt(0).toUpperCase() : "?";
      console.log(`  ${letter} ${r.name || "(unnamed)"} [${r.cells.length}c]`);
    }
    for (const s of f.stairs) {
      console.log(`  ${s.up ? "↑ up" : "↓ down"} to ${s.up ? "upper" : "lower"} floor`);
    }
  }
}
