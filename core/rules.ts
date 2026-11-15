// The rules of the game. There is no clock here: a command updates the state at
// once, and the events it returns are a record of what happened. Whoever called
// apply() decides how, or whether, to show them over time.

import {
  addTo,
  countOf,
  type Inventory,
  missingFor,
  removeFrom,
  stacksOf,
  totalsOf,
} from "./inventory.ts";
import type { Material } from "./materials.ts";
import { type RecipeId, RECIPES } from "./recipes.ts";
import {
  DROPS,
  dropsAt,
  GATHER_FROM,
  meets,
  requirementAt,
  type Terrain,
  terrainAt,
} from "./terrain.ts";

export type Cell = { x: number; y: number };

export function cellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}

export type Direction = "north" | "south" | "east" | "west";

// Plain data that survives JSON. Terrain is absent because the seed can recompute
// it: besides the seed, only what the player has caused belongs here.
export type GameState = {
  seed: number;
  player: Cell;
  inventory: Inventory;
  harvested: Record<string, true>;
  rescued: boolean;
};

const RESCUE: Material = "signal_fire";

// Command: https://gameprogrammingpatterns.com/command.html
export type Command =
  | { type: "move"; direction: Direction }
  | { type: "harvest" }
  | { type: "fish" }
  | { type: "craft"; recipe: RecipeId };

// "out-of-reach": fishing with no water beside the player.
export type HarvestFailure = "no-material" | "depleted" | "out-of-reach";

export type CraftFailure = "missing-materials";

// Domain Event: https://martinfowler.com/eaaDev/DomainEvent.html
// Events that change the inventory carry the resulting totals, so a listener can
// keep its own copy in step without knowing the rule that changed it.
// `needs` on a blocked move is the material that would have opened the way, or
// null when nothing can.
export type GameEvent =
  | { type: "moved"; from: Cell; to: Cell }
  | {
    type: "blocked";
    at: Cell;
    toward: Cell;
    terrain: Terrain;
    needs: Material | null;
  }
  | { type: "harvested"; at: Cell; gained: Inventory; totals: Inventory }
  | {
    type: "harvestFailed";
    at: Cell;
    terrain: Terrain;
    reason: HarvestFailure;
  }
  | {
    type: "crafted";
    recipe: RecipeId;
    consumed: Inventory;
    produced: Inventory;
    totals: Inventory;
  }
  | {
    type: "craftFailed";
    recipe: RecipeId;
    reason: CraftFailure;
    missing: Inventory;
  }
  | { type: "rescued" };

const STEPS: Record<Direction, Cell> = {
  north: { x: 0, y: -1 },
  south: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  west: { x: -1, y: 0 },
};

// Singleton, avoided on purpose: tests make as many games as they need. https://gameprogrammingpatterns.com/singleton.html
export function newGame(seed: number): GameState {
  return {
    seed,
    player: { x: 0, y: 0 },
    inventory: {},
    harvested: {},
    rescued: false,
  };
}

// The single way in. It updates the state it is given and returns the events.
export function apply(state: GameState, command: Command): GameEvent[] {
  if (state.rescued) return [];
  switch (command.type) {
    case "move":
      return move(state, command.direction);
    case "harvest":
      return harvest(state);
    case "fish":
      return fish(state);
    case "craft":
      return craft(state, command.recipe);
  }
}

function move(state: GameState, direction: Direction): GameEvent[] {
  const step = STEPS[direction];
  // Events are retained and played back later, while state keeps changing. So an
  // event gets cells of its own, never an object that state still holds.
  // Aliasing Bug: https://martinfowler.com/bliki/AliasingBug.html
  // Cells in events act as a Value Object: https://martinfowler.com/bliki/ValueObject.html
  const from = { ...state.player };
  const to = { x: from.x + step.x, y: from.y + step.y };
  const terrain = terrainAt(state.seed, to.x, to.y);
  const needed = requirementAt(state.seed, to.x, to.y);
  if (!meets(needed, state.inventory)) {
    return [{
      type: "blocked",
      at: from,
      toward: to,
      terrain,
      needs: needed === "never" ? null : needed,
    }];
  }
  state.player.x = to.x;
  state.player.y = to.y;
  return [{ type: "moved", from, to }];
}

// Takes from the cell the player stands on.
function harvest(state: GameState): GameEvent[] {
  const at = { ...state.player };
  const terrain = terrainAt(state.seed, at.x, at.y);
  if (DROPS[terrain].length === 0 || GATHER_FROM[terrain] !== "here") {
    return [{ type: "harvestFailed", at, terrain, reason: "no-material" }];
  }
  return take(state, at, at);
}

// Takes from a cell beside the player that is gathered from the shore, such as a
// lake. It tries north, south, east, then west, and picks the first not yet taken.
function fish(state: GameState): GameEvent[] {
  const here = { ...state.player };
  const shore = Object.values(STEPS)
    .map((step) => ({ x: here.x + step.x, y: here.y + step.y }))
    .filter((cell) =>
      GATHER_FROM[terrainAt(state.seed, cell.x, cell.y)] === "beside"
    );
  if (shore.length === 0) {
    const terrain = terrainAt(state.seed, here.x, here.y);
    return [{
      type: "harvestFailed",
      at: here,
      terrain,
      reason: "out-of-reach",
    }];
  }
  const target = shore.find((cell) => !state.harvested[cellKey(cell)]) ??
    shore[0];
  return take(state, here, target);
}

// Each cell gives its drops once. `from` is where the player is, and `target` the
// cell that gives: the same cell for a harvest, a neighbor for fishing.
function take(state: GameState, from: Cell, target: Cell): GameEvent[] {
  const key = cellKey(target);
  if (state.harvested[key]) {
    // Like every failure, it describes the cell the player is on.
    const terrain = terrainAt(state.seed, from.x, from.y);
    return [{
      type: "harvestFailed",
      at: { ...from },
      terrain,
      reason: "depleted",
    }];
  }
  const gained = dropsAt(state.seed, target.x, target.y);
  addTo(state.inventory, gained);
  state.harvested[key] = true;
  return [{
    type: "harvested",
    at: { ...target },
    gained,
    totals: totalsOf(state.inventory, gained),
  }];
}

// Knows nothing about any particular recipe: it reads the RECIPES table.
function craft(state: GameState, id: RecipeId): GameEvent[] {
  const recipe = RECIPES[id];
  const missing = missingFor(state.inventory, recipe.inputs);
  if (stacksOf(missing).length > 0) {
    return [{
      type: "craftFailed",
      recipe: id,
      reason: "missing-materials",
      missing,
    }];
  }
  removeFrom(state.inventory, recipe.inputs);
  addTo(state.inventory, recipe.outputs);
  // Copies, never the table's own objects: events outlive this call.
  const consumed = { ...recipe.inputs };
  const produced = { ...recipe.outputs };
  const events: GameEvent[] = [{
    type: "crafted",
    recipe: id,
    consumed,
    produced,
    totals: totalsOf(state.inventory, { ...consumed, ...produced }),
  }];
  if (countOf(produced, RESCUE) > 0) {
    state.rescued = true;
    events.push({ type: "rescued" });
  }
  return events;
}
