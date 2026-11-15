import { assertEquals } from "@std/assert";
import { apply, type Command, newGame } from "./mod.ts";

const SEED = 121;

Deno.test("a signal fire cannot be crafted without its materials", () => {
  const state = newGame(SEED);
  state.inventory = { wood: 1 };
  const snapshot = JSON.parse(JSON.stringify(state));

  const events = apply(state, { type: "craft", recipe: "signal_fire" });

  assertEquals(state, snapshot);
  assertEquals(state.rescued, false);
  assertEquals(events, [{
    type: "craftFailed",
    recipe: "signal_fire",
    reason: "missing-materials",
    missing: { coal: 1 },
  }]);
});

Deno.test("crafting a signal fire ends the game once, after the craft", () => {
  const state = newGame(SEED);
  state.inventory = { wood: 1, coal: 1, torch: 1 };

  const events = apply(state, { type: "craft", recipe: "signal_fire" });

  assertEquals(events, [
    {
      type: "crafted",
      recipe: "signal_fire",
      consumed: { wood: 1, coal: 1 },
      produced: { signal_fire: 1 },
      totals: { wood: 0, coal: 0, signal_fire: 1 },
    },
    { type: "rescued" },
  ]);
  assertEquals(state.inventory, { torch: 1, signal_fire: 1 });
  assertEquals(state.rescued, true);
});

Deno.test("after rescue, commands change nothing and report nothing", () => {
  const state = newGame(SEED);
  state.inventory = {
    wood: 3,
    coal: 2,
    fiber: 1,
    resin: 1,
  };
  apply(state, { type: "craft", recipe: "signal_fire" });
  const commands: Command[] = [
    { type: "move", direction: "west" },
    { type: "harvest" },
    { type: "fish" },
    { type: "craft", recipe: "torch" },
    { type: "craft", recipe: "signal_fire" },
  ];

  for (const command of commands) {
    const snapshot = JSON.parse(JSON.stringify(state));
    assertEquals(apply(state, command), [], command.type);
    assertEquals(state, snapshot, command.type);
  }
});
