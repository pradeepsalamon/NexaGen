import { Injectable } from "@nestjs/common";

type Listener = (event: TournamentEvent) => void;

export type TournamentEvent =
  | { type: "state"; tournamentId: string }
  | { type: "game"; tournamentId: string; gameId: string }
  | { type: "commentary"; tournamentId: string; commentaryId: string }
  /** Something of this tournament is due at `at` (epoch ms): a flag fall, a first-move deadline. */
  | { type: "deadline"; tournamentId: string; at: number };

/**
 * After-commit tournament events (docs/TOURNAMENTS.md §4). Services call these
 * once their transaction has committed; listeners (the real-time nudges, the
 * Game Library recorder) subscribe. A listener never throws into the caller,
 * and the REST state stays the source of truth: an event is only a nudge.
 */
@Injectable()
export class TournamentEventsService {
  private readonly listeners = new Set<Listener>();
  /** Per-tournament version of the live snapshot (bumped on every change); clients compare it. */
  private readonly versions = new Map<string, number>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  stateChanged(tournamentId: string): void {
    this.bump(tournamentId);
    this.emit({ tournamentId, type: "state" });
  }

  gameChanged(tournamentId: string, gameId: string): void {
    this.bump(tournamentId);
    this.emit({ gameId, tournamentId, type: "game" });
  }

  commentaryChanged(tournamentId: string, commentaryId: string): void {
    this.bump(tournamentId);
    this.emit({ commentaryId, tournamentId, type: "commentary" });
  }

  /** Asks for the tournament's pass to run at `at` (the timer service listens). Changes nothing viewers see. */
  deadlineAt(tournamentId: string, at: number): void {
    this.emit({ at, tournamentId, type: "deadline" });
  }

  version(tournamentId: string): number {
    return this.versions.get(tournamentId) ?? 0;
  }

  private bump(tournamentId: string) {
    this.versions.set(tournamentId, (this.versions.get(tournamentId) ?? 0) + 1);
  }

  private emit(event: TournamentEvent) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A nudge listener never breaks the request that committed.
      }
    }
  }
}
