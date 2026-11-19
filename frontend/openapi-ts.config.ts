import { defineConfig } from '@hey-api/openapi-ts';

// Clientul API se generează din specificația OpenAPI a serverului (SDD 6, NFR-13).
// Când backend-ul publică `openapi/openapi.yaml`, rulează: npm run api:generate
// Vezi openapi/README.md pentru pașii de integrare.
export default defineConfig({
  input: './openapi/openapi.yaml',
  output: 'src/api/generated',
});
