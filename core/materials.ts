// The one place a material is declared. The Material type is derived from this
// registry, so adding a material is one entry here and the compiler then offers
// it everywhere else (drops, recipes, inventory) without further type edits.

export type MaterialInfo = { label: string };

export const MATERIALS = {
  wood: { label: "wood" },
  fiber: { label: "fiber" },
  flint: { label: "flint" },
  resin: { label: "resin" },
  coal: { label: "coal" },
  ore: { label: "ore" },
  fish: { label: "fish" },
  torch: { label: "torch" },
  lantern: { label: "lantern" },
  signal_fire: { label: "Signal Fire" },
} satisfies Record<string, MaterialInfo>;

export type Material = keyof typeof MATERIALS;
