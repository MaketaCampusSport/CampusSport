import { defineConfig } from '@hey-api/openapi-ts';

// Tipurile API se generează din contractul serverului (assets/livrabil05/openapi.yaml, SDD 6, NFR-13).
// După orice schimbare a specificației: npm run api:generate (rezultatul se versionează).
export default defineConfig({
  input: '../assets/livrabil05/openapi.yaml',
  output: 'src/api/generated',
  plugins: ['@hey-api/typescript'],
});
