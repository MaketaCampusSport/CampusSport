import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/barlow/latin-ext-400.css';
import '@fontsource/barlow/latin-ext-500.css';
import '@fontsource/barlow/latin-ext-600.css';
import '@fontsource/barlow/latin-ext-700.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource/barlow-condensed/latin-ext-700.css';
import '@fontsource/barlow-condensed/latin-ext-800.css';
import './styles/index.css';
import './i18n';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { setSessionListener, setUnauthorizedHandler } from './api/http';
import App from './app/App';
import { useSession } from './auth/sessionStore';
import { initTheme } from './stores/uiStore';

initTheme();

// 401 după refresh eșuat => sesiunea a expirat; gărzile de rută trimit la ecranul de login potrivit.
setUnauthorizedHandler(() => useSession.getState().markExpired());
// Fiecare refresh reușit (la pornire sau după un 401) actualizează utilizatorul curent.
setSessionListener((session) => {
  if (session) useSession.getState().signIn(session);
});

async function enableMocking() {
  const { USE_MOCKS } = await import('./api/config');
  if (!USE_MOCKS) return;
  const { startMockWorker } = await import('./mocks/browser');
  return startMockWorker();
}

void enableMocking().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
