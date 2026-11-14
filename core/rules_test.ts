import { assert, assertEquals } from "@std/assert";
import {
  apply,
  cellKey,
  dropsAt,
  type GameState,
  isPassable,
  newGame,
  type Terrain,
  terrainAt,
} from "./mod.ts";

// Each test has a Given-When-Then shape: https://martinfowler.com/bliki/GivenWhenThen.html
const SEED = 121;

// A state with the player just west of a cell that is, or is not, passable.
// Searching keeps these tests honest if the terrain formula changes.
function besideEasternCell(passable: boolean): GameState {
  for (let x = 2; x < 10_000; x++) {
    const here = isPassable(terrainAt(SEED, x, 0));
    const east = isPassable(terrainAt(SEED, x + 1, 0));
    if (here && east === passable) {
      const state = newGame(SEED);
      state.player = { x, y: 0 };
      return state;
    }
  }
  throw new Error("Found no suitable cell on this row.");
}

Deno.test("moving onto passable terrain moves the player", () => {
  const state = besideEasternCell(true);
  const { x, y } = state.player;

  const events = apply(state, { type: "move", direction: "east" });

  assertEquals(state.player, { x: x + 1, y });
  assertEquals(events, [{
    type: "moved",
    from: { x, y },
    to: { x: x + 1, y },
  }]);
});

Deno.test("a blocked move changes nothing and reports why", () => {
  const state = besideEasternCell(false);
  const snapshot = JSON.parse(JSON.stringify(state));
  const { x, y } = state.player;
  const target = { x: x + 1, y };

  const events = apply(state, { type: "move", direction: "east" });

  assertEquals(state, snapshot);
  assertEquals(events, [{
    type: "blocked",
    at: { x, y },
    toward: target,
    terrain: terrainAt(SEED, target.x, target.y),
  }]);
});

Deno.test("an event keeps its cells while state moves on", () => {
  const state = besideEasternCell(true);
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

Deno.test("harvesting terrain with no drops changes nothing", () => {
  // Nothing grows on water, and no rule lets a player stand there yet, so
  // this state is placed by hand.
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

function westOf(terrain: Terrain): GameState {
  for (let x = 2; x < 10_000; x++) {
    const here = isPassable(terrainAt(SEED, x, 0));
    if (here && terrainAt(SEED, x + 1, 0) === terrain) {
      const state = newGame(SEED);
      state.player = { x, y: 0 };
      return state;
    }
  }
  throw new Error("Found no suitable cell on this row.");
}

Deno.test("rock blocks a player without a torch", () => {
  const state = westOf("rock");
  const snapshot = JSON.parse(JSON.stringify(state));
  const { x, y } = state.player;

  const events = apply(state, { type: "move", direction: "east" });

  assertEquals(state, snapshot);
  assertEquals(events, [{
    type: "blocked",
    at: { x, y },
    toward: { x: x + 1, y },
    terrain: "rock",
  }]);
});

Deno.test("a torch lets the player into rock and is kept", () => {
  const state = westOf("rock");
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

Deno.test("a torch does not open water", () => {
  const state = westOf("water");
  state.inventory.torch = 1;
  const snapshot = JSON.parse(JSON.stringify(state));
  const { x, y } = state.player;

  const events = apply(state, { type: "move", direction: "east" });

  assertEquals(state, snapshot);
  assertEquals(events, [{
    type: "blocked",
    at: { x, y },
    toward: { x: x + 1, y },
    terrain: "water",
  }]);
});

Deno.test("rock yields ore once to a player with a torch", () => {
  const state = westOf("rock");
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
    terrain: "rock",
    reason: "depleted",
  }]);
});
