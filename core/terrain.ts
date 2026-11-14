// The world is a pure function of a seed and coordinates. Nothing here is stored,
// so the world can be effectively unbounded while saved state stays small.

import { countOf, type Inventory } from "./inventory.ts";
import type { Material } from "./materials.ts";

export type Terrain = "grass" | "forest" | "water" | "rock";

// One line of a terrain's loot table. A chance of 1 always drops; anything lower
// is a rare drop, decided by the seed and the cell so the world stays a pure
// function and a replay finds the same loot.
export type Drop = { material: Material; amount: number; chance: number };

export const DROPS: Record<Terrain, Drop[]> = {
  grass: [
    { material: "fiber", amount: 1, chance: 1 },
    { material: "flint", amount: 1, chance: 0.2 },
  ],
  forest: [
    { material: "wood", amount: 1, chance: 1 },
    { material: "resin", amount: 1, chance: 0.35 },
  ],
  // Water holds nothing until a way onto it exists: harvesting happens on the
  // cell the player stands on, and water is never passable.
  water: [],
  rock: [
    { material: "ore", amount: 1, chance: 1 },
    { material: "coal", amount: 1, chance: 0.25 },
  ],
};

export const ENTRY_REQUIRES: Record<Terrain, Material | null | "never"> = {
  grass: null,
  forest: null,
  water: "never",
  rock: "torch",
};

export function terrainAt(seed: number, x: number, y: number): Terrain {
  const raw = 0.65 * noise(seed, x, y, 9) + 0.35 * noise(seed + 1, x, y, 3);
  // Every game starts at the origin, so flatten the land there. Otherwise some
  // seeds would start inside a lake or walled into a pocket.
  const height = 0.5 + (raw - 0.5) * Math.min(1, Math.hypot(x, y) / 10);
  if (height < 0.3) return "water";
  if (height > 0.7) return "rock";
  return noise(seed + 2, x, y, 6) < 0.45 ? "forest" : "grass";
}

// What harvesting this cell would give. Each table line rolls on its own, keyed by
// its position in the table, so adding a line never reshuffles the others' rolls.
export function dropsAt(seed: number, x: number, y: number): Inventory {
  const found: Inventory = {};
  DROPS[terrainAt(seed, x, y)].forEach((drop, line) => {
    if (dropRoll(seed, x, y, line) < drop.chance) {
      found[drop.material] = countOf(found, drop.material) + drop.amount;
    }
  });
  return found;
}

export function isPassable(terrain: Terrain, held: Inventory = {}): boolean {
  const needed = ENTRY_REQUIRES[terrain];
  if (needed === null) return true;
  if (needed === "never") return false;
  return countOf(held, needed) > 0;
}

// A salt keeps loot rolls apart from the terrain noise that shares gridValue().
function dropRoll(seed: number, x: number, y: number, line: number): number {
  return gridValue(seed ^ (0x5bd1e995 + line), x, y);
}

// Value noise: random numbers at coarse grid points, blended between them, so
// that terrain forms regions instead of static.
function noise(seed: number, x: number, y: number, scale: number): number {
  const left = Math.floor(x / scale);
  const top = Math.floor(y / scale);
  const blendX = smooth(x / scale - left);
  const blendY = smooth(y / scale - top);
  return mix(
    mix(gridValue(seed, left, top), gridValue(seed, left + 1, top), blendX),
    mix(
      gridValue(seed, left, top + 1),
      gridValue(seed, left + 1, top + 1),
      blendX,
    ),
    blendY,
  );
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// A hash, not a generator: the same inputs give the same number in [0, 1), with
// no memory of earlier calls.
function gridValue(seed: number, x: number, y: number): number {
  let hash = Math.imul(seed, 0x9e3779b1) ^ Math.imul(x, 0x85ebca6b) ^
    Math.imul(y, 0xc2b2ae35);
  hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d);
  hash = Math.imul(hash ^ (hash >>> 12), 0x297a2d39);
  return ((hash ^ (hash >>> 15)) >>> 0) / 2 ** 32;
}
