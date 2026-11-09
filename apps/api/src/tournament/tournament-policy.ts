// ─────────────────────────────────────────────────────────────────────────────
// Who may do what with a tournament (docs/TOURNAMENTS.md §3.2). Pure: callers
// load the facts (the viewer's host row and player row, the academy settings)
// through scoped queries and ask here. Every route that acts on a tournament
// goes through one of these.
//
// Admins (ADMIN, SUPER_ADMIN of the academy) can do everything. A coach acts
// only through a per-tournament TournamentHost row. Students only register,
// play and watch. Anonymous viewers only watch PUBLIC tournaments, and only
// when the academy allows it.
// ─────────────────────────────────────────────────────────────────────────────
import type { TournamentPublishPath } from "@nexa-chess/types";
import {
  Prisma,
  TournamentHostRole,
  TournamentPlayerStatus,
  TournamentStatus,
  TournamentVisibility,
  UserRole
} from "@prisma/client";
import { isAdminRole } from "../auth/authenticate";

export type TournamentActor = { id: string; role: UserRole };

/** The tournament and the viewer's relation to it. */
export type TournamentAccessFacts = {
  status: TournamentStatus;
  visibility: TournamentVisibility;
  /** The viewer's TournamentHost role, if any. */
  hostRole: TournamentHostRole | null;
  /** The viewer's TournamentPlayer status, if any. */
  playerStatus: TournamentPlayerStatus | null;
};

export type TournamentPolicySettings = {
  allowAnonymousSpectating: boolean;
  coachesMayCreate: boolean;
  coachesMayPublishPublic: boolean;
};

/** Player statuses that let someone see a PRIVATE / INVITATION_ONLY tournament (a rejected one does not). */
export const VIEWING_PLAYER_STATUSES: readonly TournamentPlayerStatus[] = [
  TournamentPlayerStatus.INVITED,
  TournamentPlayerStatus.PENDING,
  TournamentPlayerStatus.APPROVED,
  TournamentPlayerStatus.WITHDRAWN,
  TournamentPlayerStatus.DISQUALIFIED
];

const RUNNING_ROLES: readonly TournamentHostRole[] = [TournamentHostRole.HOST, TournamentHostRole.CO_HOST];

const isAdmin = (actor: TournamentActor | null): boolean => !!actor && isAdminRole(actor.role);

/** Only staff accounts can hold a host row; a student is never a host or commentator. */
export function canHoldHostRole(role: UserRole): boolean {
  return isAdminRole(role) || role === UserRole.COACH;
}

/** A host row counts only on a staff account (a role change later never leaves a student hosting). */
function effectiveHostRole(actor: TournamentActor | null, facts: TournamentAccessFacts): TournamentHostRole | null {
  if (!actor || !facts.hostRole || !canHoldHostRole(actor.role)) return null;
  return facts.hostRole;
}

export function canCreateTournament(actor: TournamentActor, settings: TournamentPolicySettings): boolean {
  if (isAdmin(actor)) return true;
  return actor.role === UserRole.COACH && settings.coachesMayCreate;
}

/** Edit, manage registrations, run rounds, record forfeits, correct results, end. */
export function canManageTournament(actor: TournamentActor | null, facts: TournamentAccessFacts): boolean {
  if (isAdmin(actor)) return true;
  const role = effectiveHostRole(actor, facts);
  return role !== null && RUNNING_ROLES.includes(role);
}

/**
 * Publishing takes authority, not just management rights: admins publish
 * directly; the coach HOST publishes PRIVATE / INVITATION_ONLY directly and a
 * PUBLIC tournament only with `coachesMayPublishPublic`, otherwise through an
 * admin approval request. CO_HOSTs and commentators never publish. Whether the
 * tournament is in a publishable state is the caller's check.
 */
export function tournamentPublishPath(
  actor: TournamentActor,
  facts: TournamentAccessFacts,
  settings: TournamentPolicySettings
): TournamentPublishPath {
  if (isAdmin(actor)) return "DIRECT";
  if (effectiveHostRole(actor, facts) !== TournamentHostRole.HOST) return "FORBIDDEN";
  if (facts.visibility !== TournamentVisibility.PUBLIC) return "DIRECT";
  return settings.coachesMayPublishPublic ? "DIRECT" : "APPROVAL";
}

/** Publish official commentary, announcements and featured games. */
export function canBroadcast(actor: TournamentActor | null, facts: TournamentAccessFacts): boolean {
  return isAdmin(actor) || effectiveHostRole(actor, facts) !== null;
}

/** Hide commentary, grant or revoke hosts. Admins and the HOST only. */
export function canModerateTournament(actor: TournamentActor | null, facts: TournamentAccessFacts): boolean {
  return isAdmin(actor) || effectiveHostRole(actor, facts) === TournamentHostRole.HOST;
}

/** See the tournament at all. `viewer` null = not signed in. */
export function canViewTournament(
  viewer: TournamentActor | null,
  facts: TournamentAccessFacts,
  settings: Pick<TournamentPolicySettings, "allowAnonymousSpectating">
): boolean {
  if (canBroadcast(viewer, facts)) return true; // admins and every host role, drafts included
  if (facts.status === TournamentStatus.DRAFT) return false;
  if (facts.visibility === TournamentVisibility.PUBLIC) return viewer ? true : settings.allowAnonymousSpectating;
  return !!viewer && facts.playerStatus !== null && VIEWING_PLAYER_STATUSES.includes(facts.playerStatus);
}

/**
 * The list filter matching `canViewTournament` for a signed-in viewer, or for
 * an anonymous one (the caller then also checks `allowAnonymousSpectating`).
 * Host rows only count for staff, as in the policy.
 */
export function getTournamentVisibilityWhere(viewer: TournamentActor | null): Prisma.TournamentWhereInput {
  if (isAdmin(viewer)) return {};
  const publicListed: Prisma.TournamentWhereInput = {
    status: { not: TournamentStatus.DRAFT },
    visibility: TournamentVisibility.PUBLIC
  };
  if (!viewer) return publicListed;
  const or: Prisma.TournamentWhereInput[] = [
    publicListed,
    {
      players: { some: { status: { in: [...VIEWING_PLAYER_STATUSES] }, userId: viewer.id } },
      status: { not: TournamentStatus.DRAFT }
    }
  ];
  if (canHoldHostRole(viewer.role)) or.push({ hosts: { some: { userId: viewer.id } } });
  return { OR: or };
}

/**
 * v1 is single-academy (docs/TOURNAMENTS.md §3.8): a player's academy must be
 * the organizer's. Inter-academy events replace this one rule.
 */
export function playerAcademyAllowed(tournamentTenantId: string, playerTenantId: string): boolean {
  return tournamentTenantId === playerTenantId;
}
