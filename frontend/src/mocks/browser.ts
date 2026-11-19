import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

/** Pornește serverul simulat în browser (Service Worker MSW). */
export async function startMockWorker(): Promise<void> {
  const worker = setupWorker(...handlers);
  await worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    quiet: true,
  });
  console.info('%cCampusSport · mod demo: răspunsurile vin de la serverul simulat (MSW).', 'color:#1F4BFF;font-weight:bold');
}
