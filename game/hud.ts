import {
  applyTotals,
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
import { keyForRecipe } from "./keys.ts";

function element(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function tag<K extends keyof HTMLElementTagNameMap>(
  name: K,
  ...children: (string | Node)[]
): HTMLElementTagNameMap[K] {
  const created = document.createElement(name);
  created.append(...children);
  return created;
}

// "2 wood, 1 resin". Labels come from the material registry, so a new material
// needs no change here.
function format(items: Inventory): string {
  return stacksOf(items)
    .map(({ material, amount }) => `${amount} ${MATERIALS[material].label}`)
    .join(", ");
}

// The name of what a recipe makes: "torch", or "arrow x2" when it makes several.
function nameOf(items: Inventory): string {
  return stacksOf(items)
    .map(({ material, amount }) =>
      amount > 1
        ? `${MATERIALS[material].label} x${amount}`
        : MATERIALS[material].label
    )
    .join(", ");
}

function describeHarvestFailure(
  event: Extract<GameEvent, { type: "harvestFailed" }>,
): string {
  const where = `${event.at.x}, ${event.at.y}`;
  switch (event.reason) {
    case "depleted":
      return `already harvested at ${where}`;
    case "out-of-reach":
      return `no water within reach at ${where}`;
    case "no-material":
      return `nothing to harvest on ${event.terrain} at ${where}`;
  }
}

function describe(event: GameEvent): string {
  switch (event.type) {
    case "moved":
      return `moved to ${event.to.x}, ${event.to.y}`;
    case "blocked":
      if (event.needs !== null) {
        return `You need a ${MATERIALS[event.needs].label} to enter.`;
      }
      return `blocked by ${event.terrain} at ${event.toward.x}, ${event.toward.y}`;
    case "harvested":
      return `harvested ${
        format(event.gained)
      } at ${event.at.x}, ${event.at.y}`;
    case "harvestFailed":
      return describeHarvestFailure(event);
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
      applyTotals(this.inventory, event.totals);
      this.showInventory();
      this.showRecipes();
    }
  }

  // One row per material, as table cells so that the names and the counts each
  // line up in a column.
  private showInventory() {
    const rows = stacksOf(this.inventory).map(({ material, amount }) =>
      tag("tr", tag("td", MATERIALS[material].label), tag("td", String(amount)))
    );
    if (rows.length === 0) {
      const empty = tag("td", "empty");
      empty.colSpan = 2;
      rows.push(tag("tr", empty));
    }
    element("inventory").replaceChildren(...rows);
  }

  // One row per recipe: its key and what it makes, the materials it needs listed
  // one under another, and whether the player has them all. The status is said in
  // words, not only by style.
  private showRecipes() {
    const rows = RECIPE_IDS.map((id) => {
      const { inputs, outputs } = RECIPES[id];
      const ready = stacksOf(missingFor(this.inventory, inputs)).length === 0;
      const needs = stacksOf(inputs).map(({ material, amount }) =>
        tag("li", `${amount} ${MATERIALS[material].label}`)
      );
      return tag(
        "tr",
        tag("td", `[${keyForRecipe(id) ?? "-"}] ${nameOf(outputs)}`),
        tag("td", tag("ul", ...needs)),
        tag("td", ready ? "(ready)" : "(not ready)"),
      );
    });
    element("recipes").replaceChildren(...rows);
  }

  private showPosition(x: number, y: number) {
    element("position").textContent = `${x}, ${y}`;
    element("terrain").textContent = terrainAt(this.seed, x, y);
  }
}
