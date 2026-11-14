// Inventory arithmetic in one place, so harvesting, crafting, and any later rule
// (trading, dropping, capacity) share it instead of repeating `?? 0` and
// delete-at-zero logic.

import type { Material } from "./materials.ts";

// Plain data that survives JSON. A material that is absent counts as zero, and
// helpers here never leave a zero behind: `{ wood: 0 }` is stored as `{}`.
export type Inventory = Partial<Record<Material, number>>;

export type Stack = { material: Material; amount: number };

export function countOf(inventory: Inventory, material: Material): number {
  return inventory[material] ?? 0;
}

export function stacksOf(inventory: Inventory): Stack[] {
  return (Object.entries(inventory) as [Material, number][]).map((
    [material, amount],
  ) => ({ material, amount }));
}

export function isEmpty(inventory: Inventory): boolean {
  return stacksOf(inventory).every(({ amount }) => amount <= 0);
}

// What is still lacking: the amounts `held` falls short of `needed` by.
export function missingFor(held: Inventory, needed: Inventory): Inventory {
  const missing: Inventory = {};
  for (const { material, amount } of stacksOf(needed)) {
    const short = amount - countOf(held, material);
    if (short > 0) missing[material] = short;
  }
  return missing;
}

// Mutates `inventory`.
export function addTo(inventory: Inventory, items: Inventory): void {
  for (const { material, amount } of stacksOf(items)) {
    inventory[material] = countOf(inventory, material) + amount;
  }
}

// Mutates `inventory`. Callers check missingFor() first.
export function removeFrom(inventory: Inventory, items: Inventory): void {
  for (const { material, amount } of stacksOf(items)) {
    const remaining = countOf(inventory, material) - amount;
    if (remaining > 0) inventory[material] = remaining;
    else delete inventory[material];
  }
}

// The current count of every material named in `items`, zeros included. Events
// carry this so that a listener can sync its own copy without redoing the math.
export function totalsOf(inventory: Inventory, items: Inventory): Inventory {
  const totals: Inventory = {};
  for (const { material } of stacksOf(items)) {
    totals[material] = countOf(inventory, material);
  }
  return totals;
}

// Mutates `inventory` to match `totals`, as carried by events that change it.
// A total of zero removes the material, so no zero is ever stored.
export function applyTotals(inventory: Inventory, totals: Inventory): void {
  for (const { material, amount } of stacksOf(totals)) {
    if (amount > 0) inventory[material] = amount;
    else delete inventory[material];
  }
}
