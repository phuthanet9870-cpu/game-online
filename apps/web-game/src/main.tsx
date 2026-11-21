import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { pushLog, runtimeErrors } from './game/bridge';
import { Root } from './ui/Root';
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

const hudRoot = document.getElementById('hud-root');
if (hudRoot)
  createRoot(hudRoot).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
