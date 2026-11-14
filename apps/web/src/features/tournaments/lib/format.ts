import {
  TOURNAMENT_FORMAT_LABELS,
  TOURNAMENT_PHASE_LABELS,
  formatTimeControl,
  type TournamentFormat,
  type TournamentGameResult,
  type TournamentPhase
} from "@nexa-chess/types";

/** Half-points as chess points: 3 → "1½", 4 → "2". */
export function points(halfPoints: number | null | undefined, unit: "half-points" | "arena-points" = "half-points"): string {
  if (halfPoints === null || halfPoints === undefined) return "–";
  if (unit === "arena-points") return String(halfPoints);
  const whole = Math.floor(halfPoints / 2);
  return halfPoints % 2 === 0 ? String(whole) : whole === 0 ? "½" : `${whole}½`;
}

export function resultText(result: TournamentGameResult | null, isBye = false): string {
  if (isBye) return "Bye";
  switch (result) {
    case "WHITE_WON":
      return "1–0";
    case "BLACK_WON":
      return "0–1";
    case "DRAW":
      return "½–½";
    case "NO_RESULT":
      return "0–0";
    default:
      return "*";
  }
}

export type PhaseTone = "live" | "success" | "warning" | "secondary" | "destructive" | "info" | "default";

export function phaseTone(phase: TournamentPhase): PhaseTone {
  switch (phase) {
    case "LIVE":
      return "live";
    case "REGISTRATION_OPEN":
      return "success";
    case "PAUSED":
      return "warning";
    case "UPCOMING":
    case "REGISTRATION_CLOSED":
      return "info";
    case "CANCELLED":
      return "destructive";
    case "DRAFT":
    case "COMPLETED":
      return "secondary";
  }
}

export const phaseLabel = (phase: TournamentPhase) => TOURNAMENT_PHASE_LABELS[phase];

export function formatLine(t: { format: TournamentFormat; timeControl: { initialSeconds: number; incrementSeconds: number }; rounds: number | null; arenaDurationMin: number | null }): string {
  const parts = [TOURNAMENT_FORMAT_LABELS[t.format], formatTimeControl(t.timeControl)];
  if (t.format === "SWISS" && t.rounds) parts.push(`${t.rounds} rounds`);
  if (t.format === "ROUND_ROBIN") parts.push(t.rounds === 2 ? "double" : "single");
  if (t.format === "ARENA" && t.arenaDurationMin) parts.push(`${t.arenaDurationMin} min`);
  return parts.join(" · ");
}

/** mm:ss (or h:mm:ss), tenths under 10 s — chess clock style. */
export function clockText(ms: number): string {
  const safe = Math.max(0, ms);
  const total = Math.ceil(safe / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (safe < 10_000) return `${m}:${String(Math.floor(safe / 1000)).padStart(2, "0")}.${Math.floor((safe % 1000) / 100)}`;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** A short countdown ("2h 05m", "4m 12s", "now"). */
export function countdown(toMs: number, nowMs: number): string {
  const diff = Math.max(0, toMs - nowMs);
  if (diff < 1000) return "now";
  const total = Math.floor(diff / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export const newClientId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** What a player between rounds is waiting for. */
export function nextRoundLine(live: { awaitingHost: boolean; currentRound: number; nextRoundAt: string | null; tournament: { status: string } }, serverNow: number): string {
  const next = `Round ${live.currentRound + 1}`;
  if (live.tournament.status === "PAUSED") return "The tournament is paused.";
  if (live.nextRoundAt) {
    const at = Date.parse(live.nextRoundAt);
    return at - serverNow < 1000 ? `${next} is starting…` : `${next} starts in ${countdown(at, serverNow)}. Your board opens by itself.`;
  }
  if (live.awaitingHost) return `${next} starts when the host begins it. Your board opens by itself.`;
  return "This round is still being played.";
}
