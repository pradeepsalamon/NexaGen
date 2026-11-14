import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  TACTIC_MOTIF_LABELS,
  type GameEngineAnalysis,
  type TacticRevisionResponse,
} from '@nexa-chess/types';
import {
  GameAnalysisStatus,
  PuzzleDifficulty,
  PuzzleSource,
  PuzzleStatus,
  PuzzleType,
  PuzzleVisibility,
  RevisionItemKind,
  RevisionItemSource,
  RevisionItemStatus,
  UserRole,
} from '@prisma/client';
import { authenticateUser } from '../auth/authenticate';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanViewStudent } from '../progress/student-access';
import { puzzleContentHash } from '../puzzle/puzzle-content-hash';
import { PuzzleCatalogService } from '../puzzle/puzzle-catalog.service';
import type { StoredReport } from './game-analysis.mapper';
import { revisionEligibility } from './revision-eligibility';

/**
 * Missed tactic → Smart Revision. Never automatic: the student (or their
 * coach) chooses it. The puzzle is a PUBLISHED PRIVATE `source: GAME` row in
 * the hidden system folder, opened only by its owner; one per (analysis, ply)
 * through the unique (source, sourceId). Scheduling, grading and the
 * attempt-capped ratings are Smart Revision's own, unchanged.
 */
@Injectable()
export class GameRevisionService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly catalog: PuzzleCatalogService,
  ) {}

  async addTactic(accessToken: string | undefined, analysisId: string, ply: number): Promise<TacticRevisionResponse> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (!Number.isInteger(ply) || ply < 0) throw new BadRequestException('ply must be a position index.');
    const analysis = await this.prisma.gameAnalysis.findUnique({
      include: { game: { select: { blackName: true, blackPlayerId: true, whiteName: true, whitePlayerId: true } } },
      where: { id: analysisId },
    });
    if (!analysis || (analysis.status !== GameAnalysisStatus.COMPLETED && analysis.status !== GameAnalysisStatus.PARTIAL)) {
      throw new NotFoundException('Analysis not found.');
    }
    const report = analysis.reportJson as StoredReport | null;
    const opp = report?.tactics.opportunities.find((o) => o.ply === ply);
    if (!opp) throw new NotFoundException('There is no tactic at that move.');
    const studentId = opp.side === 'white' ? analysis.game.whitePlayerId : analysis.game.blackPlayerId;
    if (!studentId) throw new BadRequestException("That side wasn't played by a NexaGen student.");

    // The student whose tactic it was, an admin, or one of their coaches.
    if (user.role === UserRole.STUDENT) {
      if (user.id !== studentId) throw new NotFoundException('Analysis not found.');
    } else {
      await assertCanViewStudent(this.prisma, user, studentId);
    }

    const verdict = revisionEligibility(analysis.engineJson as unknown as GameEngineAnalysis, opp);
    if (!verdict.eligible) throw new BadRequestException(verdict.reason);

    const sourceId = `game-analysis:${analysis.id}:${ply}`;
    const opponent = opp.side === 'white' ? analysis.game.blackName : analysis.game.whiteName;
    const moveNumber = Math.floor(ply / 2) + 1;
    let puzzle = await this.prisma.withDeleted.puzzle.findUnique({
      select: { id: true, isDeleted: true },
      where: { source_sourceId: { source: PuzzleSource.GAME, sourceId } },
    });
    if (puzzle?.isDeleted) throw new BadRequestException('That puzzle was deleted.');
    if (!puzzle) {
      const topicId = await this.catalog.ensureGameAnalysisFolder(user.id);
      const now = new Date();
      try {
        puzzle = await this.prisma.puzzle.create({
          data: {
            contentHash: puzzleContentHash(opp.fen, verdict.solution),
            createdById: user.id,
            createdByRole: user.role,
            difficulty: PuzzleDifficulty.INTERMEDIATE,
            explanation: `${TACTIC_MOTIF_LABELS[opp.primaryMotif]} you missed at move ${moveNumber} against ${opponent}.`,
            fen: opp.fen,
            ownerId: studentId,
            publishedAt: now,
            publishedById: user.id,
            puzzleType: verdict.kind === 'MATE' ? PuzzleType.CHECKMATE : PuzzleType.TACTICAL,
            solutionMovesJson: verdict.solution,
            source: PuzzleSource.GAME,
            sourceId,
            status: PuzzleStatus.PUBLISHED,
            tags: [opp.primaryMotif.toLowerCase()],
            title: `From your game vs ${opponent} — move ${moveNumber}`.slice(0, 200),
            topicId,
            visibility: PuzzleVisibility.PRIVATE,
          },
          select: { id: true, isDeleted: true },
        });
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw error;
        puzzle = await this.prisma.puzzle.findUniqueOrThrow({
          select: { id: true, isDeleted: true },
          where: { source_sourceId: { source: PuzzleSource.GAME, sourceId } },
        });
      }
    }

    const contentKey = `puzzle:${puzzle.id}`;
    const now = new Date();
    const existing = await this.prisma.revisionItem.findUnique({
      where: { studentId_contentKey: { contentKey, studentId } },
    });
    if (existing) {
      const item = await this.prisma.revisionItem.update({
        data: {
          dueAt: existing.dueAt > now ? now : existing.dueAt,
          removedAt: null,
          removedById: null,
          status: RevisionItemStatus.ACTIVE,
        },
        where: { id: existing.id },
      });
      return { alreadyAdded: true, puzzleId: puzzle.id, revisionItemId: item.id };
    }
    const staff = user.role !== UserRole.STUDENT;
    try {
      const item = await this.prisma.revisionItem.create({
        data: {
          contentKey,
          dueAt: now,
          kind: RevisionItemKind.PUZZLE,
          note: `From your game vs ${opponent}, move ${moveNumber}`.slice(0, 300),
          puzzleId: puzzle.id,
          recommendedAt: staff ? now : null,
          recommendedById: staff ? user.id : null,
          source: RevisionItemSource.GAME,
          studentId,
        },
      });
      return { alreadyAdded: false, puzzleId: puzzle.id, revisionItemId: item.id };
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      const item = await this.prisma.revisionItem.findUniqueOrThrow({
        where: { studentId_contentKey: { contentKey, studentId } },
      });
      return { alreadyAdded: true, puzzleId: puzzle.id, revisionItemId: item.id };
    }
  }
}
