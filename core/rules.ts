// The rules of the game. There is no clock here: a command updates the state at
// once, and the events it returns are a record of what happened. Whoever called
// apply() decides how, or whether, to show them over time.

import {
  addTo,
  type Inventory,
  missingFor,
  removeFrom,
  stacksOf,
  totalsOf,
} from "./inventory.ts";
import { type RecipeId, RECIPES } from "./recipes.ts";
import {
  DROPS,
  dropsAt,
  isPassable,
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
};

// Command: https://gameprogrammingpatterns.com/command.html
export type Command =
  | { type: "move"; direction: Direction }
  | { type: "harvest" }
  | { type: "craft"; recipe: RecipeId };

export type HarvestFailure = "no-material" | "depleted";

export type CraftFailure = "missing-materials";

// Domain Event: https://martinfowler.com/eaaDev/DomainEvent.html
// Events that change the inventory carry the resulting totals, so a listener can
// keep its own copy in step without knowing the rule that changed it.
export type GameEvent =
  | { type: "moved"; from: Cell; to: Cell }
  | { type: "blocked"; at: Cell; toward: Cell; terrain: Terrain }
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
  };

const STEPS: Record<Direction, Cell> = {
  north: { x: 0, y: -1 },
  south: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  west: { x: -1, y: 0 },
};

// Singleton, avoided on purpose: tests make as many games as they need. https://gameprogrammingpatterns.com/singleton.html
export function newGame(seed: number): GameState {
  return { seed, player: { x: 0, y: 0 }, inventory: {}, harvested: {} };
}

// The single way in. It updates the state it is given and returns the events.
export function apply(state: GameState, command: Command): GameEvent[] {
  switch (command.type) {
    case "move":
      return move(state, command.direction);
    case "harvest":
      return harvest(state);
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
  if (!isPassable(terrain, state.inventory)) {
    return [{ type: "blocked", at: from, toward: to, terrain }];
  }
  state.player.x = to.x;
  state.player.y = to.y;
  return [{ type: "moved", from, to }];
}

function harvest(state: GameState): GameEvent[] {
  const at = { ...state.player };
  const terrain = terrainAt(state.seed, at.x, at.y);
  if (DROPS[terrain].length === 0) {
    return [{ type: "harvestFailed", at, terrain, reason: "no-material" }];
  }
  const key = cellKey(at);
  if (state.harvested[key]) {
    return [{ type: "harvestFailed", at, terrain, reason: "depleted" }];
  }
  const gained = dropsAt(state.seed, at.x, at.y);
  addTo(state.inventory, gained);
  state.harvested[key] = true;
  return [{
    type: "harvested",
    at,
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
  return [{
    type: "crafted",
    recipe: id,
    consumed,
    produced,
    totals: totalsOf(state.inventory, { ...consumed, ...produced }),
  }];
}
