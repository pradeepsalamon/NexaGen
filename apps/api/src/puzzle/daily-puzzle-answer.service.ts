import { Injectable } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import {
  DAILY_PUZZLE_LEVEL_LABELS,
  parseDailyPuzzleReply,
  type AttemptMove,
  type DailyPuzzleLevel,
  type DailyPuzzleReply,
  type SolutionMove
} from "@nexa-chess/types";
import { MessageChannel, MessageDeliveryStatus, Prisma } from "@prisma/client";
import { AssignmentEvaluationService, assertValidFen } from "../assignment/assignment-evaluation.service";
import { Chess } from "../common/chess/chess";
import { ACTIVE_STUDENT_ACCOUNT, dailyPuzzleDedupeKey } from "../messaging/daily-puzzle-deliveries";
import { MessagingRuleService } from "../messaging/messaging-rule.service";
import type { PrismaTransactionClient } from "../prisma/prisma.service";
import { dayToDate } from "../progress/progress-recorder.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { DailyPuzzleService } from "./daily-puzzle.service";
import { pictureTokenFromLink } from "./daily-puzzle-picture";
import { DailyPuzzleWhatsAppService } from "./daily-puzzle-whatsapp.service";
import { PuzzleAttemptService } from "./puzzle-attempt.service";

const PIECE_NAMES: Record<string, string> = { b: "bishop", k: "king", n: "knight", p: "pawn", q: "queen", r: "rook" };

export interface DailyPuzzleReplyOutcome {
  /** What the bot sends back, in order (free-form text: the person just wrote, so the 24h window is open). */
  replies: string[];
  /** Rating and analytics, once the caller's transaction has committed. */
  afterCommit: Array<() => void>;
}

/**
 * Answering Puzzle of the Day by WhatsApp reply (docs/PUZZLE_OF_THE_DAY.md
 * step 3). The support bot hands it every text first, inside its transaction
 * under the contact's lock; null = not about the puzzle, the bot goes on.
 *
 * Only for a number that got today's picture (its delivery row is SENT and
 * carries the signed picture link, which names the day, level and puzzle),
 * while the academy sends it. The number must be the account phone of exactly
 * one active student: their entry, attempt, rating and streak, through the one
 * attempt engine. A number on 2+ student accounts is told to use the app.
 * Only the first move is asked; the game engine decides legality and
 * rightness (any mate counts where the line ends in mate), never a string match.
 */
@Injectable()
export class DailyPuzzleAnswerService {
  constructor(
    private readonly attempts: PuzzleAttemptService,
    private readonly evaluation: AssignmentEvaluationService,
    private readonly moduleRef: ModuleRef,
    private readonly rules: MessagingRuleService,
    private readonly sender: DailyPuzzleWhatsAppService,
    private readonly whatsapp: WhatsAppService
  ) {}

  async reply(tx: PrismaTransactionClient, waId: string, text: string, appLink: string): Promise<DailyPuzzleReplyOutcome | null> {
    const parsed = parseDailyPuzzleReply(text);
    if (!parsed) return null;
    const rule = await this.rules.getRule("DAILY_PUZZLE");
    if (!rule.enabled || !rule.whatsappEnabled) return null;
    const daily = this.daily();
    const { day, enabled } = await daily.academyDay();
    if (!enabled) return null;

    const delivery = await tx.messageDelivery.findFirst({
      select: { imageLink: true },
      where: { channel: MessageChannel.WHATSAPP, dedupeKey: dailyPuzzleDedupeKey(waId, day), status: MessageDeliveryStatus.SENT }
    });
    if (!delivery) return null;

    const accounts = (
      await tx.user.findMany({ select: { id: true, phoneNumber: true }, where: { ...ACTIVE_STUDENT_ACCOUNT, phoneNumber: { not: null } } })
    ).filter((account) => this.whatsapp.normalizeRecipient(account.phoneNumber) === waId);
    if (accounts.length === 0) return null;
    if (accounts.length > 1) {
      return done([
        `More than one student uses this number, so we can't tell who answered. Please solve today's puzzle in the app: ${appLink}`
      ]);
    }

    const claims = this.sender.readPicture(pictureTokenFromLink(delivery.imageLink) ?? "");
    // No picture today (a template without an image header, or no signing key): nothing to answer.
    if (!claims || claims.day !== day) return null;
    const studentId = accounts[0].id;
    if (!(await daily.studentHomeBatch(studentId))) {
      return done([`Puzzle of the Day isn't on for your batch right now. Open the app to see more: ${appLink}`]);
    }

    const level = DAILY_PUZZLE_LEVEL_LABELS[claims.level];
    const entry = await this.entryFor(tx, studentId, day, claims.level, claims.puzzleId);
    if (entry.finishedAt) {
      const streak = await daily.streakFor(studentId, day, tx);
      return done([
        `You've already finished today's ${level} puzzle (${entry.solved ? "solved" : "not solved"}). ${streakLine(streak)} More puzzles: ${appLink}`
      ]);
    }
    if (entry.puzzleId !== claims.puzzleId) {
      return done([`You've started today's ${level} puzzle in the app. Finish it there: ${appLink}`]);
    }

    const puzzle = await tx.puzzle.findUniqueOrThrow({
      select: { fen: true, hintsJson: true, solutionMovesJson: true },
      where: { id: claims.puzzleId }
    });
    const fen = assertValidFen(puzzle.fen);
    const solution = (Array.isArray(puzzle.solutionMovesJson) ? puzzle.solutionMovesJson : []) as unknown as SolutionMove[];
    if (solution.length === 0) return null;
    const settings = await daily.whatsappSettings();
    const side = fen.split(" ")[1] === "b" ? "black" : "white";
    const answer = solution[0].san;

    const finish = async (solved: boolean, moves: AttemptMove[], message: (streak: number) => string) => {
      const after = await this.attempts.finishDailyAttempt(tx, entry.attemptId, { moves, solved });
      const streak = await daily.streakFor(studentId, day, tx);
      return { afterCommit: after ? [after] : [], replies: [message(streak)] };
    };

    if (parsed.kind === "HINT") {
      if (entry.whatsappTries < settings.hintAfter) {
        return done([`You can ask for a hint after ${tries(settings.hintAfter)}. Send your move, like ${example(side)}.`]);
      }
      if (!entry.whatsappHintAt) {
        await tx.dailyPuzzleEntry.update({ data: { whatsappHintAt: new Date() }, where: { id: entry.id } });
        await this.attempts.countDailyTry(tx, entry.attemptId, { hint: true });
      }
      return done([`Hint: ${hintFor(fen, solution[0], puzzle.hintsJson)}`]);
    }

    if (parsed.kind === "ANSWER") {
      if (entry.whatsappTries < settings.answerAfter) {
        return done([`You can see the answer after ${tries(settings.answerAfter)}. Keep trying!`]);
      }
      return finish(false, [], (streak) => `The answer is ${answer}. You finished today's puzzle, so it counts: ${streakLine(streak)} Try the other levels: ${appLink}`);
    }

    const move = readMove(fen, parsed);
    if (!move) {
      return done([
        `That move isn't possible in the puzzle position (${side === "white" ? "White" : "Black"} to move). Send it like ${example(side)}.`
      ]);
    }
    const feedback = this.evaluation.solveLineFeedback(fen, solution, [move], side);
    if (feedback.correct) {
      const rest = solution.length > 1 ? ` Play out the rest in the app: ${appLink}` : ` More puzzles: ${appLink}`;
      return finish(true, [move], (streak) => `Correct! 🔥 ${move.san} is the move. ${streakLine(streak)}${rest}`);
    }

    const used = entry.whatsappTries + 1;
    await tx.dailyPuzzleEntry.update({ data: { whatsappTries: used }, where: { id: entry.id } });
    await this.attempts.countDailyTry(tx, entry.attemptId, { wrongMove: true });
    if (used >= settings.maxTries) {
      return finish(
        false,
        [],
        (streak) => `Not quite. That was your last try: the answer is ${answer}. You finished today's puzzle, so it counts: ${streakLine(streak)} ${appLink}`
      );
    }
    const left = settings.maxTries - used;
    const offers = [
      used >= settings.hintAfter && !entry.whatsappHintAt ? "Reply HINT for a hint." : null,
      used >= settings.answerAfter ? "Reply ANSWER to see the answer." : null
    ].filter(Boolean);
    return done([`Not quite. ${left} ${left === 1 ? "try" : "tries"} left.${offers.length ? ` ${offers.join(" ")}` : ""}`]);
  }

  /**
   * The student's entry for the pictured level, opened with the pictured
   * puzzle if they haven't started that level in the app. A race with the app
   * (it opened the same level a moment ago) keeps the app's.
   */
  private async entryFor(tx: PrismaTransactionClient, studentId: string, day: string, level: DailyPuzzleLevel, puzzleId: string) {
    const key = { studentId_day_level: { day: dayToDate(day), level, studentId } };
    const existing = await tx.dailyPuzzleEntry.findUnique({ where: key });
    if (existing) return existing;
    const attemptId = await this.attempts.openDailyAttempt(tx, studentId, puzzleId);
    const created = await tx.dailyPuzzleEntry.createMany({
      data: [{ attemptId, day: dayToDate(day), level, puzzleId, studentId }],
      skipDuplicates: true
    });
    if (created.count === 0) await tx.puzzleAttempt.delete({ where: { id: attemptId } });
    return tx.dailyPuzzleEntry.findUniqueOrThrow({ where: key });
  }

  private daily(): DailyPuzzleService {
    return this.moduleRef.get(DailyPuzzleService, { strict: false });
  }
}

function done(replies: string[]): DailyPuzzleReplyOutcome {
  return { afterCommit: [], replies };
}

function tries(n: number): string {
  return n === 0 ? "your first try" : `${n} wrong ${n === 1 ? "try" : "tries"}`;
}

function streakLine(streak: number): string {
  return `Your streak: ${streak} ${streak === 1 ? "day" : "days"}.`;
}

function example(side: "white" | "black"): string {
  return side === "white" ? "Nf3 or e2e4" : "Nf6 or e7e5";
}

/**
 * The typed move as the game engine reads it in the puzzle position: SAN as
 * written, then with a lower-case piece letter capitalised, then UCI. Null =
 * not a legal move there.
 */
export function readMove(fen: string, reply: Extract<DailyPuzzleReply, { kind: "MOVE" }>): AttemptMove | null {
  const tries = [reply.text];
  if (/^[kqrbn]/.test(reply.text)) tries.push(reply.text[0].toUpperCase() + reply.text.slice(1));
  for (const candidate of tries) {
    const board = new Chess(fen);
    try {
      const played = board.move(candidate);
      if (played) return { fenAfter: board.fen(), ply: 1, san: played.san, uci: `${played.from}${played.to}${played.promotion ?? ""}` };
    } catch {
      // Not SAN as written: try the next reading.
    }
  }
  if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(reply.text)) {
    const uci = reply.text.toLowerCase();
    const board = new Chess(fen);
    try {
      const played = board.move({ from: uci.slice(0, 2), promotion: uci[4], to: uci.slice(2, 4) });
      if (played) return { fenAfter: board.fen(), ply: 1, san: played.san, uci: `${played.from}${played.to}${played.promotion ?? ""}` };
    } catch {
      return null;
    }
  }
  return null;
}

/** A coach-written first hint when the puzzle has one, else which piece moves (never the square it goes to). */
function hintFor(fen: string, first: SolutionMove, hintsJson: Prisma.JsonValue): string {
  if (Array.isArray(hintsJson) && typeof hintsJson[0] === "string" && hintsJson[0].trim()) return hintsJson[0].trim();
  const piece = new Chess(fen).get(first.uci.slice(0, 2) as Parameters<Chess["get"]>[0]);
  return piece ? `move your ${PIECE_NAMES[piece.type] ?? "piece"}.` : "look for a forcing move: a check, a capture or a threat.";
}
