import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  parseLeaderboardOverride,
  parseScoringOverride,
  resolvePuzzleLeaderboard,
  resolvePuzzleScoring,
  type PuzzleLeaderboardOverride,
  type PuzzleScoringOverride,
  type PuzzleScoringSettingsResponse,
  type UpdatePuzzleScoringSettingsRequest
} from "@nexa-chess/types";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  assertAdmin,
  assertStaffOrCoach,
  authenticateUser,
  fullName
} from "./puzzle-auth.helper";

const SINGLETON_ID = "default";

/**
 * Platform default points + leaderboard rules for live-class puzzles — the
 * admin layer of `resolvePuzzleScoring` / `resolvePuzzleLeaderboard`. A
 * singleton seeded lazily on first read (no seed migration), like
 * `InvoiceSettings`.
 */
@Injectable()
export class PuzzleScoringSettingsService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  /** Coaches read it too — the share dialog pre-fills from it. */
  async get(accessToken: string | undefined): Promise<PuzzleScoringSettingsResponse> {
    assertStaffOrCoach(await authenticateUser(this.jwtService, this.prisma, accessToken));
    return this.toResponse(await this.load());
  }

  async update(
    accessToken: string | undefined,
    dto: UpdatePuzzleScoringSettingsRequest
  ): Promise<PuzzleScoringSettingsResponse> {
    const user = assertAdmin(await authenticateUser(this.jwtService, this.prisma, accessToken));
    const row = await this.prisma.puzzleScoringSettings.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        leaderboardJson: dto.leaderboard as unknown as Prisma.InputJsonValue,
        scoringJson: dto.scoring as unknown as Prisma.InputJsonValue,
        updatedById: user.id
      },
      update: {
        leaderboardJson: dto.leaderboard as unknown as Prisma.InputJsonValue,
        scoringJson: dto.scoring as unknown as Prisma.InputJsonValue,
        updatedById: user.id
      }
    });
    return this.toResponse(row);
  }

  /** The admin layer as overrides, for callers that resolve further layers on top. */
  async defaults(): Promise<{
    leaderboard: PuzzleLeaderboardOverride | null;
    scoring: PuzzleScoringOverride | null;
  }> {
    const row = await this.prisma.puzzleScoringSettings.findUnique({
      where: { id: SINGLETON_ID }
    });
    return {
      leaderboard: parseLeaderboardOverride(row?.leaderboardJson),
      scoring: parseScoringOverride(row?.scoringJson)
    };
  }

  private async load() {
    return this.prisma.puzzleScoringSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {}
    });
  }

  private async toResponse(row: {
    leaderboardJson: Prisma.JsonValue;
    scoringJson: Prisma.JsonValue;
    updatedAt: Date;
    updatedById: string | null;
  }): Promise<PuzzleScoringSettingsResponse> {
    const updatedBy = row.updatedById
      ? await this.prisma.user.findUnique({
          where: { id: row.updatedById },
          select: { firstName: true, lastName: true }
        })
      : null;
    return {
      settings: {
        leaderboard: resolvePuzzleLeaderboard(parseLeaderboardOverride(row.leaderboardJson)),
        scoring: resolvePuzzleScoring(parseScoringOverride(row.scoringJson)),
        updatedAt: row.updatedById ? row.updatedAt.toISOString() : null,
        updatedByName: fullName(updatedBy)
      }
    };
  }
}
