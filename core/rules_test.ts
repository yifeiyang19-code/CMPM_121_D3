import { assert, assertEquals } from "@std/assert";
import {
  apply,
  cellKey,
  dropsAt,
  type GameState,
  isPassable,
  LARGE_CAVE_CELLS,
  newGame,
  regionOf,
  type Terrain,
  terrainAt,
} from "./mod.ts";

// Each test has a Given-When-Then shape: https://martinfowler.com/bliki/GivenWhenThen.html
const SEED = 121;

// A state with the player just west of a cell that is passable.
// Searching keeps these tests honest if the terrain formula changes.
function besideOpenCell(): GameState {
  for (let x = 2; x < 10_000; x++) {
    const here = isPassable(terrainAt(SEED, x, 0));
    const east = isPassable(terrainAt(SEED, x + 1, 0));
    if (here && east) {
      const state = newGame(SEED);
      state.player = { x, y: 0 };
      return state;
    }
  }
  throw new Error("Found no suitable cell on this row.");
}

Deno.test("moving onto passable terrain moves the player", () => {
  const state = besideOpenCell();
  const { x, y } = state.player;

  const events = apply(state, { type: "move", direction: "east" });

  assertEquals(state.player, { x: x + 1, y });
  assertEquals(events, [{
    type: "moved",
    from: { x, y },
    to: { x: x + 1, y },
  }]);
});

Deno.test("an event keeps its cells while state moves on", () => {
  const state = besideOpenCell();
  const { x, y } = state.player;

  const first = apply(state, { type: "move", direction: "east" });
  const second = apply(state, { type: "move", direction: "west" });
  apply(state, { type: "move", direction: "east" });

  // Both retained events still report the cells from when they happened, even
  // though state.player has since changed.
  assertEquals(first, [{
    type: "moved",
    from: { x, y },
    to: { x: x + 1, y },
  }]);
  assertEquals(second, [{
    type: "moved",
    from: { x: x + 1, y },
    to: { x, y },
  }]);
});

function standingOn(terrain: Terrain): GameState {
  for (let x = 0; x < 10_000; x++) {
    if (terrainAt(SEED, x, 0) === terrain) {
      const state = newGame(SEED);
      state.player = { x, y: 0 };
      return state;
    }
  }
  throw new Error("Found no suitable cell on this row.");
}

// A state with the player on open ground, just west of a cell that matches.
function westOfCell(match: (x: number, y: number) => boolean): GameState {
  for (let y = -150; y <= 150; y++) {
    for (let x = -150; x <= 150; x++) {
      if (isPassable(terrainAt(SEED, x, y)) && match(x + 1, y)) {
        const state = newGame(SEED);
        state.player = { x, y };
        return state;
      }
    }
  }
  throw new Error("Found no suitable cell nearby.");
}

function isCave(x: number, y: number, large: boolean): boolean {
  if (terrainAt(SEED, x, y) !== "cave") return false;
  const size = regionOf(SEED, x, y, LARGE_CAVE_CELLS + 1).length;
  return (size > LARGE_CAVE_CELLS) === large;
}

const westOfSmallCave = () => westOfCell((x, y) => isCave(x, y, false));
const westOfLargeCave = () => westOfCell((x, y) => isCave(x, y, true));
const westOfWater = () =>
  westOfCell((x, y) => terrainAt(SEED, x, y) === "water");

Deno.test("harvesting a forest cell for the first time gives its drops", () => {
  const state = standingOn("forest");
  const { x, y } = state.player;
  // Rare drops depend on the cell, so ask the world what this cell holds.
  const gained = dropsAt(SEED, x, y);

  const events = apply(state, { type: "harvest" });

  assertEquals(gained.wood, 1);
  assertEquals(state.inventory, gained);
  assertEquals(state.harvested, { [cellKey({ x, y })]: true });
  assertEquals(events, [{
    type: "harvested",
    at: { x, y },
    gained,
    totals: gained,
  }]);
});

Deno.test("harvesting a grass cell gives fiber", () => {
  const state = standingOn("grass");
  const { x, y } = state.player;

  apply(state, { type: "harvest" });

  assertEquals(state.inventory, dropsAt(SEED, x, y));
  assertEquals(state.inventory.fiber, 1);
});

Deno.test("harvesting the same cell again changes nothing", () => {
  const state = standingOn("forest");
  const { x, y } = state.player;
  apply(state, { type: "harvest" });
  const snapshot = JSON.parse(JSON.stringify(state));

  const events = apply(state, { type: "harvest" });

  assertEquals(state, snapshot);
  assertEquals(events, [{
    type: "harvestFailed",
    at: { x, y },
    terrain: "forest",
    reason: "depleted",
  }]);
});

Deno.test("harvesting underfoot where only the shore can gather changes nothing", () => {
  // No rule lets a player stand on water, so this state is placed by hand.
  const state = standingOn("water");
  const snapshot = JSON.parse(JSON.stringify(state));
  const { x, y } = state.player;

  const events = apply(state, { type: "harvest" });

  assertEquals(state, snapshot);
  assertEquals(events, [{
    type: "harvestFailed",
    at: { x, y },
    terrain: "water",
    reason: "no-material",
  }]);
});

Deno.test("harvest totals add to what the player already holds", () => {
  const state = standingOn("forest");
  state.inventory.wood = 4;

  const events = apply(state, { type: "harvest" });

  assertEquals(state.inventory.wood, 5);
  const [event] = events;
  assert(event.type === "harvested");
  assertEquals(event.totals.wood, 5);
});

Deno.test("fishing beside a lake gives fish from a water cell", () => {
  const state = westOfWater();
  const { x, y } = state.player;

  const events = apply(state, { type: "fish" });

  assertEquals(state.player, { x, y });
  assertEquals(state.inventory, { fish: 1 });
  const [event] = events;
  assert(event.type === "harvested");
  assertEquals(event.gained, { fish: 1 });
  assertEquals(event.totals, { fish: 1 });
  assertEquals(terrainAt(SEED, event.at.x, event.at.y), "water");
  assertEquals(state.harvested, { [cellKey(event.at)]: true });
});

Deno.test("each water cell beside the player gives fish once", () => {
  const state = westOfWater();
  const { x, y } = state.player;
  const lakes =
    [[0, -1], [0, 1], [1, 0], [-1, 0]].filter(([dx, dy]) =>
      terrainAt(SEED, x + dx, y + dy) === "water"
    ).length;

  for (let i = 0; i < lakes; i++) apply(state, { type: "fish" });
  const events = apply(state, { type: "fish" });

  assertEquals(state.inventory, { fish: lakes });
  assertEquals(events, [{
    type: "harvestFailed",
    at: { x, y },
    terrain: terrainAt(SEED, x, y),
    reason: "depleted",
  }]);
});

Deno.test("fishing with no water beside the player changes nothing", () => {
  const state = newGame(SEED);
  const snapshot = JSON.parse(JSON.stringify(state));

  const events = apply(state, { type: "fish" });

  assertEquals(state, snapshot);
  assertEquals(events, [{
    type: "harvestFailed",
    at: { x: 0, y: 0 },
    terrain: terrainAt(SEED, 0, 0),
    reason: "out-of-reach",
  }]);
});

Deno.test("a cave blocks a player without a torch and says what opens it", () => {
  const state = westOfSmallCave();
  const snapshot = JSON.parse(JSON.stringify(state));
  const { x, y } = state.player;

  const events = apply(state, { type: "move", direction: "east" });

  assertEquals(state, snapshot);
  assertEquals(events, [{
    type: "blocked",
    at: { x, y },
    toward: { x: x + 1, y },
    terrain: "cave",
    needs: "torch",
  }]);
});

Deno.test("a torch lets the player into a small cave and is kept", () => {
  const state = westOfSmallCave();
  state.inventory.torch = 1;
  const { x, y } = state.player;

  const events = apply(state, { type: "move", direction: "east" });

  assertEquals(state.player, { x: x + 1, y });
  assertEquals(state.inventory, { torch: 1 });
  assertEquals(events, [{
    type: "moved",
    from: { x, y },
    to: { x: x + 1, y },
  }]);
});

Deno.test("a torch does not open a large cave", () => {
  const state = westOfLargeCave();
  state.inventory.torch = 1;
  const snapshot = JSON.parse(JSON.stringify(state));
  const { x, y } = state.player;

  const events = apply(state, { type: "move", direction: "east" });

  assertEquals(state, snapshot);
  assertEquals(events, [{
    type: "blocked",
    at: { x, y },
    toward: { x: x + 1, y },
    terrain: "cave",
    needs: "lantern",
  }]);
});

Deno.test("a lantern opens a large cave", () => {
  const state = westOfLargeCave();
  state.inventory.lantern = 1;
  const { x, y } = state.player;

  const events = apply(state, { type: "move", direction: "east" });

  assertEquals(state.player, { x: x + 1, y });
  assertEquals(events, [{
    type: "moved",
    from: { x, y },
    to: { x: x + 1, y },
  }]);
});

Deno.test("a torch does not open water", () => {
  const state = westOfWater();
  state.inventory.torch = 1;
  state.inventory.lantern = 1;
  const snapshot = JSON.parse(JSON.stringify(state));
  const { x, y } = state.player;

  const events = apply(state, { type: "move", direction: "east" });

  assertEquals(state, snapshot);
  assertEquals(events, [{
    type: "blocked",
    at: { x, y },
    toward: { x: x + 1, y },
    terrain: "water",
    needs: null,
  }]);
});

Deno.test("a cave yields ore once to a player with a torch", () => {
  const state = westOfSmallCave();
  state.inventory.torch = 1;
  apply(state, { type: "move", direction: "east" });
  const { x, y } = state.player;
  const gained = dropsAt(SEED, x, y);

  const first = apply(state, { type: "harvest" });
  const second = apply(state, { type: "harvest" });

  assertEquals(gained.ore, 1);
  assertEquals(state.inventory, { torch: 1, ...gained });
  assertEquals(state.harvested, { [cellKey({ x, y })]: true });
  assertEquals(first, [{
    type: "harvested",
    at: { x, y },
    gained,
    totals: gained,
  }]);
  assertEquals(second, [{
    type: "harvestFailed",
    at: { x, y },
    terrain: "cave",
    reason: "depleted",
  }]);
});
