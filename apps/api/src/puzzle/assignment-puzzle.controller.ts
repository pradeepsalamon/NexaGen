import { Controller, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { API_ROUTES } from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { PuzzleAttemptService } from "./puzzle-attempt.service";

/**
 * Starts (or resumes) one puzzle of a PUZZLE_SET assignment. Lives with the
 * puzzle module because the attempt is an ordinary `PuzzleAttempt` — moves,
 * hints and submit then go through the existing `/puzzles/:id/attempts/*`
 * routes, which recognise the attempt's `studentAssignmentId`.
 */
@Controller()
export class AssignmentPuzzleController {
  constructor(private readonly attempts: PuzzleAttemptService) {}

  @Post(API_ROUTES.assignments.puzzleAttempts())
  startAttempt(
    @Param("id") studentAssignmentId: string,
    @Param("puzzleId") puzzleId: string,
    @Req() request: Request
  ) {
    return this.attempts.start(this.getAccessToken(request), puzzleId, { studentAssignmentId });
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
