import { assertEquals } from "@std/assert";
import {
  apply,
  type Command,
  type Direction,
  type GameEvent,
  type GameState,
  newGame,
  requirementAt,
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

function run(state: GameState, commands: Command[]): GameEvent[] {
  const events: GameEvent[] = [];
  for (const command of commands) {
    events.push(...apply(state, command));
  }
  return events;
}

Deno.test("seed 121 can craft a torch and mine the first cave", () => {
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
});
