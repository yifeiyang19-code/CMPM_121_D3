import { assertEquals } from "@std/assert";
import {
  apply,
  type Command,
  type Direction,
  type GameEvent,
  type GameState,
  newGame,
  requirementAt,
  terrainAt,
} from "./mod.ts";

const SEED = 121;

function moves(direction: Direction, count: number): Command[] {
  return Array.from(
    { length: count },
    (): Command => ({ type: "move", direction }),
  );
}

const FIRST_CAVE: Command[] = [
  { type: "harvest" },
  ...moves("west", 2),
  ...moves("north", 3),
  { type: "harvest" },
  { type: "craft", recipe: "torch" },
  ...moves("north", 6),
  { type: "harvest" },
];

const INTO_LARGE_CAVE: Command = { type: "move", direction: "west" };

const LARGE_CAVE: Command[] = [
  ...moves("west", 1),
  { type: "harvest" },
  ...moves("west", 1),
  ...moves("north", 3),
  { type: "harvest" },
  ...moves("west", 9),
  INTO_LARGE_CAVE,
  { type: "craft", recipe: "lantern" },
  INTO_LARGE_CAVE,
];

function run(state: GameState, commands: Command[]): GameEvent[] {
  const events: GameEvent[] = [];
  for (const command of commands) {
    events.push(...apply(state, command));
  }
  return events;
}

Deno.test("seed 121 crafts a torch and a lantern to reach both caves", () => {
  const state = newGame(SEED);

  assertEquals(run(state, FIRST_CAVE.slice(0, 1)), [{
    type: "harvested",
    at: { x: 0, y: 0 },
    gained: { wood: 1, resin: 1 },
    totals: { wood: 1, resin: 1 },
  }]);
  assertEquals(state.inventory, { wood: 1, resin: 1 });

  const toFiber = run(state, FIRST_CAVE.slice(1, 7));
  assertEquals(toFiber.slice(0, 5).map((event) => event.type), [
    "moved",
    "moved",
    "moved",
    "moved",
    "moved",
  ]);
  assertEquals(state.player, { x: -2, y: -3 });
  assertEquals(toFiber.slice(5), [{
    type: "harvested",
    at: { x: -2, y: -3 },
    gained: { fiber: 1 },
    totals: { fiber: 1 },
  }]);
  assertEquals(state.inventory, { wood: 1, resin: 1, fiber: 1 });

  assertEquals(run(state, FIRST_CAVE.slice(7, 8)), [{
    type: "crafted",
    recipe: "torch",
    consumed: { wood: 1, fiber: 1, resin: 1 },
    produced: { torch: 1 },
    totals: { wood: 0, fiber: 0, resin: 0, torch: 1 },
  }]);
  assertEquals(state.inventory, { torch: 1 });

  const toCave = run(state, FIRST_CAVE.slice(8, 14));
  assertEquals(toCave.map((event) => event.type), [
    "moved",
    "moved",
    "moved",
    "moved",
    "moved",
    "moved",
  ]);
  assertEquals(state.player, { x: -2, y: -9 });
  assertEquals(requirementAt(SEED, -2, -9), "torch");
  assertEquals(state.inventory, { torch: 1 });

  assertEquals(run(state, FIRST_CAVE.slice(14, 15)), [{
    type: "harvested",
    at: { x: -2, y: -9 },
    gained: { ore: 1, coal: 1 },
    totals: { ore: 1, coal: 1 },
  }]);
  assertEquals(state.inventory, { torch: 1, ore: 1, coal: 1 });
  assertEquals(FIRST_CAVE.length, 15);

  const toOre = run(state, LARGE_CAVE.slice(0, 2));
  assertEquals(toOre.slice(0, 1).map((event) => event.type), ["moved"]);
  assertEquals(state.player, { x: -3, y: -9 });
  assertEquals(toOre.slice(1), [{
    type: "harvested",
    at: { x: -3, y: -9 },
    gained: { ore: 1 },
    totals: { ore: 2 },
  }]);
  assertEquals(state.inventory, { torch: 1, ore: 2, coal: 1 });

  const toForest = run(state, LARGE_CAVE.slice(2, 7));
  assertEquals(toForest.slice(0, 4).map((event) => event.type), [
    "moved",
    "moved",
    "moved",
    "moved",
  ]);
  assertEquals(state.player, { x: -4, y: -12 });
  assertEquals(toForest.slice(4), [{
    type: "harvested",
    at: { x: -4, y: -12 },
    gained: { wood: 1, resin: 1 },
    totals: { wood: 1, resin: 1 },
  }]);
  assertEquals(state.inventory, {
    torch: 1,
    ore: 2,
    coal: 1,
    wood: 1,
    resin: 1,
  });

  const toEntrance = run(state, LARGE_CAVE.slice(7, 16));
  assertEquals(
    toEntrance.map((event) => event.type),
    Array(9).fill("moved"),
  );
  assertEquals(state.player, { x: -13, y: -12 });

  assertEquals(LARGE_CAVE[16], INTO_LARGE_CAVE);
  const beforeLantern = JSON.parse(JSON.stringify(state));
  assertEquals(run(state, LARGE_CAVE.slice(16, 17)), [{
    type: "blocked",
    at: { x: -13, y: -12 },
    toward: { x: -14, y: -12 },
    terrain: terrainAt(SEED, -14, -12),
    needs: "lantern",
  }]);
  assertEquals(state, beforeLantern);
  assertEquals(requirementAt(SEED, -14, -12), "lantern");

  assertEquals(run(state, LARGE_CAVE.slice(17, 18)), [{
    type: "crafted",
    recipe: "lantern",
    consumed: { ore: 2, coal: 1, resin: 1 },
    produced: { lantern: 1 },
    totals: { ore: 0, coal: 0, resin: 0, lantern: 1 },
  }]);
  assertEquals(state.inventory, { torch: 1, wood: 1, lantern: 1 });

  assertEquals(LARGE_CAVE[18], INTO_LARGE_CAVE);
  assertEquals(run(state, LARGE_CAVE.slice(18, 19)), [{
    type: "moved",
    from: { x: -13, y: -12 },
    to: { x: -14, y: -12 },
  }]);
  assertEquals(state.player, { x: -14, y: -12 });
  assertEquals(state.inventory, { torch: 1, wood: 1, lantern: 1 });
  assertEquals(LARGE_CAVE.length, 19);
});
