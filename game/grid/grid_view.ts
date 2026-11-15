// The only folder allowed to import Phaser, and for one job: drawing the grid.
// Input, the HUD, sound, and the order of events all live outside it.
import Phaser from "phaser";
import type {
  Cell,
  GameEvent,
  GameState,
  Inventory,
  Terrain,
} from "../../core/mod.ts";
import {
  applyTotals,
  cellKey,
  darknessAt,
  lightRadius,
  regionOf,
  terrainAt,
} from "../../core/mod.ts";

export const CELL_SIZE = 32;
const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 600;
const WALK_MS = 120;
const BUMP_MS = 60;
const MARKER_COLOR = 0xf5e6a8;
const BUMP_COLOR = 0xe0533d;
const HARVESTED_COLOR = 0x8a5a2b;
const HARVESTED_INSET = 9;
const GLOW_COLOR = 0xffc861;
const GLOW_ALPHA = 0.75;
const GLOW_MS = 220;
const PULSE_MS = 120;
const PULSE_SCALE = 1.5;
const SHADE_COLOR = 0x000000;
// How dark the unlit cells get at full night. At 1 they cannot be seen at all.
const NIGHT_ALPHA = 1;
// Darkness is redrawn only when it has changed by this fraction of a step, so
// the many cells are not repainted on frames where the sky looks the same.
const SHADE_STEPS = 50;
// Enough cave cells to fill the view, plus a margin for winding passages.
const CAVE_VIEW_LIMIT = 2500;

const TERRAIN_COLORS: Record<Terrain, number> = {
  grass: 0x5d9e4a,
  forest: 0x2f6b3a,
  water: 0x2d5f9e,
  cave: 0x6e6a66,
};

// Enough cells to cover the view, plus a margin so that the camera can lag behind
// the player without showing an unpainted edge.
const CELLS_ACROSS = 16;
const CELLS_DOWN = 13;

function cellCenter({ x, y }: Cell): Cell {
  return {
    x: x * CELL_SIZE + CELL_SIZE / 2,
    y: y * CELL_SIZE + CELL_SIZE / 2,
  };
}

// One output of the presenter. It shows events; it decides nothing.
// Humble Object: http://xunitpatterns.com/Humble%20Object.html
export class GridView extends Phaser.Scene {
  private readonly seed: number;
  private readonly start: Cell;
  private readonly harvested: Set<string>;
  // What the player has seen so far, kept as events play so that the view never
  // lights or darkens ahead of the walk the player is watching.
  private readonly inventory: Inventory;
  private player: Cell;
  private ground!: Phaser.GameObjects.Graphics;
  private shade!: Phaser.GameObjects.Graphics;
  private marker!: Phaser.GameObjects.Arc;
  private darkness = 0;
  private clockStart: number | null = null;

  constructor(state: GameState) {
    super("grid");
    this.seed = state.seed;
    this.start = { ...state.player };
    this.player = { ...state.player };
    this.inventory = { ...state.inventory };
    this.harvested = new Set(Object.keys(state.harvested));
  }

  create() {
    this.ground = this.add.graphics();
    // Above the ground and below the marker, so the player is never shaded.
    this.shade = this.add.graphics();
    const { x, y } = cellCenter(this.start);
    this.marker = this.add.circle(x, y, CELL_SIZE * 0.35, MARKER_COLOR);
    this.cameras.main.startFollow(this.marker, true, 0.2, 0.2);
    this.drawCellsAround(this.start);
    this.drawShade();
    this.fitToDisplay();
  }

  // Phaser calls this every frame. The day cycle runs on the time it reports,
  // counted from the first frame, so a game always opens at the start of a day.
  override update(time: number) {
    this.clockStart ??= time;
    const darkness = darknessAt(time - this.clockStart);
    const step = (value: number) => Math.round(value * SHADE_STEPS);
    if (step(darkness) === step(this.darkness)) return;
    this.darkness = darkness;
    this.drawShade();
  }

  // Phaser has no device-pixel setting of its own. So the canvas backing store is
  // CSS size times devicePixelRatio, the CSS size stays put, and a camera zoom lets
  // all drawing stay in logical pixels. The media query fires when the ratio changes:
  // a move to another monitor, or browser zoom. The view's CSS size is fixed, so plain
  // window resizes need nothing here.
  private fitToDisplay() {
    const ratio = globalThis.devicePixelRatio || 1;
    this.scale.resize(
      Math.round(VIEW_WIDTH * ratio),
      Math.round(VIEW_HEIGHT * ratio),
    );
    this.scale.canvas.style.width = `${VIEW_WIDTH}px`;
    this.scale.canvas.style.height = `${VIEW_HEIGHT}px`;
    this.cameras.main.setZoom(ratio);
    matchMedia(`(resolution: ${ratio}dppx)`).addEventListener(
      "change",
      () => this.fitToDisplay(),
      { once: true },
    );
  }

  show(event: GameEvent): Promise<void> {
    switch (event.type) {
      case "moved":
        this.player = { ...event.to };
        this.drawCellsAround(event.to);
        this.drawShade();
        return this.walk(event.to);
      case "blocked":
        return this.bump(event.at, event.toward);
      case "harvested":
        applyTotals(this.inventory, event.totals);
        this.harvested.add(cellKey(event.at));
        this.drawCellsAround(event.at);
        return this.glow(event.at);
      case "harvestFailed":
        return Promise.resolve();
      case "crafted":
        // A torch changes how far the player sees at night.
        applyTotals(this.inventory, event.totals);
        this.drawShade();
        return this.pulse();
      case "craftFailed":
        return Promise.resolve();
      case "rescued":
        // The HUD shows the ending. The map stays as it was.
        return Promise.resolve();
      default:
        // A new event type fails to type-check here until it has a presentation.
        event satisfies never;
        return Promise.resolve();
    }
  }

  // The marker swells and settles: something was made.
  private pulse(): Promise<void> {
    return new Promise((done) => {
      this.tweens.add({
        targets: this.marker,
        scale: PULSE_SCALE,
        duration: PULSE_MS,
        yoyo: true,
        onComplete: () => done(),
      });
    });
  }

  private glow(at: Cell): Promise<void> {
    const light = this.add
      .rectangle(
        at.x * CELL_SIZE,
        at.y * CELL_SIZE,
        CELL_SIZE - 1,
        CELL_SIZE - 1,
        GLOW_COLOR,
        GLOW_ALPHA,
      )
      .setOrigin(0);
    return new Promise((done) => {
      this.tweens.add({
        targets: light,
        alpha: 0,
        duration: GLOW_MS,
        onComplete: () => {
          light.destroy();
          done();
        },
      });
    });
  }

  private walk(to: Cell): Promise<void> {
    return new Promise((done) => {
      this.tweens.add({
        targets: this.marker,
        ...cellCenter(to),
        duration: WALK_MS,
        onComplete: () => done(),
      });
    });
  }

  // Lurch part of the way toward the blocked cell, flash, and come back.
  private bump(at: Cell, toward: Cell): Promise<void> {
    const start = cellCenter(at);
    const target = cellCenter(toward);
    this.marker.setFillStyle(BUMP_COLOR);
    return new Promise((done) => {
      this.tweens.add({
        targets: this.marker,
        x: start.x + (target.x - start.x) * 0.3,
        y: start.y + (target.y - start.y) * 0.3,
        duration: BUMP_MS,
        yoyo: true,
        onComplete: () => {
          this.marker.setFillStyle(MARKER_COLOR);
          done();
        },
      });
    });
  }

  // Darkens the cells the player cannot see, over the same stretch of the map as
  // the ground. In a cave, everything outside that cave goes fully dark and the
  // cave itself stays in view. Outside, nothing is dark by day; at night only the
  // light a torch throws shows, or just the player's own cell without one. The
  // night fades in and out with the day cycle.
  private drawShade() {
    this.shade.clear();
    const { x: px, y: py } = this.player;
    const cave = terrainAt(this.seed, px, py) === "cave"
      ? new Set(regionOf(this.seed, px, py, CAVE_VIEW_LIMIT).map(cellKey))
      : null;
    const reach = lightRadius(this.inventory);
    for (let y = py - CELLS_DOWN; y <= py + CELLS_DOWN; y++) {
      for (let x = px - CELLS_ACROSS; x <= px + CELLS_ACROSS; x++) {
        let alpha: number;
        if (cave) {
          alpha = cave.has(cellKey({ x, y })) ? 0 : 1;
        } else {
          const lit = Math.max(Math.abs(x - px), Math.abs(y - py)) <= reach;
          alpha = lit ? 0 : this.darkness * NIGHT_ALPHA;
        }
        if (alpha <= 0) continue;
        this.shade.fillStyle(SHADE_COLOR, alpha);
        this.shade.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }
  }

  // Paint only what is near the camera. Asking the core again costs little, and
  // the world itself is never stored.
  private drawCellsAround({ x: centerX, y: centerY }: Cell) {
    this.ground.clear();
    for (let y = centerY - CELLS_DOWN; y <= centerY + CELLS_DOWN; y++) {
      for (let x = centerX - CELLS_ACROSS; x <= centerX + CELLS_ACROSS; x++) {
        this.ground.fillStyle(TERRAIN_COLORS[terrainAt(this.seed, x, y)]);
        this.ground.fillRect(
          x * CELL_SIZE,
          y * CELL_SIZE,
          CELL_SIZE - 1,
          CELL_SIZE - 1,
        );
        if (!this.harvested.has(cellKey({ x, y }))) continue;
        this.ground.fillStyle(HARVESTED_COLOR);
        this.ground.fillRect(
          x * CELL_SIZE + HARVESTED_INSET,
          y * CELL_SIZE + HARVESTED_INSET,
          CELL_SIZE - 1 - 2 * HARVESTED_INSET,
          CELL_SIZE - 1 - 2 * HARVESTED_INSET,
        );
      }
    }
  }
}

// Resolves once Phaser has booted and the scene exists. Phaser's input and audio
// are off: this project only asks it to draw.
export function startGridView(
  parent: HTMLElement,
  state: GameState,
): Promise<GridView> {
  return new Promise((ready) => {
    const view = new GridView(state);
    new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: VIEW_WIDTH,
      height: VIEW_HEIGHT,
      backgroundColor: "#14161a",
      banner: false,
      audio: { noAudio: true },
      input: { keyboard: false, mouse: false, touch: false, gamepad: false },
      scene: view,
      callbacks: {
        postBoot: () => ready(view),
      },
    });
  });
}
