import type { Config } from 'jest';
import base from './jest.integration.config';

// The integration suite against a database with the §D5 contract applied
// (docs/SAAS_CUTOVER_RUNBOOK.md C.2). Test bodies run in
// Nexa's context so fixtures pass; whatever still fails writes without an academy.
const config: Config = {
  ...base,
  setupFilesAfterEnv: ['<rootDir>/test/integration/d5-default-context.ts'],
};

export default config;
