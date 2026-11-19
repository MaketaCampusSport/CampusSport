import { setupServer } from 'msw/node';
import { authHandlers } from './authHandlers';
import { handlers } from './handlers';
import { memberHandlers } from './memberHandlers';

/** Același server simulat, pentru testele Vitest. */
export const server = setupServer(...authHandlers, ...memberHandlers, ...handlers);
