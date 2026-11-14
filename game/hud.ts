import {
  ENTRY_REQUIRES,
  type GameEvent,
  type GameState,
  type Inventory,
  MATERIALS,
  missingFor,
  RECIPE_IDS,
  RECIPES,
  stacksOf,
  terrainAt,
} from "../core/mod.ts";

function element(id: string): HTMLElement {
  return document.getElementById(id)!;
}

// "2 wood, 1 resin". Labels come from the material registry, so a new material
// needs no change here.
function format(items: Inventory): string {
  return stacksOf(items)
    .map(({ material, amount }) => `${amount} ${MATERIALS[material].label}`)
    .join(", ");
}

function describe(event: GameEvent): string {
  switch (event.type) {
    case "moved":
      return `moved to ${event.to.x}, ${event.to.y}`;
    case "blocked": {
      const needed = ENTRY_REQUIRES[event.terrain];
      if (needed !== null && needed !== "never") {
        return `You need a ${MATERIALS[needed].label} to enter.`;
      }
      return `blocked by ${event.terrain} at ${event.toward.x}, ${event.toward.y}`;
    }
    case "harvested":
      return `harvested ${
        format(event.gained)
      } at ${event.at.x}, ${event.at.y}`;
    case "harvestFailed":
      return event.reason === "depleted"
        ? `already harvested at ${event.at.x}, ${event.at.y}`
        : `nothing to harvest on ${event.terrain} at ${event.at.x}, ${event.at.y}`;
    case "crafted":
      return `crafted ${format(event.produced)} from ${format(event.consumed)}`;
    case "craftFailed":
      return `Can't craft ${event.recipe}: missing ${format(event.missing)}.`;
  }
}

// The readout, as ordinary page elements that CSS can style and that assistive
// tools can read. It changes only as events play.
export class Hud {
  private readonly seed: number;
  private readonly inventory: Inventory;

  constructor(state: GameState) {
    this.seed = state.seed;
    this.inventory = { ...state.inventory };
    this.showPosition(state.player.x, state.player.y);
    this.showInventory();
    this.showRecipes();
  }

  show(event: GameEvent) {
    element("live").textContent = describe(event);
    if (event.type === "moved") this.showPosition(event.to.x, event.to.y);
    // Any event that changes the inventory carries the resulting totals.
    if (event.type === "harvested" || event.type === "crafted") {
      this.syncInventory(event.totals);
    }
  }

  private syncInventory(totals: Inventory) {
    for (const { material, amount } of stacksOf(totals)) {
      if (amount > 0) this.inventory[material] = amount;
      else delete this.inventory[material];
    }
    this.showInventory();
    this.showRecipes();
  }

  // An ordered list, so its numerals are the keys: the controller binds 1 to the
  // first recipe, 2 to the second, and the list is in the same order. Whether a
  // recipe can be made now is said in words, not only by style.
  private showRecipes() {
    const items = RECIPE_IDS.map((id) => {
      const { inputs, outputs } = RECIPES[id];
      const ready = stacksOf(missingFor(this.inventory, inputs)).length === 0;
      const item = document.createElement("li");
      item.textContent = `${format(outputs)}: ${format(inputs)}${
        ready ? " (ready)" : ""
      }`;
      return item;
    });
    element("recipes").replaceChildren(...items);
  }

  private showInventory() {
    const entries = stacksOf(this.inventory)
      .map(({ material, amount }) => `${MATERIALS[material].label}: ${amount}`);
    element("inventory").textContent = entries.length > 0
      ? entries.join(", ")
      : "empty";
  }

  private showPosition(x: number, y: number) {
    element("position").textContent = `${x}, ${y}`;
    element("terrain").textContent = terrainAt(this.seed, x, y);
  }
}
