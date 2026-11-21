import Phaser from 'phaser';
import type { WorldSource } from '../core/worldSource';
import { hudStore, INITIAL_HUD, logStore } from './bridge';
import { WorldScene } from './WorldScene';

let game: Phaser.Game | null = null;

/** Boots a fresh Phaser game rendering the given world (offline sandbox or online mirror). */
export function startGame(world: WorldSource): void {
  stopGame();
  logStore.set([]);
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-root',
    backgroundColor: '#0d0814',
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    input: { keyboard: false, mouse: true, touch: true },
    audio: { noAudio: true }, // audio arrives later and must start only after a user gesture
    fps: { target: 60 },
    banner: false,
  });
  game.scene.add('world', WorldScene, true, { world });
  (window as unknown as { __PHASER_GAME__: Phaser.Game | null }).__PHASER_GAME__ = game;
}

export function stopGame(): void {
  if (!game) return;
  game.destroy(true);
  game = null;
  hudStore.set(INITIAL_HUD);
  (window as unknown as { __PHASER_GAME__: Phaser.Game | null }).__PHASER_GAME__ = null;
}
