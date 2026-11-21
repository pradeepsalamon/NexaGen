import { type Prisma, UserRole } from "@prisma/client";

/**
 * "Accounts that are coaches" (docs/MULTI_ROLE_ACCOUNTS.md §5.4): an account
 * whose primary role is COACH, or a staff account that can also teach
 * (`extraRoles` has COACH). Every query that looks users up as coaches goes
 * through this, so an admin who teaches shows up in coach pickers, payroll,
 * seat counts and reports. `coach-accounts.spec.ts` fails a new raw
 * `role: COACH` user filter.
 *
 * It is an `OR`, so combine it with `AND` (`{ AND: [coachWhere(), …] }`) or
 * spread it into a where that has no `OR` of its own.
 */
export function coachWhere(): { OR: Prisma.UserWhereInput[] } {
  // coach-role-ok: the helper itself.
  return { OR: [{ role: UserRole.COACH }, { extraRoles: { has: UserRole.COACH } }] };
}

/** Whether a loaded account (its stored roles, not a session's view) can teach. */
export function isCoachAccount(user: { extraRoles?: readonly UserRole[] | null; role: UserRole }): boolean {
  return user.role === UserRole.COACH || Boolean(user.extraRoles?.includes(UserRole.COACH));
}
