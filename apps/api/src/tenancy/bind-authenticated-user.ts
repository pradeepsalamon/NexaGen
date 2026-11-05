import { UnauthorizedException } from "@nestjs/common";
import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { reportTenantGap } from "./tenant-audit";
import { getTenantContext } from "./tenant-context";

/**
 * Called by `authenticateUser` once the user and session are loaded
 * (docs/SAAS_MULTI_TENANCY.md §B step 4). Fills an empty context from the
 * user's academy and records who is acting. A mismatch between host, user and
 * session is logged and refused (401) in every mode: `audit` exists to log
 * *missing* context on old paths, but a resolved academy that isn't the user's
 * would let academy A's admin act in academy B (an `Origin` is easy to set
 * outside a browser).
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
      throw new UnauthorizedException("Invalid session.");
    }
    context.userId = user.id;
    context.role = user.role;
  }
  if (session && (session.tenantId ?? DEFAULT_TENANT_ID) !== userTenantId) {
    reportTenantGap(
      { at, detail: { sessionTenantId: session.tenantId, userTenantId }, kind: "session_mismatch", scope },
      `session_mismatch|${session.tenantId}|${userTenantId}`
    );
    throw new UnauthorizedException("Invalid session.");
  }
}
