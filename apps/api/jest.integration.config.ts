import type { Config } from 'jest';

// Real-Postgres tests (`*.int-spec.ts`). Needs INTEGRATION_DATABASE_URL; see
// src/test/integration/global-setup.ts. Run with `npm run test:integration`.
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.int-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  globalSetup: '<rootDir>/test/integration/global-setup.ts',
  setupFiles: ['<rootDir>/test/integration/env.ts'],
  // Suites share one database and truncate it between tests.
  maxWorkers: 1,
  testTimeout: 30_000,
};

export default config;
