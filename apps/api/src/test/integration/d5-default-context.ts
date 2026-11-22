import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { setMissingContextWriteTenantForTesting } from "../../prisma/tenant-scope.extension";

/**
 * Only for `jest.integration-d5.config.ts` (docs/SAAS_CUTOVER_RUNBOOK.md C.2).
 * On a contracted database the `tenantId` default raises, so the suite's own
 * fixtures (prisma.user.create with no academy) are stamped with Nexa's, as the
 * old default did. See `setMissingContextWriteTenantForTesting`.
 */
setMissingContextWriteTenantForTesting(DEFAULT_TENANT_ID);
