// Day, night, and light. Time is an input here, never read from a clock: the
// caller says how many milliseconds have passed, so the same time always gives
// the same darkness and the core stays free of any clock.

import { type Inventory, stacksOf } from "./inventory.ts";
import type { Material } from "./materials.ts";

export const DAY_MS = 60_000;
export const NIGHT_MS = 60_000;
// The last stretch of the day fades into night, and the last stretch of the
// night fades into day. Both are part of their half, so each half lasts a minute.
export const TRANSITION_MS = 5_000;

const CYCLE_MS = DAY_MS + NIGHT_MS;

// 0 is full daylight, 1 is full night. The game starts at the beginning of a day.
export function darknessAt(elapsedMs: number): number {
  const t = ((elapsedMs % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
  if (t < DAY_MS - TRANSITION_MS) return 0;
  if (t < DAY_MS) return (t - (DAY_MS - TRANSITION_MS)) / TRANSITION_MS;
  if (t < CYCLE_MS - TRANSITION_MS) return 1;
  return 1 - (t - (CYCLE_MS - TRANSITION_MS)) / TRANSITION_MS;
}

// How far around the player a held material lights up at night, in cells. A
// radius of 3 lights a 7 by 7 square. A new light source is one entry here.
export const LIGHT_RADIUS: Partial<Record<Material, number>> = {
  torch: 3,
};

// The widest light the player holds. Zero means only the player's own cell.
export function lightRadius(held: Inventory): number {
  return Math.max(
    0,
    ...stacksOf(held).map(({ material, amount }) =>
      amount > 0 ? LIGHT_RADIUS[material] ?? 0 : 0
    ),
  );
}
