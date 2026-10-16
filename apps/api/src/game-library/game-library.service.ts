import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  CHESS_GAME_RESULTS,
  lineThroughPath,
  moveTreeHasVariations,
  moveTreeToPgn,
  parsePgnToMoveTree,
  PgnParseError,
  STANDARD_START_FEN,
  type ChessGameResult,
  type GameLibraryDetail,
  type GameLibraryFilterOptions,
  type GameLibraryItem,
  type GameLibraryListResponse,
  type GameLibraryQuery,
  type ImportGameRequest,
  type ParsedPgnGame,
  type SaveGameAnalysisRequest,
} from "@nexa-chess/types";
import { ChessGameSource, ChessGameStatus, Prisma, UserRole } from "@prisma/client";
import { authenticateUser, isAdminRole } from "../auth/authenticate";
import { createMoveTreeChess } from "../common/chess/move-tree-chess";
import { zonedDayBounds } from "../common/time";
import { PrismaService } from "../prisma/prisma.service";

type Actor = { id: string; role: UserRole; timezone: string | null };

const itemInclude = {
  batch: { select: { name: true } },
  class: { select: { coachId: true, title: true, topic: true } },
  createdBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.ChessGameInclude;

type GameRow = Prisma.ChessGameGetPayload<{ include: typeof itemInclude }>;

const isResult = (value: string): value is ChessGameResult =>
  (CHESS_GAME_RESULTS as readonly string[]).includes(value);

/**
 * Game Library. Who sees a game:
 *  - admins: every game;
 *  - a coach: games they imported or played, games of classes they teach, and
 *    games of batches they coach;
 *  - a student: games they played (match / simul), and the class-board games
 *    of classes they actually attended — never another student's games.
 * Only staff and coaches with access may save analysis; only an importer (or
 * an admin) may delete, and only an import.
 */
@Injectable()
export class GameLibraryService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async list(accessToken: string | undefined, query: GameLibraryQuery): Promise<GameLibraryListResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    const where = this.listWhere(user, query);
    const [rows, total] = await Promise.all([
      this.prisma.chessGame.findMany({
        include: itemInclude,
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
      }),
      this.prisma.chessGame.count({ where }),
    ]);
    return { items: rows.map((row) => this.toItem(row)), page: query.page, pageSize: query.pageSize, total };
  }

  async filterOptions(accessToken: string | undefined): Promise<GameLibraryFilterOptions> {
    const user = await this.getAuthenticatedUser(accessToken);
    const where = this.visibilityWhere(user);
    const [batchGroups, whiteGroups, blackGroups] = await Promise.all([
      this.prisma.chessGame.groupBy({ by: ["batchId"], where: { ...where, batchId: { not: null } } }),
      this.prisma.chessGame.groupBy({ by: ["whitePlayerId"], where: { ...where, whitePlayerId: { not: null } } }),
      this.prisma.chessGame.groupBy({ by: ["blackPlayerId"], where: { ...where, blackPlayerId: { not: null } } }),
    ]);
    const batchIds = batchGroups.map((g) => g.batchId).filter((id): id is string => !!id);
    const batches = batchIds.length
      ? await this.prisma.batch.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true },
          where: { id: { in: batchIds } },
        })
      : [];

    // A student filters nothing by student; staff pick from the players and
    // the rosters of the batches they can see.
    if (user.role === UserRole.STUDENT) return { batches, students: [] };
    const playerIds = [
      ...whiteGroups.map((g) => g.whitePlayerId),
      ...blackGroups.map((g) => g.blackPlayerId),
    ].filter((id): id is string => !!id);
    const students = await this.prisma.user.findMany({
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { firstName: true, id: true, lastName: true },
      take: 500,
      where: {
        OR: [
          { id: { in: playerIds } },
          ...(batchIds.length
            ? [{ studentBatches: { some: { batchId: { in: batchIds }, isDeleted: false } } }]
            : []),
        ],
        role: UserRole.STUDENT,
      },
    });
    return {
      batches,
      students: students.map((s) => ({ id: s.id, name: [s.firstName, s.lastName].filter(Boolean).join(" ") })),
    };
  }

  async get(accessToken: string | undefined, id: string): Promise<GameLibraryDetail> {
    const user = await this.getAuthenticatedUser(accessToken);
    const row = await this.findVisible(user, id);
    return this.toDetail(row, user, await this.coachManages(user, row));
  }

  /** Coach / admin: one game from a PGN (first game of the file), variations included. */
  async importGame(accessToken: string | undefined, dto: ImportGameRequest): Promise<GameLibraryDetail> {
    const user = await this.getAuthenticatedUser(accessToken);
    if (user.role === UserRole.STUDENT) throw new ForbiddenException("Only coaches and admins can import games.");
    if (dto.batchId && !isAdminRole(user.role)) {
      const coaches = await this.prisma.batchCoach.findFirst({
        select: { id: true },
        where: { batchId: dto.batchId, coachId: user.id, isDeleted: false },
      });
      if (!coaches) throw new ForbiddenException("You don't coach that batch.");
    }
    const parsed = this.parse(dto.pgn);
    const mainline = lineThroughPath(parsed.tree, []).nodes;
    // A set-up position with no moves yet (the PDF diagram import's "open on the
    // analysis board") is a valid start; an empty game from the opening is not.
    if (mainline.length === 0 && parsed.tree.rootFen === STANDARD_START_FEN) {
      throw new BadRequestException("That PGN has no moves.");
    }

    const white = parsed.headers.White?.trim() || "White";
    const black = parsed.headers.Black?.trim() || "Black";
    const result = parsed.result;
    const headers = { ...parsed.headers, Result: result };
    const startedAt = this.headerDate(parsed.headers.Date) ?? new Date();
    const row = await this.prisma.chessGame.create({
      data: {
        batchId: dto.batchId || null,
        blackName: black.slice(0, 100),
        createdById: user.id,
        endedAt: result === "*" ? null : startedAt,
        hasVariations: moveTreeHasVariations(parsed.tree),
        moveCount: mainline.length,
        pgn: moveTreeToPgn(parsed.tree, headers),
        result,
        source: ChessGameSource.IMPORT,
        startFen: parsed.tree.rootFen,
        startedAt,
        status: ChessGameStatus.COMPLETED,
        termination: parsed.headers.Termination?.slice(0, 100) || null,
        title: (dto.title?.trim() || parsed.headers.Event?.trim() || `${white} vs ${black}`).slice(0, 200),
        whiteName: white.slice(0, 100),
      },
      include: itemInclude,
    });
    return this.toDetail(row, user, true);
  }

  /**
   * Saves a coach's analysis: the whole tree (variations, a promoted mainline,
   * comments). Rejected while a live game is still being played (its moves are
   * still arriving) and on a stale `version` (someone else saved first).
   */
  async saveAnalysis(
    accessToken: string | undefined,
    id: string,
    dto: SaveGameAnalysisRequest,
  ): Promise<GameLibraryDetail> {
    const user = await this.getAuthenticatedUser(accessToken);
    const row = await this.findVisible(user, id);
    if (!(await this.canEdit(user, row))) {
      throw new ForbiddenException("Only the coach of this game can save analysis.");
    }
    if (row.status !== ChessGameStatus.COMPLETED) {
      throw new ConflictException("This game is still being played — save analysis once it has finished.");
    }
    const parsed = this.parse(dto.pgn);
    if (parsed.tree.rootFen !== row.startFen) {
      throw new BadRequestException("The analysis must start from this game's starting position.");
    }
    const mainline = lineThroughPath(parsed.tree, []).nodes;
    // The game's own facts (players, result) are not the editor's to change.
    const original = this.headersOf(row.pgn);
    const headers = { ...original, Result: isResult(row.result) ? row.result : "*" };
    const updated = await this.prisma.chessGame.updateMany({
      data: {
        hasVariations: moveTreeHasVariations(parsed.tree),
        moveCount: mainline.length,
        pgn: moveTreeToPgn(parsed.tree, headers),
        version: { increment: 1 },
      },
      where: { id: row.id, version: dto.version },
    });
    if (updated.count === 0) {
      throw new ConflictException("This game was changed by someone else. Reload it to see their changes.");
    }
    return this.get(accessToken, id);
  }

  async remove(accessToken: string | undefined, id: string): Promise<{ id: string }> {
    const user = await this.getAuthenticatedUser(accessToken);
    const row = await this.findVisible(user, id);
    if (!this.canDelete(user, row)) {
      throw new ForbiddenException("Only an imported game can be deleted, by whoever imported it or an admin.");
    }
    await this.prisma.chessGame.delete({ where: { id: row.id } });
    return { id: row.id };
  }

  // ── access ────────────────────────────────────────────────────────────────

  private visibilityWhere(user: Actor): Prisma.ChessGameWhereInput {
    if (isAdminRole(user.role)) return {};
    if (user.role === UserRole.COACH) {
      return {
        OR: [
          { createdById: user.id },
          { whitePlayerId: user.id },
          { blackPlayerId: user.id },
          { class: { coachId: user.id } },
          { batch: { coaches: { some: { coachId: user.id, isDeleted: false } } } },
        ],
      };
    }
    return {
      OR: [
        { whitePlayerId: user.id },
        { blackPlayerId: user.id },
        this.attendedBoardGames(user.id),
      ],
    };
  }

  private attendedBoardGames(studentId: string): Prisma.ChessGameWhereInput {
    return {
      class: { attendances: { some: { status: { not: "ABSENT" }, studentId } } },
      source: ChessGameSource.LIVE_BOARD,
    };
  }

  private listWhere(user: Actor, query: GameLibraryQuery): Prisma.ChessGameWhereInput {
    const and: Prisma.ChessGameWhereInput[] = [this.visibilityWhere(user)];
    if (query.q) {
      const contains = { contains: query.q, mode: "insensitive" as const };
      and.push({ OR: [{ title: contains }, { whiteName: contains }, { blackName: contains }] });
    }
    if (query.studentId) {
      and.push({
        OR: [
          { whitePlayerId: query.studentId },
          { blackPlayerId: query.studentId },
          this.attendedBoardGames(query.studentId),
        ],
      });
    }
    if (query.batchId) and.push({ batchId: query.batchId });
    if (query.classId) and.push({ classId: query.classId });
    if (query.source) and.push({ source: query.source });
    if (query.status) and.push({ status: query.status });
    if (query.result) and.push({ result: query.result });
    if (query.from || query.to) {
      const startedAt: Prisma.DateTimeFilter = {};
      // Calendar days in the caller's own zone (noon UTC lands on the asked day).
      if (query.from) startedAt.gte = zonedDayBounds(user.timezone, new Date(`${query.from}T12:00:00Z`)).start;
      if (query.to) startedAt.lt = zonedDayBounds(user.timezone, new Date(`${query.to}T12:00:00Z`)).end;
      and.push({ startedAt });
    }
    return { AND: and };
  }

  private async findVisible(user: Actor, id: string): Promise<GameRow> {
    const row = await this.prisma.chessGame.findFirst({
      include: itemInclude,
      where: { AND: [{ id }, this.visibilityWhere(user)] },
    });
    // Not "forbidden": a game the caller can't see doesn't exist for them.
    if (!row) throw new NotFoundException("Game not found.");
    return row;
  }

  /** The caller teaches this game (imported it, its class, or its batch). */
  private async coachManages(user: Actor, row: GameRow): Promise<boolean> {
    if (isAdminRole(user.role)) return true;
    if (user.role !== UserRole.COACH) return false;
    if (row.createdById === user.id || row.class?.coachId === user.id) return true;
    if (row.whitePlayerId === user.id || row.blackPlayerId === user.id) return true;
    if (!row.batchId) return false;
    const coach = await this.prisma.batchCoach.findFirst({
      select: { id: true },
      where: { batchId: row.batchId, coachId: user.id, isDeleted: false },
    });
    return !!coach;
  }

  private async canEdit(user: Actor, row: GameRow): Promise<boolean> {
    return this.coachManages(user, row);
  }

  private canDelete(user: Actor, row: { source: ChessGameSource; createdById: string | null }): boolean {
    if (row.source !== ChessGameSource.IMPORT) return false;
    return isAdminRole(user.role) || row.createdById === user.id;
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private parse(pgn: string): ParsedPgnGame {
    try {
      return parsePgnToMoveTree(pgn, createMoveTreeChess);
    } catch (err) {
      if (err instanceof PgnParseError) throw new BadRequestException(err.message);
      throw new BadRequestException("That PGN could not be read.");
    }
  }

  private headersOf(pgn: string): Record<string, string> {
    try {
      return parsePgnToMoveTree(pgn, createMoveTreeChess).headers;
    } catch {
      return {};
    }
  }

  /** PGN "2026.10.15" (unknown parts as "??") → a Date at UTC noon, else null. */
  private headerDate(value: string | undefined): Date | null {
    const match = value ? /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(value.trim()) : null;
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
    return Number.isNaN(date.getTime()) || date.getTime() > Date.now() + 86_400_000 ? null : date;
  }

  private toItem(row: GameRow): GameLibraryItem {
    return {
      batchId: row.batchId,
      batchName: row.batch?.name ?? null,
      blackName: row.blackName,
      blackPlayerId: row.blackPlayerId,
      classId: row.classId,
      classTitle: row.class ? row.class.title || row.class.topic || null : null,
      endedAt: row.endedAt?.toISOString() ?? null,
      hasVariations: row.hasVariations,
      id: row.id,
      moveCount: row.moveCount,
      result: isResult(row.result) ? row.result : "*",
      source: row.source,
      startedAt: row.startedAt.toISOString(),
      status: row.status,
      termination: row.termination,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
      whiteName: row.whiteName,
      whitePlayerId: row.whitePlayerId,
    };
  }

  private toDetail(row: GameRow, user: Actor, manages: boolean): GameLibraryDetail {
    return {
      ...this.toItem(row),
      canDelete: this.canDelete(user, row),
      canEdit: manages,
      createdByName: row.createdBy ? [row.createdBy.firstName, row.createdBy.lastName].filter(Boolean).join(" ") : null,
      pgn: row.pgn,
      startFen: row.startFen,
      version: row.version,
    };
  }

  private async getAuthenticatedUser(accessToken: string | undefined): Promise<Actor> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    return { id: user.id, role: user.role, timezone: user.timezone };
  }
}
