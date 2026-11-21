import { z } from "zod";
import type { AuthUser, UserRole } from "./index";

/**
 * Multi-role accounts (docs/MULTI_ROLE_ACCOUNTS.md). An account has one
 * primary role (`User.role`) and may hold extra roles; a login session acts in
 * exactly one of them at a time (its "active" role). v1 allows one
 * combination only: a staff account (ADMIN / SUPER_ADMIN) that can also teach.
 */

/** The extra roles each primary role may hold. Everything not listed: none. */
export const EXTRA_ROLES_BY_PRIMARY: Readonly<Partial<Record<UserRole, readonly UserRole[]>>> = {
  ADMIN: ["COACH"],
  SUPER_ADMIN: ["COACH"]
};

/** Whether an account whose primary role is `primary` may also hold `extra`. */
export function canHoldExtraRole(primary: UserRole, extra: UserRole): boolean {
  return extra !== primary && (EXTRA_ROLES_BY_PRIMARY[primary] ?? []).includes(extra);
}

/** Every role the account may act in, primary first, without repeats or roles it may not hold. */
export function accountRoles(primary: UserRole, extraRoles: readonly UserRole[] | null | undefined): UserRole[] {
  const roles: UserRole[] = [primary];
  for (const role of extraRoles ?? []) {
    if (!roles.includes(role) && canHoldExtraRole(primary, role)) roles.push(role);
  }
  return roles;
}

/**
 * The role a session acts in: its stored `activeRole` while the account still
 * holds it, otherwise the primary role (an extra role that was removed, or a
 * stale value, falls back rather than failing).
 */
export function resolveActiveRole(
  primary: UserRole,
  extraRoles: readonly UserRole[] | null | undefined,
  activeRole: UserRole | null | undefined
): UserRole {
  if (!activeRole) return primary;
  return accountRoles(primary, extraRoles).includes(activeRole) ? activeRole : primary;
}

/** The account's roles as the web sees them (`AuthUser.roles`, falling back to the one role). */
export function rolesOf(user: Pick<AuthUser, "role" | "roles">): UserRole[] {
  return user.roles && user.roles.length > 0 ? user.roles : [user.role];
}

const roleValues = ["SUPER_ADMIN", "ADMIN", "COACH", "STUDENT", "SALES"] as const;

/** `POST /auth/switch-role`: the role this login session should act in. */
export const switchRoleRequestSchema = z.object({ role: z.enum(roleValues) }).strict();
export type SwitchRoleRequest = z.infer<typeof switchRoleRequestSchema>;

/** `PUT /users/:id/extra-roles`: the full list of extra roles (v1: [] or ["COACH"]). */
export const updateExtraRolesRequestSchema = z
  .object({ extraRoles: z.array(z.literal("COACH")).max(1) })
  .strict();
export type UpdateExtraRolesRequest = z.infer<typeof updateExtraRolesRequestSchema>;

export type UpdateExtraRolesResponse = {
  user: AuthUser;
  /**
   * After removing COACH: batches this account still coaches. They keep it as
   * their coach (history); the admin is shown the list to reassign them.
   */
  coachedBatches: { id: string; name: string }[];
};
