import {
  type GameEvent,
  type GameState,
  type Inventory,
  type Material,
  terrainAt,
} from "../core/mod.ts";

function element(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function describe(event: GameEvent): string {
  switch (event.type) {
    case "moved":
      return `moved to ${event.to.x}, ${event.to.y}`;
    case "blocked":
      return `blocked by ${event.terrain} at ${event.toward.x}, ${event.toward.y}`;
    case "harvested":
      return `harvested ${event.amount} ${event.material} at ${event.at.x}, ${event.at.y}`;
    case "harvestFailed":
      return event.reason === "depleted"
        ? `already harvested at ${event.at.x}, ${event.at.y}`
        : `nothing to harvest on ${event.terrain} at ${event.at.x}, ${event.at.y}`;
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
  }

  show(event: GameEvent) {
    element("live").textContent = describe(event);
    if (event.type === "moved") this.showPosition(event.to.x, event.to.y);
    if (event.type === "harvested") {
      this.inventory[event.material] = event.total;
      this.showInventory();
    }
  }

  private showInventory() {
    const entries = (Object.entries(this.inventory) as [Material, number][])
      .map(([material, count]) => `${material}: ${count}`);
    element("inventory").textContent = entries.length > 0
      ? entries.join(", ")
      : "empty";
  }

  private showPosition(x: number, y: number) {
    element("position").textContent = `${x}, ${y}`;
    element("terrain").textContent = terrainAt(this.seed, x, y);
  }
}
