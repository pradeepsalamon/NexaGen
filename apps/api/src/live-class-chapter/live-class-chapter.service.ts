import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  liveClassChapterStateSchema,
  MAX_LIVE_CLASS_CHAPTERS,
  type CreateLiveClassChapterRequest,
  type ImportLiveClassChaptersRequest,
  type LiveClassChapter,
  type LiveClassChapterState,
  type LiveClassChaptersResponse,
  type ReorderLiveClassChaptersRequest,
  type UpdateLiveClassChapterRequest
} from "@nexa-chess/types";
import {
  Prisma,
  PuzzleStatus,
  PuzzleVisibility,
  UserRole,
  type LiveClassChapter as ChapterRow
} from "@prisma/client";
import { LiveClassService } from "../live-class/live-class.service";
import { PrismaService } from "../prisma/prisma.service";

type Scope = { batchId: string | null; liveClassId: string | null; scopeKey: string };

/**
 * The coach's chapter list for a live class (Lichess Study-style): saved
 * boards the coach loads onto the shared board or asks the class about.
 * Coach-owner/admin only — a saved line may hold a puzzle's answer, and
 * students never see the list. Chapters belong to the batch, so they carry
 * over from one class to the next; a class without a batch keeps its own.
 */
@Injectable()
export class LiveClassChapterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly liveClass: LiveClassService
  ) {}

  async list(accessToken: string | undefined, classId: string): Promise<LiveClassChaptersResponse> {
    const { liveSession } = await this.liveClass.resolveClassManager(accessToken, classId);
    return this.respond(this.scopeOf(liveSession));
  }

  async create(
    accessToken: string | undefined,
    classId: string,
    body: CreateLiveClassChapterRequest
  ): Promise<LiveClassChaptersResponse> {
    const { user, liveSession } = await this.liveClass.resolveClassManager(accessToken, classId);
    const scope = this.scopeOf(liveSession);

    // A retried create (lost response, double click) finds its own row.
    const existing = await this.prisma.liveClassChapter.findUnique({
      where: { scopeKey_clientId: { clientId: body.clientId, scopeKey: scope.scopeKey } }
    });
    if (existing) return this.respond(scope);

    const count = await this.prisma.liveClassChapter.count({ where: { scopeKey: scope.scopeKey } });
    this.assertRoom(count, 1);
    try {
      await this.prisma.liveClassChapter.create({
        data: {
          ...scope,
          clientId: body.clientId,
          createdById: user.id,
          position: count,
          puzzleId: body.puzzleId ?? null,
          state: body.state as Prisma.InputJsonValue,
          title: body.title,
          updatedById: user.id
        }
      });
    } catch (error) {
      // The same clientId raced past the lookup: the other request created it.
      if (!this.isUniqueViolation(error)) throw error;
    }
    return this.respond(scope);
  }

  /** Adds library puzzles the caller can see, in the order given; a puzzle already in the list is skipped. */
  async importPuzzles(
    accessToken: string | undefined,
    classId: string,
    body: ImportLiveClassChaptersRequest
  ): Promise<LiveClassChaptersResponse> {
    const { user, liveSession } = await this.liveClass.resolveClassManager(accessToken, classId);
    const scope = this.scopeOf(liveSession);
    const ids = [...new Set(body.puzzleIds)];

    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    const puzzles = await this.prisma.puzzle.findMany({
      where: {
        id: { in: ids },
        status: PuzzleStatus.PUBLISHED,
        ...(isAdmin ? {} : { OR: [{ visibility: PuzzleVisibility.GLOBAL }, { createdById: user.id }] })
      },
      select: { fen: true, id: true, title: true }
    });
    const byId = new Map(puzzles.map((p) => [p.id, p]));

    const current = await this.prisma.liveClassChapter.findMany({
      where: { scopeKey: scope.scopeKey },
      select: { puzzleId: true }
    });
    const already = new Set(current.map((c) => c.puzzleId).filter(Boolean));
    const toAdd = ids.flatMap((id) => {
      const puzzle = byId.get(id);
      return puzzle && !already.has(id) ? [puzzle] : [];
    });
    if (toAdd.length === 0) return this.respond(scope);
    this.assertRoom(current.length, toAdd.length);

    await this.prisma.liveClassChapter.createMany({
      data: toAdd.map((puzzle, i) => ({
        ...scope,
        createdById: user.id,
        position: current.length + i,
        puzzleId: puzzle.id,
        state: this.puzzleState(puzzle.fen) as Prisma.InputJsonValue,
        title: puzzle.title.slice(0, 80),
        updatedById: user.id
      }))
    });
    return this.respond(scope);
  }

  async update(
    accessToken: string | undefined,
    classId: string,
    chapterId: string,
    body: UpdateLiveClassChapterRequest
  ): Promise<LiveClassChaptersResponse> {
    const { user, liveSession } = await this.liveClass.resolveClassManager(accessToken, classId);
    const scope = this.scopeOf(liveSession);
    await this.findOwn(scope, chapterId);

    await this.prisma.liveClassChapter.update({
      where: { id: chapterId },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.state !== undefined ? { state: body.state as Prisma.InputJsonValue } : {}),
        updatedById: user.id
      }
    });
    return this.respond(scope);
  }

  async reorder(
    accessToken: string | undefined,
    classId: string,
    body: ReorderLiveClassChaptersRequest
  ): Promise<LiveClassChaptersResponse> {
    const { liveSession } = await this.liveClass.resolveClassManager(accessToken, classId);
    const scope = this.scopeOf(liveSession);

    const rows = await this.prisma.liveClassChapter.findMany({
      where: { scopeKey: scope.scopeKey },
      select: { id: true }
    });
    const known = new Set(rows.map((r) => r.id));
    const unique = new Set(body.ids);
    if (unique.size !== body.ids.length || body.ids.length !== known.size || body.ids.some((id) => !known.has(id))) {
      // Someone added or removed a chapter since this list was read.
      throw new ConflictException("The chapter list changed — refresh and try again.");
    }

    await this.prisma.$transaction(
      body.ids.map((id, position) =>
        this.prisma.liveClassChapter.update({ where: { id }, data: { position } })
      )
    );
    return this.respond(scope);
  }

  async remove(
    accessToken: string | undefined,
    classId: string,
    chapterId: string
  ): Promise<LiveClassChaptersResponse> {
    const { liveSession } = await this.liveClass.resolveClassManager(accessToken, classId);
    const scope = this.scopeOf(liveSession);
    await this.findOwn(scope, chapterId);

    // Deletes only the chapter row (the board snapshot it holds). A puzzle it
    // came from is referenced by id, never owned, so it is untouched.
    await this.prisma.$transaction(async (tx) => {
      await tx.liveClassChapter.delete({ where: { id: chapterId } });
      const rest = await tx.liveClassChapter.findMany({
        where: { scopeKey: scope.scopeKey },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { id: true, position: true }
      });
      for (const [position, row] of rest.entries()) {
        if (row.position !== position) {
          await tx.liveClassChapter.update({ where: { id: row.id }, data: { position } });
        }
      }
    });
    return this.respond(scope);
  }

  private scopeOf(session: { batchId: string | null; classId: string }): Scope {
    return session.batchId
      ? { batchId: session.batchId, liveClassId: null, scopeKey: `batch:${session.batchId}` }
      : { batchId: null, liveClassId: session.classId, scopeKey: `class:${session.classId}` };
  }

  /** A chapter id from another batch or class is "not found", never a hint that it exists. */
  private async findOwn(scope: Scope, chapterId: string) {
    const row = await this.prisma.liveClassChapter.findUnique({ where: { id: chapterId } });
    if (!row || row.scopeKey !== scope.scopeKey) throw new NotFoundException("Chapter not found.");
    return row;
  }

  private assertRoom(current: number, adding: number) {
    if (current + adding > MAX_LIVE_CLASS_CHAPTERS) {
      throw new BadRequestException(`A class can hold at most ${MAX_LIVE_CLASS_CHAPTERS} chapters.`);
    }
  }

  private async respond(scope: Scope): Promise<LiveClassChaptersResponse> {
    const rows = await this.prisma.liveClassChapter.findMany({
      where: { scopeKey: scope.scopeKey },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }]
    });
    const chapters = rows.flatMap((row, index) => {
      const chapter = this.toChapter(row, index);
      return chapter ? [chapter] : [];
    });
    return { chapters, scope: scope.batchId ? "BATCH" : "CLASS" };
  }

  /** Drops a row whose stored state no longer matches the shared schema. */
  private toChapter(row: ChapterRow, index: number): LiveClassChapter | null {
    const parsed = liveClassChapterStateSchema.safeParse(row.state);
    if (!parsed.success) return null;
    return {
      createdAt: row.createdAt.toISOString(),
      id: row.id,
      position: index,
      puzzleId: row.puzzleId,
      state: parsed.data,
      title: row.title,
      updatedAt: row.updatedAt.toISOString()
    };
  }

  /** A puzzle's starting position as a fresh board, from the solver's side. */
  private puzzleState(fen: string): LiveClassChapterState {
    const sideToMove = fen.trim().split(/\s+/)[1];
    return {
      arrows: [],
      fen,
      historyIndex: -1,
      orientation: sideToMove === "b" ? "black" : "white",
      pgn: "",
      squares: {}
    };
  }

  private isUniqueViolation(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
}
