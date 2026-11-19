import { setupWorker } from 'msw/browser';
import { authHandlers } from './authHandlers';
import { handlers } from './handlers';
import { memberHandlers } from './memberHandlers';
import { restoreSession } from './session';

/** Pornește serverul simulat în browser (Service Worker MSW). */
export async function startMockWorker(): Promise<void> {
  restoreSession();
  const worker = setupWorker(...authHandlers, ...memberHandlers, ...handlers);
  await worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    quiet: true,
  });
  console.info('%cCampusSport · mod demo: răspunsurile vin de la serverul simulat (MSW).', 'color:#1F4BFF;font-weight:bold');
}
