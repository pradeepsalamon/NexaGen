import { Injectable } from "@nestjs/common";
import {
  playItemKey,
  type PlayColor,
  type PlayItem,
  type PlayMove,
  type PlaySegment,
  type PlaySource,
  type RushPlayedRecord
} from "@nexa-chess/types";
import type { Prisma } from "@prisma/client";
import { Chess } from "../common/chess/chess";
import { gameMovesFromPgn } from "../game-analysis/report-builder";
import { PrismaService } from "../prisma/prisma.service";

/** A feed row: which record, whose play. */
export type PlayRef = { source: PlaySource; sourceId: string; studentId: string; playedAt: Date };

/** One move as a feature stores it, before it is replayed. */
type RawMove = { uci: string; correct?: boolean | null; elapsedMs?: number | null; byStudent?: boolean };

type RawSegment = {
  label?: string | null;
  startFen: string;
  /** The side the student played; null = decide per move from `byStudent`. */
  studentSide: PlayColor | null;
  moves: RawMove[];
  result?: string | null;
};

type Loaded = {
  title: string;
  result: string | null;
  classId: string | null;
  batchId: string | null;
  segments: RawSegment[];
};

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

const jsonArray = (value: Prisma.JsonValue | null | undefined): Record<string, unknown>[] =>
  Array.isArray(value) ? (value.filter((v) => !!v && typeof v === "object" && !Array.isArray(v)) as Record<string, unknown>[]) : [];

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

function sideToMove(fen: string): PlayColor {
  return fen.trim().split(/\s+/)[1] === "b" ? "black" : "white";
}

/**
 * Replay a raw segment from its start position: SAN for every move and who
 * played it. Stops at the first move that doesn't play (a corrupt record
 * never yields a made-up line).
 */
export function replaySegment(raw: RawSegment): PlaySegment {
  const moves: PlayMove[] = [];
  let chess: Chess;
  try {
    chess = new Chess(raw.startFen);
  } catch {
    return { label: raw.label ?? null, moves: [], result: raw.result ?? null, startFen: raw.startFen, studentSide: raw.studentSide };
  }
  for (const [index, move] of raw.moves.entries()) {
    if (!UCI.test(move.uci)) break;
    const mover: PlayColor = chess.turn() === "w" ? "white" : "black";
    let san: string;
    try {
      san = chess.move({ from: move.uci.slice(0, 2), promotion: move.uci[4], to: move.uci.slice(2, 4) }).san;
    } catch {
      break;
    }
    moves.push({
      byStudent: move.byStudent ?? (raw.studentSide !== null && mover === raw.studentSide),
      correct: move.correct ?? null,
      elapsedMs: move.elapsedMs ?? null,
      ply: index + 1,
      san,
      uci: move.uci
    });
  }
  return { label: raw.label ?? null, moves, result: raw.result ?? null, startFen: raw.startFen, studentSide: raw.studentSide };
}

/**
 * Turns feed rows into full play items, one batched query per source. Reads
 * go through the tenant-scoped client, so another academy's row is never
 * found; a row that vanished between the feed query and here is dropped.
 */
@Injectable()
export class PlayItemLoader {
  constructor(private readonly prisma: PrismaService) {}

  async load(refs: PlayRef[]): Promise<PlayItem[]> {
    const bySource = new Map<PlaySource, PlayRef[]>();
    for (const ref of refs) bySource.set(ref.source, [...(bySource.get(ref.source) ?? []), ref]);

    const loaded = new Map<string, Loaded>();
    await Promise.all(
      [...bySource.entries()].map(async ([source, group]) => {
        const results = await this.loadSource(source, group);
        for (const [key, value] of results) loaded.set(key, value);
      })
    );

    const classIds = [...new Set([...loaded.values()].map((l) => l.classId).filter((id): id is string => !!id))];
    const classes = classIds.length
      ? await this.prisma.coachClass.findMany({ select: { batchId: true, id: true }, where: { id: { in: classIds } } })
      : [];
    const batchOf = new Map(classes.map((c) => [c.id, c.batchId]));

    const items: PlayItem[] = [];
    for (const ref of refs) {
      const key = this.refKey(ref);
      const l = loaded.get(key);
      if (!l) continue;
      const segments = l.segments.map(replaySegment).filter((s) => s.moves.length > 0);
      if (segments.length === 0) continue;
      items.push({
        batchId: l.batchId ?? (l.classId ? batchOf.get(l.classId) ?? null : null),
        classId: l.classId,
        key: playItemKey(ref.source, ref.sourceId),
        playedAt: ref.playedAt.toISOString(),
        result: l.result,
        review: null,
        segments,
        source: ref.source,
        sourceId: ref.sourceId,
        studentMoveCount: segments.reduce((n, s) => n + s.moves.filter((m) => m.byStudent).length, 0),
        title: l.title
      });
    }
    return items;
  }

  /** The play time of one item of this student's, or null when it isn't theirs / doesn't exist. */
  async resolve(source: PlaySource, sourceId: string, studentId: string): Promise<PlayRef | null> {
    const probe: PlayRef = { playedAt: new Date(0), source, sourceId, studentId };
    const loaded = await this.loadSource(source, [probe]);
    const hit = loaded.get(this.refKey(probe));
    if (!hit) return null;
    const playedAt = await this.playedAtOf(source, sourceId);
    return playedAt ? { ...probe, playedAt } : null;
  }

  private refKey(ref: Pick<PlayRef, "source" | "sourceId" | "studentId">) {
    return `${ref.studentId}|${ref.source}:${ref.sourceId}`;
  }

  private async playedAtOf(source: PlaySource, sourceId: string): Promise<Date | null> {
    const p = this.prisma;
    switch (source) {
      case "PUZZLE": {
        const r = await p.puzzleAttempt.findUnique({ select: { completedAt: true, updatedAt: true }, where: { id: sourceId } });
        return r ? r.completedAt ?? r.updatedAt : null;
      }
      case "ASSIGNMENT":
        return (await p.studentAssignmentAttempt.findUnique({ select: { completedAt: true }, where: { id: sourceId } }))?.completedAt ?? null;
      case "PLAYOUT":
        return (await p.liveClassPlayoutGame.findUnique({ select: { finishedAt: true }, where: { id: sourceId } }))?.finishedAt ?? null;
      case "POLL":
        return (await p.liveClassMovePollAnswer.findUnique({ select: { answeredAt: true }, where: { id: sourceId } }))?.answeredAt ?? null;
      case "RUSH": {
        const id = sourceId.slice(2);
        if (sourceId.startsWith("s-")) {
          return (await p.soloPuzzleRushRun.findUnique({ select: { finishedAt: true }, where: { id } }))?.finishedAt ?? null;
        }
        return (await p.liveClassPuzzleRushEntry.findUnique({ select: { finishedAt: true }, where: { id } }))?.finishedAt ?? null;
      }
      default: {
        const g = await p.chessGame.findUnique({ select: { endedAt: true, startedAt: true, updatedAt: true, source: true }, where: { id: sourceId } });
        if (!g) return null;
        return g.endedAt ?? (source === "CLASS_BOARD" ? g.updatedAt : g.startedAt);
      }
    }
  }

  private async loadSource(source: PlaySource, refs: PlayRef[]): Promise<Map<string, Loaded>> {
    const out = new Map<string, Loaded>();
    const put = (ref: PlayRef, value: Loaded) => out.set(this.refKey(ref), value);
    const ids = refs.map((r) => r.sourceId);
    const p = this.prisma;

    switch (source) {
      case "PUZZLE": {
        const rows = await p.puzzleAttempt.findMany({
          select: {
            completedAt: true,
            id: true,
            liveClassId: true,
            movesJson: true,
            puzzle: { select: { fen: true, title: true } },
            result: true,
            status: true,
            studentId: true,
            wrongMovesJson: true
          },
          where: { id: { in: ids } }
        });
        for (const ref of refs) {
          const row = rows.find((r) => r.id === ref.sourceId && r.studentId === ref.studentId);
          if (!row?.puzzle) continue;
          const played = jsonArray(row.movesJson);
          // A wrong move the student tried stays on record (wrongMovesJson); the
          // last one is where a FAILED attempt ended, so it closes the line.
          const wrong = jsonArray(row.wrongMovesJson);
          const lastWrong = wrong[wrong.length - 1];
          const moves: RawMove[] = played.map((m) => ({ correct: bool(m.correct) ?? true, uci: String(m.uci ?? "") }));
          if (row.status === "FAILED" && lastWrong && num(lastWrong.ply) === moves.length + 1) {
            moves.push({ correct: false, uci: String(lastWrong.uci ?? "") });
          }
          put(ref, {
            batchId: null,
            classId: row.liveClassId,
            result: row.result ?? row.status,
            segments: [{ moves, result: row.result ?? row.status, startFen: row.puzzle.fen, studentSide: sideToMove(row.puzzle.fen) }],
            title: row.puzzle.title
          });
        }
        return out;
      }
      case "ASSIGNMENT": {
        const rows = await p.studentAssignmentAttempt.findMany({
          select: {
            id: true,
            movesJson: true,
            result: true,
            studentAssignment: {
              select: {
                assignmentBatch: {
                  select: { assignment: { select: { activityType: true, startFen: true, studentColor: true, title: true } }, batchId: true }
                },
                studentId: true
              }
            }
          },
          where: { id: { in: ids } }
        });
        for (const ref of refs) {
          const row = rows.find((r) => r.id === ref.sourceId && r.studentAssignment.studentId === ref.studentId);
          const assignment = row?.studentAssignment.assignmentBatch.assignment;
          if (!row || !assignment?.startFen) continue;
          const side: PlayColor =
            assignment.studentColor === "black" || assignment.studentColor === "white"
              ? assignment.studentColor
              : sideToMove(assignment.startFen);
          put(ref, {
            batchId: row.studentAssignment.assignmentBatch.batchId,
            classId: null,
            result: row.result,
            segments: [
              {
                moves: jsonArray(row.movesJson).map((m) => ({ correct: bool(m.correct), elapsedMs: num(m.elapsedMs), uci: String(m.uci ?? "") })),
                result: row.result,
                startFen: assignment.startFen,
                studentSide: side
              }
            ],
            title: assignment.title
          });
        }
        return out;
      }
      case "PLAYOUT": {
        const rows = await p.liveClassPlayoutGame.findMany({
          select: { id: true, movesJson: true, result: true, run: { select: { liveClassId: true, title: true } }, startFen: true, studentColor: true, studentId: true },
          where: { id: { in: ids } }
        });
        for (const ref of refs) {
          const row = rows.find((r) => r.id === ref.sourceId && r.studentId === ref.studentId);
          if (!row) continue;
          put(ref, {
            batchId: null,
            classId: row.run.liveClassId,
            result: row.result,
            segments: [
              {
                moves: jsonArray(row.movesJson).map((m) => ({ byStudent: m.by === "STUDENT", uci: String(m.uci ?? "") })),
                result: row.result,
                startFen: row.startFen,
                studentSide: row.studentColor === "black" ? "black" : "white"
              }
            ],
            title: row.run.title
          });
        }
        return out;
      }
      case "POLL": {
        const rows = await p.liveClassMovePollAnswer.findMany({
          select: { id: true, poll: { select: { correctUci: true, fen: true, liveClassId: true, status: true } }, studentId: true, uci: true },
          where: { id: { in: ids } }
        });
        for (const ref of refs) {
          const row = rows.find((r) => r.id === ref.sourceId && r.studentId === ref.studentId);
          if (!row) continue;
          const correct = row.poll.correctUci ? row.poll.correctUci === row.uci : null;
          put(ref, {
            batchId: null,
            classId: row.poll.liveClassId,
            result: correct === null ? null : correct ? "CORRECT" : "INCORRECT",
            segments: [{ moves: [{ correct, uci: row.uci }], startFen: row.poll.fen, studentSide: sideToMove(row.poll.fen) }],
            title: "Move poll"
          });
        }
        return out;
      }
      case "RUSH": {
        const soloIds = ids.filter((id) => id.startsWith("s-")).map((id) => id.slice(2));
        const classIds = ids.filter((id) => id.startsWith("c-")).map((id) => id.slice(2));
        const [solo, entries] = await Promise.all([
          soloIds.length
            ? p.soloPuzzleRushRun.findMany({ select: { id: true, mode: true, movesJson: true, score: true, studentId: true }, where: { id: { in: soloIds } } })
            : [],
          classIds.length
            ? p.liveClassPuzzleRushEntry.findMany({
                select: { id: true, movesJson: true, rush: { select: { liveClassId: true, mode: true } }, score: true, studentId: true },
                where: { id: { in: classIds } }
              })
            : []
        ]);
        for (const ref of refs) {
          const id = ref.sourceId.slice(2);
          const row = ref.sourceId.startsWith("s-")
            ? solo.find((r) => r.id === id && r.studentId === ref.studentId)
            : entries.find((r) => r.id === id && r.studentId === ref.studentId);
          if (!row) continue;
          const mode = "mode" in row ? row.mode : row.rush.mode;
          const records = jsonArray(row.movesJson) as unknown as RushPlayedRecord[];
          put(ref, {
            batchId: null,
            classId: "rush" in row ? row.rush.liveClassId : null,
            result: `Score ${row.score}`,
            segments: records
              .filter((r) => typeof r.fen === "string" && Array.isArray(r.line))
              .map((r) => ({
                label: `Puzzle ${r.i + 1} (${r.rating})`,
                moves: r.line.map((m) => ({ byStudent: m.by === "STUDENT", correct: m.correct, uci: m.uci })),
                result: r.solved ? "SOLVED" : "FAILED",
                startFen: r.fen,
                studentSide: null
              })),
            title: mode === "RACER" ? "Puzzle Racer" : "Puzzle Storm"
          });
        }
        return out;
      }
      case "CLASS_BOARD": {
        const games = await p.chessGame.findMany({
          select: { batchId: true, boardMoves: { select: { ply: true, studentId: true } }, classId: true, id: true, pgn: true, result: true, title: true },
          where: { id: { in: ids }, source: "LIVE_BOARD" }
        });
        for (const ref of refs) {
          const game = games.find((g) => g.id === ref.sourceId);
          const mine = new Set(game?.boardMoves.filter((m) => m.studentId === ref.studentId).map((m) => m.ply));
          if (!game || mine.size === 0) continue;
          const parsed = this.parsePgn(game.pgn);
          if (!parsed) continue;
          put(ref, {
            batchId: game.batchId,
            classId: game.classId,
            result: game.result === "*" ? null : game.result,
            segments: [
              {
                moves: parsed.movesUci.map((uci, i) => ({ byStudent: mine.has(i + 1), uci })),
                result: game.result === "*" ? null : game.result,
                startFen: parsed.startFen,
                studentSide: null
              }
            ],
            title: game.title
          });
        }
        return out;
      }
      default: {
        // MATCH, SIMUL, TOURNAMENT (the student on either side) and OWN_GAME (theirs).
        const games = await p.chessGame.findMany({
          select: { batchId: true, blackPlayerId: true, classId: true, id: true, ownerId: true, pgn: true, result: true, title: true, whitePlayerId: true },
          where: { id: { in: ids } }
        });
        for (const ref of refs) {
          const game = games.find((g) => g.id === ref.sourceId);
          if (!game) continue;
          const side: PlayColor | null =
            game.whitePlayerId === ref.studentId ? "white" : game.blackPlayerId === ref.studentId ? "black" : null;
          if (source === "OWN_GAME" ? game.ownerId !== ref.studentId : side === null) continue;
          const parsed = this.parsePgn(game.pgn);
          if (!parsed) continue;
          put(ref, {
            batchId: game.batchId,
            classId: game.classId,
            result: game.result === "*" ? null : game.result,
            segments: [
              {
                moves: parsed.movesUci.map((uci) => ({ uci })),
                result: game.result === "*" ? null : game.result,
                startFen: parsed.startFen,
                // An own game names the student on the side they played; without
                // one nothing is credited and the review skips it.
                studentSide: side
              }
            ],
            title: game.title
          });
        }
        return out;
      }
    }
  }

  private parsePgn(pgn: string): { startFen: string; movesUci: string[] } | null {
    try {
      const parsed = gameMovesFromPgn(pgn);
      return { movesUci: parsed.movesUci, startFen: parsed.startFen };
    } catch {
      return null;
    }
  }
}
