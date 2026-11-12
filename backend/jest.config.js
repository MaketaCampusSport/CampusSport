// Unit tests: every *.spec.ts under src/. E2E tests use test/jest-e2e.config.js.
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '.*\.spec\.ts$',
  transform: { '^.+\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts', '!src/worker.ts', '!src/database/migrations/**'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
};
