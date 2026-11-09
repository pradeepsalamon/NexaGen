import { z } from "zod";

// Tournaments — shared contract (docs/TOURNAMENTS.md).
//
// Phase 1: the domain enums (identical to the Prisma enums; a spec in
// apps/api/src/tournament keeps them in step) and the academy's tournament
// settings. Tournament creation, registration, pairing, games, commentary and
// certificates add their contracts in the phases that build them.

// ── Enums ──

export const TOURNAMENT_FORMATS = ["SWISS", "ARENA", "ROUND_ROBIN", "KNOCKOUT"] as const;
export const tournamentFormatSchema = z.enum(TOURNAMENT_FORMATS);
export type TournamentFormat = z.infer<typeof tournamentFormatSchema>;

export const TOURNAMENT_FORMAT_LABELS: Record<TournamentFormat, string> = {
  ARENA: "Arena",
  KNOCKOUT: "Knockout",
  ROUND_ROBIN: "Round robin",
  SWISS: "Swiss"
};

/**
 * Stored lifecycle only. Whether registration is open is derived from the
 * registration window (Phase 2), never stored.
 */
export const TOURNAMENT_STATUSES = ["DRAFT", "PUBLISHED", "LIVE", "PAUSED", "COMPLETED", "CANCELLED"] as const;
export const tournamentStatusSchema = z.enum(TOURNAMENT_STATUSES);
export type TournamentStatus = z.infer<typeof tournamentStatusSchema>;

export const TOURNAMENT_VISIBILITIES = ["PUBLIC", "PRIVATE", "INVITATION_ONLY"] as const;
export const tournamentVisibilitySchema = z.enum(TOURNAMENT_VISIBILITIES);
export type TournamentVisibility = z.infer<typeof tournamentVisibilitySchema>;

export const TOURNAMENT_VISIBILITY_LABELS: Record<TournamentVisibility, string> = {
  INVITATION_ONLY: "Invitation only",
  PRIVATE: "Private",
  PUBLIC: "Public"
};

export const TOURNAMENT_TIEBREAKS = [
  "BUCHHOLZ",
  "BUCHHOLZ_CUT1",
  "MEDIAN_BUCHHOLZ",
  "SONNEBORN_BERGER",
  "DIRECT_ENCOUNTER",
  "WINS",
  "PROGRESSIVE",
  "PERFORMANCE"
] as const;
export const tournamentTiebreakSchema = z.enum(TOURNAMENT_TIEBREAKS);
export type TournamentTiebreak = z.infer<typeof tournamentTiebreakSchema>;

/** HOST and CO_HOST run a tournament; COMMENTATOR only broadcasts on it. */
export const TOURNAMENT_HOST_ROLES = ["HOST", "CO_HOST", "COMMENTATOR"] as const;
export const tournamentHostRoleSchema = z.enum(TOURNAMENT_HOST_ROLES);
export type TournamentHostRole = z.infer<typeof tournamentHostRoleSchema>;

export const TOURNAMENT_HOST_ROLE_LABELS: Record<TournamentHostRole, string> = {
  CO_HOST: "Co-host",
  COMMENTATOR: "Commentator",
  HOST: "Host"
};

export const TOURNAMENT_PLAYER_STATUSES = [
  "INVITED",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
  "DISQUALIFIED"
] as const;
export const tournamentPlayerStatusSchema = z.enum(TOURNAMENT_PLAYER_STATUSES);
export type TournamentPlayerStatus = z.infer<typeof tournamentPlayerStatusSchema>;

export const TOURNAMENT_RATING_SOURCES = ["PROFILE", "UNRATED"] as const;
export type TournamentRatingSource = (typeof TOURNAMENT_RATING_SOURCES)[number];

/** How a player's name is shown to anonymous spectators (docs/TOURNAMENTS.md §4.1). */
export const TOURNAMENT_PUBLIC_NAME_FORMATS = ["FIRST_NAME_LAST_INITIAL", "FIRST_NAME_ONLY", "INITIALS"] as const;
export const tournamentPublicNameFormatSchema = z.enum(TOURNAMENT_PUBLIC_NAME_FORMATS);
export type TournamentPublicNameFormat = z.infer<typeof tournamentPublicNameFormatSchema>;

export const TOURNAMENT_PUBLIC_NAME_FORMAT_LABELS: Record<TournamentPublicNameFormat, string> = {
  FIRST_NAME_LAST_INITIAL: "First name and last initial (Asha R.)",
  FIRST_NAME_ONLY: "First name only (Asha)",
  INITIALS: "Initials (A. R.)"
};

/** A name as anonymous spectators see it. Never the full name. */
export function formatPublicPlayerName(
  firstName: string,
  lastName: string | null,
  format: TournamentPublicNameFormat
): string {
  const first = firstName.trim();
  const lastInitial = (lastName ?? "").trim().charAt(0).toUpperCase();
  switch (format) {
    case "FIRST_NAME_ONLY":
      return first || "Player";
    case "INITIALS": {
      const initials = [first.charAt(0).toUpperCase(), lastInitial].filter(Boolean);
      return initials.length ? initials.map((c) => `${c}.`).join(" ") : "Player";
    }
    case "FIRST_NAME_LAST_INITIAL":
      if (!first) return lastInitial ? `${lastInitial}.` : "Player";
      return lastInitial ? `${first} ${lastInitial}.` : first;
  }
}

// ── Permissions ──

/**
 * What publishing a tournament takes for this user (docs/TOURNAMENTS.md §3.2):
 * done directly, filed as an admin approval request, or not allowed.
 */
export type TournamentPublishPath = "DIRECT" | "APPROVAL" | "FORBIDDEN";

// ── Academy settings (admin) ──

export const TOURNAMENT_MAX_SPECTATOR_DELAY_SEC = 900;

export const updateTournamentSettingsRequestSchema = z
  .object({
    allowAnonymousSpectating: z.boolean(),
    coachesMayCreate: z.boolean(),
    coachesMayPublishPublic: z.boolean(),
    defaultSpectatorDelaySec: z.number().int().min(0).max(TOURNAMENT_MAX_SPECTATOR_DELAY_SEC),
    publicNameFormat: tournamentPublicNameFormatSchema
  })
  .strict();
export type UpdateTournamentSettingsRequest = z.infer<typeof updateTournamentSettingsRequestSchema>;

export type TournamentSettingsDto = UpdateTournamentSettingsRequest & {
  updatedAt: string | null;
  updatedBy: { id: string; name: string } | null;
};

export type TournamentSettingsResponse = { settings: TournamentSettingsDto };
