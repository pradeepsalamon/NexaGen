import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { reportTenantGap } from "./tenant-audit";
import { getTenantContext } from "./tenant-context";

/**
 * Called by `authenticateUser` once the user and session are loaded
 * (docs/SAAS_MULTI_TENANCY.md §B step 4). Fills an empty context from the
 * user's academy and records who is acting. Audit mode: a mismatch between
 * host, user and session is logged, not refused; Phase 3 makes it a 401.
 */
export function bindAuthenticatedUser(
  user: { id: string; role: string; tenantId: string | null },
  session?: { tenantId: string | null } | null
): void {
  const userTenantId = user.tenantId ?? DEFAULT_TENANT_ID;
  const context = getTenantContext();
  const at = context?.label ?? "outside a request";
  const scope = !context ? "background" : context.origin === "webhook" ? "webhook" : "request";
  if (context) {
    if (!context.tenantId) {
      context.tenantId = userTenantId;
      context.source = "user";
    } else if (context.tenantId !== userTenantId) {
      reportTenantGap(
        {
          at,
          detail: { contextTenantId: context.tenantId, host: context.host, userTenantId },
          kind: "user_mismatch",
          scope
        },
        `user_mismatch|${at}|${context.tenantId}|${userTenantId}`
      );
    }
    context.userId = user.id;
    context.role = user.role;
  }
  if (session && (session.tenantId ?? DEFAULT_TENANT_ID) !== userTenantId) {
    reportTenantGap(
      { at, detail: { sessionTenantId: session.tenantId, userTenantId }, kind: "session_mismatch", scope },
      `session_mismatch|${session.tenantId}|${userTenantId}`
    );
  }
}
