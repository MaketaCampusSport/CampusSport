/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `true` => serverul simulat (MSW) răspunde în locul API-ului real. */
  readonly VITE_USE_MOCKS?: string;
  /** Prefixul API; implicit `/api/v1`. */
  readonly VITE_API_BASE_URL?: string;
  /** Latență simulată (ms) pentru răspunsurile mock. */
  readonly VITE_MOCK_LATENCY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
