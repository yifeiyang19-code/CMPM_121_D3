// Recipes are data, not code: adding one is adding an entry here. The craft rule
// in rules.ts reads this table and has no idea which recipes exist.
// Data-Driven Design: https://gameprogrammingpatterns.com/type-object.html

import type { Inventory } from "./inventory.ts";

export type Recipe = { inputs: Inventory; outputs: Inventory };

export const RECIPES = {
  // Unlocks rock, and through it ore and coal.
  torch: {
    inputs: { wood: 1, fiber: 1, resin: 1 },
    outputs: { torch: 1 },
  },
} satisfies Record<string, Recipe>;

// Derived from the table, so a new entry is a valid recipe id at once.
export type RecipeId = keyof typeof RECIPES;

// In declaration order. Input adapters can bind keys or menu slots to this.
export const RECIPE_IDS = Object.keys(RECIPES) as RecipeId[];
