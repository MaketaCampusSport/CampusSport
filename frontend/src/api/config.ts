/** Prefixul API versionat (SDD cap. 6). */
export const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

/** `true` => serverul simulat (MSW) răspunde în locul API-ului real. */
export const USE_MOCKS: boolean = import.meta.env.VITE_USE_MOCKS === 'true';

/** Latență simulată pentru mock-uri (ms). */
export const MOCK_LATENCY: number = Number(import.meta.env.VITE_MOCK_LATENCY ?? 0);
