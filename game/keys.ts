import { RECIPE_IDS, type RecipeId } from "../core/mod.ts";

// Number keys follow the recipe table: 1 is the first recipe, 2 the second, and
// so on. A new recipe gets its key without touching the controller or the HUD,
// which both read it from here.
export const RECIPE_KEYS = new Map<string, RecipeId>(
  RECIPE_IDS.slice(0, 9).map((id, index) => [String(index + 1), id]),
);

export function keyForRecipe(recipe: RecipeId): string | undefined {
  for (const [key, id] of RECIPE_KEYS) if (id === recipe) return key;
}
