import type { Config } from 'jest';

// Specs that need a running AI runtime (`*.runtime-spec.ts`). Run only by the
// `ai` CI job, which starts Uvicorn on 127.0.0.1 first; see
// docs/ai/architecture/PHASE1_SPEC.md §8. Never part of `npm test` or the
// integration suite.
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.runtime-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testTimeout: 20_000,
};

export default config;
