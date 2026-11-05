import { ForbiddenException } from "@nestjs/common";
import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { Prisma, UserRole } from "@prisma/client";
import type { PrismaTransactionClient } from "../prisma/prisma.service";
import { asPlatform } from "../tenancy/tenant-context";

/**
 * Platform powers (docs/SAAS_MULTI_TENANCY.md §E, "Identity and roles"): a
 * `SUPER_ADMIN` of Nexa's own academy, and nobody else, ever. A super admin of
 * any other academy is an ordinary academy admin. Replaces `PlatformStaff`.
 * MFA for these accounts is the login rule (`MFA_REQUIRED_ROLES`, SUPER_ADMIN
 * by default).
 */
export function isPlatformOperator(user: { role: UserRole; tenantId: string }): boolean {
  return user.role === UserRole.SUPER_ADMIN && user.tenantId === DEFAULT_TENANT_ID;
}

export function assertPlatformOperator<T extends { role: UserRole; tenantId: string }>(user: T): T {
  if (!isPlatformOperator(user)) throw new ForbiddenException("Platform operators only.");
  return user;
}

export type PlatformAuditEntry = {
  action: string;
  actorUserId: string;
  details?: Record<string, unknown>;
  reason?: string | null;
  targetTenantId?: string | null;
};

/** Every console write is recorded (§I). Platform table: written as platform. */
export function writePlatformAudit(
  prisma: Pick<PrismaTransactionClient, "platformAuditLog">,
  entry: PlatformAuditEntry
) {
  return asPlatform(`platform audit: ${entry.action}`, () =>
    prisma.platformAuditLog.create({
      data: {
        action: entry.action,
        actorUserId: entry.actorUserId,
        details: (entry.details ?? {}) as Prisma.InputJsonValue,
        reason: entry.reason ?? null,
        targetTenantId: entry.targetTenantId ?? null
      }
    })
  );
}
