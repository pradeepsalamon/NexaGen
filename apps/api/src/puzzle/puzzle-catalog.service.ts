import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  CATALOG_MAX_PAGE_SIZE,
  GAME_ANALYSIS_FOLDER_SLUG,
  LICHESS_FOLDER_SLUG,
  LICHESS_THEMES,
  LIVE_CLASS_FOLDER_SLUG,
  isLichessFolder,
  lichessThemeLabel,
  type CatalogAdoptRequest,
  type CatalogAdoptResponse,
  type CatalogAdoptResult,
  type CatalogInLibrary,
  type CatalogListQuery,
  type CatalogListResponse,
  type CatalogMaterialiseRequest,
  type CatalogMaterialiseResponse,
  type CatalogPreviewResponse,
  type CatalogPuzzleSummary,
  type SolutionMove
} from "@nexa-chess/types";
import {
  Prisma,
  PuzzleDifficulty,
  PuzzleSource,
  PuzzleStatus,
  PuzzleType,
  PuzzleVisibility,
  UserRole,
  type LichessPuzzle,
  type User
} from "@prisma/client";
import { Chess } from "../common/chess/chess";
import {
  AssignmentEvaluationService,
  assertValidFen
} from "../assignment/assignment-evaluation.service";
import { PrismaService } from "../prisma/prisma.service";
import { TrashRepository } from "../trash/trash.repository";
import { puzzleContentHash } from "./puzzle-content-hash";
import {
  assertAdmin,
  assertStaffOrCoach,
  authenticateUser,
  isAdminRole
} from "./puzzle-auth.helper";

// ──────────────────────────────────────────────────────────────
// Lichess catalogue: browse, preview, materialise, adopt
// (docs/PUZZLE_CATALOGUE_IMPLEMENTATION_SPEC.md §3, §4, §6, §11)
// ──────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 24;
const RATING_FLOOR = 0;
const RATING_CEILING = 4000;
/** §6 guard: a browse that can't answer in this long is a "narrow the filters". */
const STATEMENT_TIMEOUT = "3s";

/** The catalogue columns a browse page reads (no solution is sent on). */
type CatalogRow = Pick<
  LichessPuzzle,
  "id" | "fen" | "moves" | "rating" | "popularity" | "nbPlays" | "themes" | "openingTags" | "ratingBand" | "randKey"
>;

type Cursor = { band: number; randKey: number; id: string };
type RatingCursor = { rating: number; id: string };

/** The bits of a `puzzles` copy the materialise/adopt paths branch on. */
const copySelect = {
  id: true,
  title: true,
  topicId: true,
  status: true,
  contentHash: true,
  isDeleted: true,
  topic: { select: { name: true, slug: true } }
} satisfies Prisma.PuzzleSelect;
type CopyRow = Prisma.PuzzleGetPayload<{ select: typeof copySelect }>;

export type MaterialiseResult =
  | { outcome: "CREATED" | "EXISTING"; puzzle: CopyRow }
  | { outcome: "IN_TRASH"; puzzleId: string }
  | { outcome: "NOT_FOUND" }
  | { outcome: "INVALID"; message: string };

type Placement = {
  /** Resolved only when a copy is actually created. */
  topicId: () => Promise<string>;
  /** The adopting admin; null when materialised for a share or for training. */
  createdBy: User | null;
};

// ── The §3 transform (pure) ──

/** Midpoints of PUZZLE_DIFFICULTY_RATINGS. */
export function difficultyForRating(rating: number): PuzzleDifficulty {
  if (rating < 900) return PuzzleDifficulty.BEGINNER;
  if (rating < 1150) return PuzzleDifficulty.EASY;
  if (rating < 1450) return PuzzleDifficulty.INTERMEDIATE;
  if (rating < 1750) return PuzzleDifficulty.ADVANCED;
  return PuzzleDifficulty.EXPERT;
}

const MATE_KEYS = new Set(LICHESS_THEMES.filter((t) => t.group === "mate").map((t) => t.key).concat("mate"));

export function puzzleTypeForThemes(themes: readonly string[]): PuzzleType {
  if (themes.some((key) => MATE_KEYS.has(key))) return PuzzleType.CHECKMATE;
  if (themes.some((key) => key === "endgame" || key.endsWith("Endgame"))) return PuzzleType.ENDGAME;
  if (themes.includes("opening")) return PuzzleType.OPENING;
  return PuzzleType.TACTICAL;
}

/** "Fork · 1450": the highest-priority mate/motif theme, else "Puzzle". */
export function catalogPuzzleTitle(themes: readonly string[], rating: number): string {
  const primary = LICHESS_THEMES.find(
    (t) => (t.group === "mate" || t.group === "motif") && themes.includes(t.key)
  );
  return `${primary ? lichessThemeLabel(primary.key) : "Puzzle"} · ${rating}`;
}

function applyUci(chess: Chess, uci: string) {
  return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined });
}

/**
 * The content of a `puzzles` copy of a catalogue row, without its placement.
 * Throws (BadRequestException) when the position or line doesn't replay.
 */
export function buildLichessPuzzleCopy(
  row: Pick<LichessPuzzle, "id" | "fen" | "moves" | "rating" | "themes">,
  evaluation: Pick<AssignmentEvaluationService, "normalizeSolution">
) {
  const [setupMoveUci, ...line] = row.moves.split(" ").filter(Boolean);
  if (!setupMoveUci || line.length === 0) {
    throw new BadRequestException(`Lichess puzzle ${row.id} has no solution line.`);
  }
  const chess = new Chess(assertValidFen(row.fen));
  try {
    applyUci(chess, setupMoveUci);
  } catch {
    throw new BadRequestException(`Lichess puzzle ${row.id}: the setup move is not legal.`);
  }
  const fen = chess.fen();
  const solution = evaluation.normalizeSolution(
    fen,
    line.map((uci) => ({ uci, san: "" }))
  );
  return {
    title: catalogPuzzleTitle(row.themes, row.rating),
    description: null,
    puzzleType: puzzleTypeForThemes(row.themes),
    difficulty: difficultyForRating(row.rating),
    fen,
    setupMoveUci,
    solutionMovesJson: solution as unknown as Prisma.InputJsonValue,
    contentHash: puzzleContentHash(fen, solution),
    rating: row.rating,
    explanation: null,
    hintsJson: [] as Prisma.InputJsonValue,
    tags: row.themes,
    estimatedSeconds: null,
    status: PuzzleStatus.PUBLISHED,
    visibility: PuzzleVisibility.GLOBAL,
    source: PuzzleSource.LICHESS,
    sourceId: row.id
  } satisfies Partial<Prisma.PuzzleUncheckedCreateInput>;
}

// ── Cursor ──

export function encodeCatalogCursor(cursor: Cursor): string {
  return `${cursor.band}.${cursor.randKey}.${cursor.id}`;
}

export function decodeCatalogCursor(raw: string): Cursor {
  const match = /^(\d{1,3})\.(\d{1,10})\.([A-Za-z0-9]{0,16})$/.exec(raw);
  if (!match) throw new BadRequestException("Invalid catalogue cursor.");
  return { band: Number(match[1]), randKey: Number(match[2]), id: match[3] };
}

/** The `rating_asc` / `rating_desc` keyset: the last row's rating and id. Distinct from a walk cursor. */
export function encodeCatalogRatingCursor(cursor: RatingCursor): string {
  return `r.${cursor.rating}.${cursor.id}`;
}

export function decodeCatalogRatingCursor(raw: string): RatingCursor {
  const match = /^r\.(\d{1,4})\.([A-Za-z0-9]{1,16})$/.exec(raw);
  if (!match) throw new BadRequestException("Invalid catalogue cursor.");
  return { rating: Number(match[1]), id: match[2] };
}

/** Folder names to try, in order, if an admin's own folder already has one. */
const LICHESS_FOLDER_NAMES = ["Lichess", "Lichess catalogue", "Lichess catalogue (system)"];
const LIVE_CLASS_FOLDER_NAMES = ["Asked in class", "Asked in class (system)"];

/** P2002, optionally only when `field` is part of the violated key. */
function isUniqueViolation(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  if (!field) return true;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  return Array.isArray(target) ? target.includes(field) : String(target ?? "").includes(field);
}

function isStatementTimeout(error: unknown): boolean {
  const e = error as { code?: string; meta?: { code?: string }; message?: string } | null;
  return e?.meta?.code === "57014" || /statement timeout/i.test(e?.message ?? "");
}

@Injectable()
export class PuzzleCatalogService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly trash: TrashRepository,
    private readonly evaluation: AssignmentEvaluationService
  ) {}

  /**
   * §6 browse: keyset paging, no totals, no solution. `shuffle` (the default)
   * walks `lichess_puzzles_walk_idx`; `rating_asc` / `rating_desc` walk
   * `lichess_puzzles_rating_idx` by exact rating, then id — a total order, so
   * pages never repeat or skip a row and the whole window is sorted, not just a page.
   */
  async list(accessToken: string | undefined, query: CatalogListQuery): Promise<CatalogListResponse> {
    const user = assertStaffOrCoach(await authenticateUser(this.jwtService, this.prisma, accessToken));

    const lo = query.ratingMin ?? RATING_FLOOR;
    const hi = query.ratingMax ?? RATING_CEILING;
    if (lo > hi) throw new BadRequestException("The minimum rating is above the maximum.");
    const pageSize = Math.min(CATALOG_MAX_PAGE_SIZE, query.pageSize ?? DEFAULT_PAGE_SIZE);
    const sort = query.sort ?? "shuffle";

    const themes = query.themes ?? [];
    const filters: Prisma.Sql[] = [Prisma.sql`rating BETWEEN ${lo}::smallint AND ${hi}::smallint`];
    let orderBy: Prisma.Sql;
    if (sort === "shuffle") {
      const loBand = Math.floor(lo / 50);
      const hiBand = Math.floor(hi / 50);
      const cursor = query.cursor
        ? decodeCatalogCursor(query.cursor)
        : { band: loBand, randKey: query.seed ?? 0, id: "" };
      filters.push(
        Prisma.sql`"ratingBand" BETWEEN ${loBand}::smallint AND ${hiBand}::smallint`,
        Prisma.sql`("ratingBand", "randKey", id) > (${cursor.band}::smallint, ${cursor.randKey}::int, ${cursor.id}::text)`
      );
      orderBy = Prisma.sql`ORDER BY "ratingBand", "randKey", id`;
    } else {
      const cursor = query.cursor ? decodeCatalogRatingCursor(query.cursor) : null;
      const descending = sort === "rating_desc";
      if (cursor) {
        filters.push(
          descending
            ? Prisma.sql`(rating, id) < (${cursor.rating}::smallint, ${cursor.id}::text)`
            : Prisma.sql`(rating, id) > (${cursor.rating}::smallint, ${cursor.id}::text)`
        );
      }
      orderBy = descending ? Prisma.sql`ORDER BY rating DESC, id DESC` : Prisma.sql`ORDER BY rating, id`;
    }
    // Below-gate rows (low confidence, duplicates, retired) are an admin's call.
    if (!(query.includeBelowGate && isAdminRole(user.role))) filters.push(Prisma.sql`"passesQualityGate"`);
    if (themes.length > 0) {
      filters.push(
        query.themeMode === "all"
          ? Prisma.sql`themes @> ${themes}::text[]`
          : Prisma.sql`themes && ${themes}::text[]`
      );
    }
    if (query.opening) filters.push(Prisma.sql`"openingTags" @> ARRAY[${query.opening}]::text[]`);

    let rows: CatalogRow[];
    try {
      rows = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
        // Prisma prepares every statement; after five runs Postgres may switch
        // to a generic plan that can't see the band bounds and walks the wrong
        // index. The §16 benchmarks only met their targets with custom plans.
        await tx.$executeRawUnsafe(`SET LOCAL plan_cache_mode = force_custom_plan`);
        return tx.$queryRaw<CatalogRow[]>`
          SELECT id, fen, moves, rating, popularity, "nbPlays", themes, "openingTags", "ratingBand", "randKey"
          FROM lichess_puzzles
          WHERE ${Prisma.join(filters, " AND ")}
          ${orderBy}
          LIMIT ${pageSize + 1}`;
      });
    } catch (error) {
      if (isStatementTimeout(error)) return { puzzles: [], nextCursor: null, hasMore: false, timedOut: true };
      throw error;
    }

    const hasMore = rows.length > pageSize;
    const page = rows.slice(0, pageSize);
    const last = page[page.length - 1];
    const inLibrary = await this.inLibrary(page.map((row) => row.id));
    const nextCursor =
      hasMore && last
        ? sort === "shuffle"
          ? encodeCatalogCursor({ band: last.ratingBand, randKey: last.randKey, id: last.id })
          : encodeCatalogRatingCursor({ rating: last.rating, id: last.id })
        : null;
    return {
      puzzles: page.map((row) => this.toSummary(row, inLibrary.get(row.id) ?? null)),
      nextCursor,
      hasMore,
      timedOut: false
    };
  }

  /** The only catalogue route that returns a solution. Staff and coaches only. */
  async preview(accessToken: string | undefined, sourceId: string): Promise<CatalogPreviewResponse> {
    assertStaffOrCoach(await authenticateUser(this.jwtService, this.prisma, accessToken));
    const row = await this.prisma.lichessPuzzle.findUnique({ where: { id: sourceId } });
    if (!row) throw new NotFoundException("Catalogue puzzle not found.");
    const summary = this.toSummary(row, (await this.inLibrary([row.id])).get(row.id) ?? null);
    const line = row.moves.split(" ").filter(Boolean).slice(1);
    const solutionMoves: SolutionMove[] = this.evaluation.normalizeSolution(
      summary.postSetupFen,
      line.map((uci) => ({ uci, san: "" }))
    );
    return { puzzle: { ...summary, solutionMoves, gameUrl: row.gameUrl } };
  }

  /** A share or a homework copy: lands in the hidden "Lichess" folder. */
  async materialiseOne(
    accessToken: string | undefined,
    dto: CatalogMaterialiseRequest
  ): Promise<CatalogMaterialiseResponse> {
    const user = assertStaffOrCoach(await authenticateUser(this.jwtService, this.prisma, accessToken));
    const result = await this.materialise(dto.sourceId, {
      topicId: () => this.ensureLichessFolder(user.id),
      createdBy: null
    });
    switch (result.outcome) {
      case "NOT_FOUND":
        throw new NotFoundException("Catalogue puzzle not found.");
      case "INVALID":
        throw new BadRequestException(result.message);
      case "IN_TRASH":
        throw new ConflictException("This puzzle is in the Trash — restore it first.");
      default:
        if (result.puzzle.status !== PuzzleStatus.PUBLISHED) {
          throw new ConflictException(
            result.puzzle.status === PuzzleStatus.ARCHIVED
              ? "This puzzle is archived in the library."
              : "This puzzle is an unpublished draft in the library."
          );
        }
        return { puzzleId: result.puzzle.id };
    }
  }

  /** Admin curation: copy (or move out of the system folder) into a real folder. */
  async adopt(accessToken: string | undefined, dto: CatalogAdoptRequest): Promise<CatalogAdoptResponse> {
    const user = assertAdmin(await authenticateUser(this.jwtService, this.prisma, accessToken));
    const topic = await this.prisma.puzzleTopic.findUnique({ where: { id: dto.topicId } });
    if (!topic) throw new BadRequestException("The selected folder does not exist.");
    if (isLichessFolder(topic)) {
      throw new BadRequestException("Choose one of your own folders — the Lichess folder holds unreviewed copies.");
    }

    let adopted = 0;
    let moved = 0;
    const results: CatalogAdoptResult[] = [];
    const placed = new Map<string, CopyRow>(); // sourceId → copy now in `topic`

    for (const sourceId of [...new Set(dto.sourceIds)]) {
      const result = await this.materialise(sourceId, {
        topicId: async () => topic.id,
        createdBy: user
      });
      if (result.outcome === "NOT_FOUND" || result.outcome === "INVALID") {
        results.push({ sourceId, puzzleId: null, outcome: result.outcome });
        continue;
      }
      if (result.outcome === "IN_TRASH") {
        results.push({ sourceId, puzzleId: result.puzzleId, outcome: "IN_TRASH" });
        continue;
      }
      const copy = result.puzzle;
      if (result.outcome === "CREATED") {
        adopted += 1;
        placed.set(sourceId, copy);
        results.push({ sourceId, puzzleId: copy.id, outcome: "CREATED" });
      } else if (!isLichessFolder(copy.topic)) {
        // Already curated (here or elsewhere): never moved between real folders.
        results.push({ sourceId, puzzleId: copy.id, outcome: "ALREADY_IN_FOLDER", topicName: copy.topic.name });
      } else if (copy.status !== PuzzleStatus.PUBLISHED) {
        results.push({ sourceId, puzzleId: copy.id, outcome: "NOT_PUBLISHED" });
      } else {
        await this.prisma.puzzle.update({
          where: { id: copy.id },
          data: { topicId: topic.id, updatedById: user.id }
        });
        moved += 1;
        placed.set(sourceId, copy);
        results.push({ sourceId, puzzleId: copy.id, outcome: "MOVED" });
      }
    }

    // "Same puzzle already in library" — a warning, never a block (§1).
    const duplicates = await this.findContentDuplicates([...placed.values()]);
    for (const result of results) {
      const copy = placed.get(result.sourceId);
      const duplicate = copy && duplicates.get(copy.id);
      if (duplicate) result.duplicateOf = duplicate;
    }
    return { adopted, moved, results };
  }

  /**
   * §4: the ONE way a catalogue puzzle becomes a `puzzles` row, so there is at
   * most one copy per Lichess id. An existing copy is returned as it stands —
   * the caller decides whether to move it.
   */
  async materialise(sourceId: string, placement: Placement, retried = false): Promise<MaterialiseResult> {
    // Uniqueness spans soft-deleted rows, so the pre-check must too (CLAUDE.md §3.4).
    // findFirst, not findUnique: Prisma batches concurrent findUnique calls into
    // one query, so the re-read after a lost race could be answered by a batch
    // that started before the winner committed — and miss the row.
    const existing = await this.prisma.withDeleted.puzzle.findFirst({
      where: { source: PuzzleSource.LICHESS, sourceId },
      select: copySelect
    });
    if (existing) {
      return existing.isDeleted
        ? { outcome: "IN_TRASH", puzzleId: existing.id }
        : { outcome: "EXISTING", puzzle: existing };
    }

    const row = await this.prisma.lichessPuzzle.findUnique({ where: { id: sourceId } });
    if (!row) return { outcome: "NOT_FOUND" };

    let content: ReturnType<typeof buildLichessPuzzleCopy>;
    try {
      content = buildLichessPuzzleCopy(row, this.evaluation);
    } catch (error) {
      return { outcome: "INVALID", message: error instanceof Error ? error.message : "Invalid puzzle." };
    }

    const admin = placement.createdBy;
    // Resolved outside the try: only a lost race on the puzzle itself is a retry.
    const topicId = await placement.topicId();
    try {
      const created = await this.prisma.puzzle.create({
        data: {
          ...content,
          topicId,
          createdById: admin?.id ?? null,
          createdByRole: UserRole.ADMIN,
          updatedById: admin?.id ?? null,
          publishedById: admin?.id ?? null,
          publishedAt: new Date()
        },
        select: copySelect
      });
      return { outcome: "CREATED", puzzle: created };
    } catch (error) {
      // A concurrent materialise won the unique (source, sourceId): use its row.
      if (!retried && isUniqueViolation(error, "sourceId")) {
        return this.materialise(sourceId, placement, true);
      }
      throw error;
    }
  }

  /**
   * The system "Lichess" folder, created on first use. Found by slug across
   * soft-deleted rows; a trashed one is restored rather than duplicated.
   */
  async ensureLichessFolder(actorId: string): Promise<string> {
    return this.ensureSystemFolder(actorId, {
      slug: LICHESS_FOLDER_SLUG,
      names: LICHESS_FOLDER_NAMES,
      description: "Lichess catalogue puzzles shared in class. Hidden from the library until opened."
    });
  }

  /** Where a coach's "share from board" puzzles are kept. Same lifecycle as the Lichess folder. */
  async ensureLiveClassFolder(actorId: string): Promise<string> {
    return this.ensureSystemFolder(actorId, {
      slug: LIVE_CLASS_FOLDER_SLUG,
      names: LIVE_CLASS_FOLDER_NAMES,
      description: "Positions coaches shared from the board during class. Hidden from the library until opened."
    });
  }

  /** Where puzzles built from students' own analysed games live. Same lifecycle as the others. */
  async ensureGameAnalysisFolder(actorId: string): Promise<string> {
    return this.ensureSystemFolder(actorId, {
      slug: GAME_ANALYSIS_FOLDER_SLUG,
      names: ["From students' games", "From students' games (system)"],
      description: "Tactics from students' own analysed games, each visible only to its student. Hidden from the library."
    });
  }

  private async ensureSystemFolder(
    actorId: string,
    folder: { slug: string; names: readonly string[]; description: string }
  ): Promise<string> {
    const find = () =>
      this.prisma.withDeleted.puzzleTopic.findFirst({
        where: { slug: folder.slug },
        orderBy: [{ isDeleted: "asc" }, { createdAt: "asc" }],
        select: { id: true, isDeleted: true }
      });
    const existing = await find();
    if (existing && !existing.isDeleted) return existing.id;
    if (existing) {
      await this.trash.restore("PuzzleTopic", existing.id, actorId);
      return existing.id;
    }

    // Live topic slugs and names are unique (partial indexes), so concurrent
    // first uses can't make two folders: the loser re-reads the winner. A
    // name clash with no live system folder means an admin already has a
    // folder with that name, so try the next one.
    for (const name of folder.names) {
      try {
        const created = await this.prisma.puzzleTopic.create({
          data: {
            name,
            slug: folder.slug,
            description: folder.description,
            sortOrder: 1000
          },
          select: { id: true }
        });
        return created.id;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const winner = await this.prisma.puzzleTopic.findFirst({
          where: { slug: folder.slug },
          select: { id: true }
        });
        if (winner) return winner.id;
      }
    }
    throw new ConflictException(
      `Could not create the "${folder.names[0]}" folder — rename the folders with that name.`
    );
  }

  // ── internals ──

  private async inLibrary(sourceIds: string[]): Promise<Map<string, CatalogInLibrary>> {
    if (sourceIds.length === 0) return new Map();
    const copies = await this.prisma.puzzle.findMany({
      where: { source: PuzzleSource.LICHESS, sourceId: { in: sourceIds } },
      select: { id: true, sourceId: true, topic: { select: { name: true, slug: true } } }
    });
    return new Map(
      copies.map((copy) => [
        copy.sourceId as string,
        { puzzleId: copy.id, topicName: copy.topic.name, adopted: !isLichessFolder(copy.topic) }
      ])
    );
  }

  /** copy id → another curated puzzle with the same content, if any. */
  private async findContentDuplicates(copies: CopyRow[]): Promise<Map<string, { puzzleId: string; title: string }>> {
    const hashes = [...new Set(copies.map((c) => c.contentHash).filter((h): h is string => Boolean(h)))];
    if (hashes.length === 0) return new Map();
    const others = await this.prisma.puzzle.findMany({
      where: {
        contentHash: { in: hashes },
        id: { notIn: copies.map((c) => c.id) },
        topic: { slug: { not: LICHESS_FOLDER_SLUG } }
      },
      select: { id: true, title: true, contentHash: true },
      orderBy: { createdAt: "asc" }
    });
    const byHash = new Map<string, { puzzleId: string; title: string }>();
    for (const other of others) {
      if (other.contentHash && !byHash.has(other.contentHash)) {
        byHash.set(other.contentHash, { puzzleId: other.id, title: other.title });
      }
    }
    const out = new Map<string, { puzzleId: string; title: string }>();
    for (const copy of copies) {
      const match = copy.contentHash ? byHash.get(copy.contentHash) : undefined;
      if (match) out.set(copy.id, match);
    }
    return out;
  }

  private toSummary(row: CatalogRow, inLibrary: CatalogInLibrary | null): CatalogPuzzleSummary {
    const chess = new Chess(row.fen);
    const setupUci = row.moves.split(" ")[0] ?? "";
    const setup = applyUci(chess, setupUci);
    return {
      sourceId: row.id,
      fen: row.fen,
      setupMove: { uci: setupUci, san: setup.san },
      postSetupFen: chess.fen(),
      sideToMove: chess.turn() === "w" ? "white" : "black",
      rating: row.rating,
      themes: row.themes,
      openingTags: row.openingTags,
      popularity: row.popularity,
      nbPlays: row.nbPlays,
      inLibrary
    };
  }
}
