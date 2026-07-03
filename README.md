# Watabou Dwellings — TypeScript Floor Plan Generator

Procedural multi-story building generator producing data in the same format as
[Watabou's Dwellings](https://watabou.itch.io/dwellings) JSON export.

## Quick Start

```bash
npm install
npx tsx demo.ts              # random seed
npx tsx demo.ts 42           # seed 42
npx tsx demo.ts 42 large slab spiral  # seed + tags
```

Output: `dwelling_output.json` in the Dwellings format.

## Usage

```typescript
import { FloorPlanGenerator, House } from "./src/index";

const gen = new FloorPlanGenerator();
const house: House = gen.generate(12345, ["large", "slab"], 2);

// house.floors: Floor[]
// house.exit: { cell: {i, j}, dir: "n"|"s"|"e"|"w" }
// Each floor: { level, rooms, doors, windows, stairs }
```

## Interactive Use (Original Tool)

```bash
npx tsx server.ts            # http://localhost:3456
npx tsx server.ts 8080       # custom port
```

This serves the original Dwellings generator's static files. Open in browser,
press **Enter** to generate, right-click → Export → as JSON for structured data.

## Data Format

```typescript
interface House {
  floors: Floor[];
  exit: Edge;        // main entrance
  spiral?: Edge;     // spiral staircase entrance
}

interface Floor {
  level: number;     // -1=basement, 0=ground, 1+=upper
  rooms: Room[];     // { name?, cells: Cell[] }
  doors: Door[];     // { edge: {cell, dir}, type?: "doorway"|"regular" }
  windows: Window[]; // { cell, dir }
  stairs: Stair[];   // { cell, dir, up: boolean }
}

interface Cell { i: number; j: number; }
```

## Tags

| Tag | Effect |
|-----|--------|
| `small` | Compact floor plan |
| `large` | Larger floor plan |
| `slab` | Wide rectangular shape |
| `tower` | Narrow tall shape |
| `spiral` | Add spiral staircase |

## How It Works

The original generator is a **Haxe + OpenFL** app compiled to a 1.3MB JavaScript
bundle with Google Closure Compiler. The compiled output completely seals all
internal state — classes, the house object, and export functions are trapped
inside a closure and cannot be accessed from page JavaScript.

This project provides a pure TypeScript reimplementation using the same data
model. Algorithm: place room seeds on a grid → grow rooms → connect with
corridors → assign room types → add doors/windows → repeat for multi-story.

## License

Generated plans may be used freely including in commercial works. The original
generator is copyright Oleg Dolya (watabou). See https://watabou.itch.io/dwellings
