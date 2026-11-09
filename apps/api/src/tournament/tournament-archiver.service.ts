import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { GameRecorderService } from "../game-library/game-recorder.service";
import { TournamentEventsService } from "./tournament-events.service";

/**
 * Copies every finished tournament game into the Game Library (replay and
 * engine analysis; docs/TOURNAMENTS.md §1). Driven by the after-commit game
 * events; the recorder is idempotent on `tournament:<gameId>`, so a repeated
 * event writes nothing new, and a failure never touches the result.
 */
@Injectable()
export class TournamentArchiverService implements OnModuleInit, OnModuleDestroy {
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly events: TournamentEventsService,
    private readonly recorder: GameRecorderService
  ) {}

  onModuleInit() {
    this.unsubscribe = this.events.subscribe((event) => {
      if (event.type === "game") this.recorder.recordTournamentGameInBackground(event.gameId);
    });
  }

  onModuleDestroy() {
    this.unsubscribe?.();
  }
}
