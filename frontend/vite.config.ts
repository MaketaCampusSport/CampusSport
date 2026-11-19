/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// Vite 8 (SDD – „Tehnologii front-end”). Ținta de build acoperă Safari 16 / iOS 16+ (NFR-15).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const useMocks = env.VITE_USE_MOCKS === 'true';

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      // Fără mock-uri, cererile /api/* merg către serverul NestJS.
      proxy: useMocks
        ? undefined
        : {
            '/api': {
              target: env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
              changeOrigin: true,
            },
          },
    },
    build: {
      target: ['es2022', 'safari16', 'chrome100', 'firefox100'],
      sourcemap: true,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      css: false,
      setupFiles: ['./src/test/setup.ts'],
      env: {
        VITE_API_BASE_URL: 'http://localhost/api/v1',
        VITE_USE_MOCKS: 'false',
        VITE_MOCK_LATENCY: '0',
      },
    },
  };
});
