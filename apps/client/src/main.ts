import './style.css';
import { pickBackend, type Backend } from './net.js';
import { renderAuth, renderCharSelect } from './ui/screens.js';
import { GameUI } from './ui/hud.js';
import { t, getLang, setLang } from './i18n.js';
import { h, clear } from './ui/dom.js';

const root = document.getElementById('app')!;
setLang(getLang());

function supported(): boolean {
  const c = document.createElement('canvas');
  return !!c.getContext && !!c.getContext('2d') && typeof WebSocket !== 'undefined' && typeof requestAnimationFrame === 'function';
}

let backend: Backend;
let game: GameUI | null = null;

function toSelect() {
  game?.destroy();
  game = null;
  void renderCharSelect(root, backend, (id) => {
    game = new GameUI(root, backend, id, toSelect);
    game.start();
  }, toAuth);
}
function toAuth() { renderAuth(root, backend, toSelect); }

async function boot() {
  if (!supported()) { clear(root).append(h('div', { class: 'screen center' }, h('p', { class: 'warn' }, t('unsupported')))); return; }
  try {
    backend = await pickBackend();
  } catch (e) {
    clear(root).append(h('div', { class: 'screen center' }, h('p', { class: 'warn' }, 'Failed to start: ' + (e as Error).message), h('button', { class: 'btn', onclick: () => location.reload() }, 'Retry')));
    return;
  }
  if (backend.hasSession()) toSelect(); else toAuth();
}
addEventListener('error', (e) => console.error('[astra]', e.message));
void boot();
