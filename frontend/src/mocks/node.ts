import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/** Același server simulat, pentru testele Vitest. */
export const server = setupServer(...handlers);
