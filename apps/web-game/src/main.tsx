import Phaser from 'phaser';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WorldScene } from './game/WorldScene';
import { pushLog, runtimeErrors } from './game/bridge';
import { App } from './ui/App';
import './ui/styles.css';

window.addEventListener('error', (e) => {
  runtimeErrors.count++;
  runtimeErrors.last = String(e.message);
  pushLog('system', `Runtime error: ${e.message}`, 'bad');
});
window.addEventListener('unhandledrejection', (e) => {
  runtimeErrors.count++;
  runtimeErrors.last = String(e.reason);
  pushLog('system', `Unhandled rejection: ${String(e.reason)}`, 'bad');
});

const game = new Phaser.Game({
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
  scene: [WorldScene],
});

(window as unknown as { __PHASER_GAME__: Phaser.Game }).__PHASER_GAME__ = game;

const hudRoot = document.getElementById('hud-root');
if (hudRoot)
  createRoot(hudRoot).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
