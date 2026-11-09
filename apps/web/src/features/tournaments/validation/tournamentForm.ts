import { z } from "zod";
import {
  DEFAULT_TIEBREAKS,
  TOURNAMENT_FORMATS,
  TOURNAMENT_VISIBILITIES,
  type CreateTournamentRequest,
  type TournamentDetailDto,
  type TournamentEligibility
} from "@nexa-chess/types";

const wholeOrBlank = z.string().trim().regex(/^\d*$/, "Use a whole number.");

/**
 * The editor's fields, all as typed text. `toTournamentRequest` turns them
 * into the shared request; the shared schema (and then the API) is the real
 * check — this one only catches typos early.
 */
export const tournamentFormSchema = z.object({
  allowUnrated: z.boolean(),
  arenaDurationMin: wholeOrBlank,
  berserk: z.boolean(),
  description: z.string(),
  experienceLevels: z.array(z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"])),
  format: z.enum(TOURNAMENT_FORMATS),
  gamesPerMatch: wholeOrBlank,
  incrementSeconds: wholeOrBlank,
  initialMinutes: z.string().trim().regex(/^\d+(\.\d+)?$/, "Use minutes, e.g. 5 or 0.5."),
  knockoutTiebreak: z.enum(["SUDDEN_DEATH", "HIGHER_SEED"]),
  lateRegistrationRounds: wholeOrBlank,
  maxAgeUnder: wholeOrBlank,
  maxPlayers: wholeOrBlank,
  maxRating: wholeOrBlank,
  minAge: wholeOrBlank,
  minPlayers: wholeOrBlank,
  minRating: wholeOrBlank,
  name: z.string().trim().min(3, "Give the tournament a name.").max(120),
  prizesText: z.string(),
  registrationClosesAt: z.string(),
  registrationOpensAt: z.string(),
  registrationRequiresApproval: z.boolean(),
  roundBreakSec: wholeOrBlank,
  rounds: wholeOrBlank,
  rulesText: z.string(),
  spectatorDelaySec: wholeOrBlank,
  startsAt: z.string().min(1, "Choose when it starts."),
  streaks: z.boolean(),
  visibility: z.enum(TOURNAMENT_VISIBILITIES)
});
export type TournamentForm = z.infer<typeof tournamentFormSchema>;

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO instant → the picker's local "YYYY-MM-DDTHH:MM". */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The picker's local "YYYY-MM-DDTHH:MM" → an ISO instant (null when blank). */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const num = (value: string): number | undefined => (value.trim() === "" ? undefined : Number(value));

export function defaultTournamentForm(t?: TournamentDetailDto): TournamentForm {
  const tomorrow = new Date(Date.now() + 24 * 3600_000);
  tomorrow.setMinutes(0, 0, 0);
  const e: TournamentEligibility = t?.eligibility ?? { allowUnrated: true };
  const str = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
  return {
    allowUnrated: e.allowUnrated ?? true,
    arenaDurationMin: str(t?.arenaDurationMin ?? 60),
    berserk: t?.arenaConfig?.berserk ?? true,
    description: t?.description ?? "",
    experienceLevels: e.experienceLevels ?? [],
    format: t?.format ?? "SWISS",
    gamesPerMatch: str(t?.knockoutConfig?.gamesPerMatch ?? 1),
    incrementSeconds: str(t?.timeControl.incrementSeconds ?? 3),
    initialMinutes: String((t?.timeControl.initialSeconds ?? 300) / 60),
    knockoutTiebreak: t?.knockoutConfig?.tiebreak ?? "SUDDEN_DEATH",
    lateRegistrationRounds: str(t?.lateRegistrationRounds ?? 0),
    maxAgeUnder: str(e.maxAgeUnder),
    maxPlayers: str(t?.maxPlayers),
    maxRating: str(e.maxRating),
    minAge: str(e.minAge),
    minPlayers: str(t?.minPlayers ?? 2),
    minRating: str(e.minRating),
    name: t?.name ?? "",
    prizesText: t?.prizesText ?? "",
    registrationClosesAt: isoToLocalInput(t?.registrationClosesAt),
    registrationOpensAt: isoToLocalInput(t?.registrationOpensAt),
    registrationRequiresApproval: t?.registrationRequiresApproval ?? false,
    roundBreakSec: str(t?.roundBreakSec ?? 60),
    rounds: str(t?.rounds ?? (t?.format === "ROUND_ROBIN" ? 1 : 5)),
    rulesText: t?.rulesText ?? "",
    spectatorDelaySec: t ? str(t.spectatorDelaySec) : "",
    startsAt: isoToLocalInput(t?.startsAt ?? tomorrow.toISOString()),
    streaks: t?.arenaConfig?.streaks ?? true,
    visibility: t?.visibility ?? "PUBLIC"
  };
}

/** The request body for create (and, plus `version`, for update). */
export function toTournamentRequest(values: TournamentForm): CreateTournamentRequest {
  const format = values.format;
  const eligibility: TournamentEligibility = {
    allowUnrated: values.allowUnrated,
    ...(values.experienceLevels.length ? { experienceLevels: values.experienceLevels } : {}),
    ...(num(values.maxAgeUnder) !== undefined ? { maxAgeUnder: num(values.maxAgeUnder) } : {}),
    ...(num(values.maxRating) !== undefined ? { maxRating: num(values.maxRating) } : {}),
    ...(num(values.minAge) !== undefined ? { minAge: num(values.minAge) } : {}),
    ...(num(values.minRating) !== undefined ? { minRating: num(values.minRating) } : {})
  };
  return {
    ...(format === "ARENA"
      ? { arenaConfig: { berserk: values.berserk, streaks: values.streaks }, arenaDurationMin: num(values.arenaDurationMin) }
      : {}),
    ...(format === "KNOCKOUT"
      ? { knockoutConfig: { gamesPerMatch: num(values.gamesPerMatch) ?? 1, tiebreak: values.knockoutTiebreak } }
      : {}),
    ...(format === "SWISS" || format === "ROUND_ROBIN" ? { rounds: num(values.rounds) } : {}),
    description: values.description.trim() || undefined,
    eligibility,
    format,
    lateRegistrationRounds: num(values.lateRegistrationRounds) ?? 0,
    maxPlayers: num(values.maxPlayers) ?? null,
    minPlayers: num(values.minPlayers) ?? 2,
    name: values.name.trim(),
    prizesText: values.prizesText.trim() || undefined,
    registrationClosesAt: localInputToIso(values.registrationClosesAt),
    registrationOpensAt: localInputToIso(values.registrationOpensAt),
    registrationRequiresApproval: values.registrationRequiresApproval,
    roundBreakSec: num(values.roundBreakSec) ?? 60,
    rulesText: values.rulesText.trim() || undefined,
    ...(num(values.spectatorDelaySec) !== undefined ? { spectatorDelaySec: num(values.spectatorDelaySec) } : {}),
    startsAt: localInputToIso(values.startsAt) ?? "",
    tiebreaks: DEFAULT_TIEBREAKS[format],
    timeControl: { incrementSeconds: num(values.incrementSeconds) ?? 0, initialSeconds: Math.round(Number(values.initialMinutes) * 60) },
    visibility: values.visibility
  };
}
