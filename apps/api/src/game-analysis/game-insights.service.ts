import { ForbiddenException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ANALYSED_GAME_RESULTS,
  type AnalysedGameItem,
  type AnalysedGameListResponse,
  type ClockStats,
  type GamePhase,
  type MotifStats,
  type MoveClassification,
  type PhaseStats,
  type StudentGameInsights,
  type TacticMotif,
} from '@nexa-chess/types';
import { GameAnalysisSideColor, GameAnalysisStatus, Prisma, UserRole } from '@prisma/client';
import { authenticateUser } from '../auth/authenticate';
import { queryEnum } from '../common/query-params';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanViewStudent } from '../progress/student-access';
import { aggregateInsights, type InsightRow } from './insights';
import { ERROR_CLASSES } from './report-builder';

/** Most recent analysed sides an insight reads — bounds the query. */
export const INSIGHT_ROW_LIMIT = 300;
const FINISHED = [GameAnalysisStatus.COMPLETED, GameAnalysisStatus.PARTIAL];

const sideInclude = {
  analysis: {
    select: {
      createdAt: true,
      depth: true,
      game: { select: { blackName: true, id: true, title: true, whiteName: true } },
      gameId: true,
      id: true,
      reportJson: false,
      status: true,
    },
  },
} satisfies Prisma.GameAnalysisSideInclude;

type SideRow = Prisma.GameAnalysisSideGetPayload<{ include: typeof sideInclude }>;

/**
 * Evidence across a student's analysed games. Who may look: the student, an
 * admin, or a coach of one of the student's live batches — the same rule as
 * progress and activity history (`assertCanViewStudent`).
 */
@Injectable()
export class GameInsightsService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async mine(accessToken: string | undefined): Promise<StudentGameInsights> {
    const user = await this.auth(accessToken);
    if (user.role !== UserRole.STUDENT) throw new ForbiddenException('Game insights are for students.');
    return this.build(user.id);
  }

  async forStudent(accessToken: string | undefined, studentId: string): Promise<StudentGameInsights> {
    const user = await this.auth(accessToken);
    await assertCanViewStudent(this.prisma, user, studentId);
    return this.build(studentId);
  }

  async gamesMine(accessToken: string | undefined, query: Record<string, unknown>): Promise<AnalysedGameListResponse> {
    const user = await this.auth(accessToken);
    if (user.role !== UserRole.STUDENT) throw new ForbiddenException('Game insights are for students.');
    return this.list(user.id, query);
  }

  async games(accessToken: string | undefined, studentId: string, query: Record<string, unknown>): Promise<AnalysedGameListResponse> {
    const user = await this.auth(accessToken);
    await assertCanViewStudent(this.prisma, user, studentId);
    return this.list(studentId, query);
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async build(studentId: string): Promise<StudentGameInsights> {
    const rows = await this.prisma.gameAnalysisSide.findMany({
      include: sideInclude,
      orderBy: { playedAt: 'desc' },
      take: INSIGHT_ROW_LIMIT,
      where: { analysis: { status: { in: FINISHED } }, playerId: studentId },
    });
    return aggregateInsights(studentId, rows.map(toInsightRow));
  }

  private async list(studentId: string, query: Record<string, unknown>): Promise<AnalysedGameListResponse> {
    const page = Math.max(1, Math.min(10_000, Math.floor(Number(query.page) || 1)));
    const pageSize = Math.max(1, Math.min(50, Math.floor(Number(query.pageSize) || 20)));
    const result = queryEnum(query.result, ANALYSED_GAME_RESULTS, 'result');
    const side = queryEnum(query.side, ['white', 'black'] as const, 'side');
    const where: Prisma.GameAnalysisSideWhereInput = {
      analysis: { status: { in: FINISHED } },
      playerId: studentId,
      ...(result ? { result } : {}),
      ...(side ? { side: side === 'white' ? GameAnalysisSideColor.WHITE : GameAnalysisSideColor.BLACK } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.gameAnalysisSide.findMany({
        include: sideInclude,
        orderBy: { playedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        where,
      }),
      this.prisma.gameAnalysisSide.count({ where }),
    ]);
    return { items: rows.map(toListItem), page, pageSize, total };
  }

  private async auth(accessToken: string | undefined) {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }
}

function toInsightRow(r: SideRow): InsightRow {
  return {
    accuracy: r.accuracy,
    accuracyVersion: r.accuracyVersion,
    analysisCreatedAt: r.analysis.createdAt,
    analysisId: r.analysisId,
    classificationVersion: r.classificationVersion,
    clock: (r.clockJson as ClockStats | null) ?? null,
    counts: r.countsJson as Record<MoveClassification, number>,
    depth: r.analysis.depth,
    eco: r.eco,
    gameId: r.analysis.gameId,
    openingName: r.openingName,
    phases: r.phasesJson as Record<GamePhase, PhaseStats>,
    playedAt: r.playedAt,
    rating: r.rating,
    result: r.result,
    side: r.side === GameAnalysisSideColor.WHITE ? 'white' : 'black',
    sourceKey: r.externalProvider ?? r.source,
    tactics: r.tacticsJson as Partial<Record<TacticMotif, MotifStats>>,
    tacticsVersion: r.tacticsVersion,
  };
}

function toListItem(r: SideRow): AnalysedGameItem {
  const counts = r.countsJson as Record<MoveClassification, number>;
  const tactics = r.tacticsJson as Partial<Record<TacticMotif, MotifStats>>;
  const side = r.side === GameAnalysisSideColor.WHITE ? 'white' : 'black';
  const errors = (keys: MoveClassification[]) => keys.reduce((a, k) => a + (counts[k] ?? 0), 0);
  return {
    accuracy: r.accuracy,
    analysisId: r.analysisId,
    blunders: errors(['BLUNDER', 'MISSED_MATE', 'MATE_ALLOWED']),
    depth: r.analysis.depth,
    gameId: r.analysis.gameId,
    missedTactics: Object.values(tactics).reduce((a, s) => a + (s?.missed ?? 0), 0),
    mistakes: errors([...ERROR_CLASSES].filter((c) => !['BLUNDER', 'MISSED_MATE', 'MATE_ALLOWED'].includes(c))),
    openingName: r.openingName,
    opponentName: side === 'white' ? r.analysis.game.blackName : r.analysis.game.whiteName,
    playedAt: r.playedAt.toISOString(),
    result: (['WIN', 'LOSS', 'DRAW'].includes(r.result) ? r.result : 'UNKNOWN') as AnalysedGameItem['result'],
    side,
    source: r.externalProvider ?? r.source,
    status: r.analysis.status,
    timeControl: r.timeControl,
    title: r.analysis.game.title,
  };
}
