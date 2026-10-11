import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type {
  AnswerLiveMovePollRequest,
  LiveMovePoll,
  LiveMovePollAnswer,
  LiveMovePollMessage,
  LiveMovePollStateResponse,
  StartLiveMovePollRequest,
  UpdateLiveMovePollRequest
} from "@nexa-chess/types";
import { encodeLiveMovePoll, LIVE_CLASS_MOVE_POLL_TOPIC, tallyMovePollAnswers } from "@nexa-chess/types";
import { LiveClassMovePollStatus, Prisma, UserRole } from "@prisma/client";
import { Chess } from "../common/chess/chess";
import { LiveClassService } from "../live-class/live-class.service";
import { LiveKitService } from "../live-class/livekit.service";
import { PrismaService } from "../prisma/prisma.service";
import { fullName } from "../puzzle/puzzle-auth.helper";

const pollInclude = {
  answers: {
    include: { student: { select: { firstName: true, lastName: true } } },
    orderBy: { answeredAt: "asc" }
  }
} satisfies Prisma.LiveClassMovePollInclude;

type PollRow = Prisma.LiveClassMovePollGetPayload<{ include: typeof pollInclude }>;

type PrismaTx = Parameters<Parameters<PrismaService["$transaction"]>[0]>[0];

@Injectable()
export class LiveClassMovePollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LiveKitService,
    private readonly liveClass: LiveClassService
  ) {}

  /** Coach-owner / admin asks a new question (ends any current poll). */
  async start(
    accessToken: string | undefined,
    classId: string,
    dto: StartLiveMovePollRequest
  ): Promise<LiveMovePollStateResponse> {
    const { user, liveSession } = await this.liveClass.resolveClassManager(accessToken, classId, {
      requireLive: true
    });
    const chess = this.load(dto.fen);
    if (chess.isGameOver()) throw new BadRequestException("There is no move to play in this position.");

    let created: PollRow;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        await this.endCurrent(tx, classId);
        return tx.liveClassMovePoll.create({
          data: {
            fen: chess.fen(),
            liveClassId: classId,
            prompt: dto.prompt || null,
            startedById: user.id
          },
          include: pollInclude
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A question was just asked in this class.");
      }
      throw error;
    }

    await this.broadcast(liveSession.roomName, { type: "POLL_CHANGED", pollId: created.id });
    return { poll: this.toPoll(created, null) };
  }

  /** Coach-owner / admin closes, reopens, reveals or marks the correct move. */
  async update(
    accessToken: string | undefined,
    classId: string,
    dto: UpdateLiveMovePollRequest
  ): Promise<LiveMovePollStateResponse> {
    const { liveSession } = await this.liveClass.resolveClassManager(accessToken, classId);
    const poll = await this.findCurrent(classId);
    if (!poll) throw new NotFoundException("No question is open in this class.");

    const data: Prisma.LiveClassMovePollUpdateInput = {};
    if (dto.status === "CLOSED" && poll.status === LiveClassMovePollStatus.OPEN) {
      data.status = LiveClassMovePollStatus.CLOSED;
      data.closedAt = new Date();
    } else if (dto.status === "OPEN" && poll.status === LiveClassMovePollStatus.CLOSED) {
      data.status = LiveClassMovePollStatus.OPEN;
      data.closedAt = null;
      data.revealed = false;
    }
    if (dto.revealed !== undefined) data.revealed = dto.revealed;
    if (dto.correctUci !== undefined) {
      data.correctUci = dto.correctUci === null ? null : this.playable(poll.fen, dto.correctUci).uci;
    }

    const updated = await this.prisma.liveClassMovePoll.update({
      where: { id: poll.id },
      data,
      include: pollInclude
    });
    await this.broadcast(liveSession.roomName, { type: "POLL_CHANGED", pollId: updated.id });
    return { poll: this.toPoll(updated, null) };
  }

  /** Coach-owner / admin dismisses the question for everyone. */
  async end(accessToken: string | undefined, classId: string): Promise<LiveMovePollStateResponse> {
    const { liveSession } = await this.liveClass.resolveClassManager(accessToken, classId);
    const pollId = await this.prisma.$transaction((tx) => this.endCurrent(tx, classId));
    if (pollId) await this.broadcast(liveSession.roomName, { type: "POLL_CHANGED", pollId });
    return { poll: null };
  }

  /** Any participant: the current question. Students only see their own answer until revealed. */
  async getCurrent(accessToken: string | undefined, classId: string): Promise<LiveMovePollStateResponse> {
    const { user } = await this.liveClass.resolveParticipant(accessToken, classId);
    const poll = await this.findCurrent(classId);
    if (!poll) return { poll: null };
    return { poll: this.toPoll(poll, user.role === UserRole.STUDENT ? user.id : null) };
  }

  /** A student submits (or changes) their move while the poll is open. */
  async answer(
    accessToken: string | undefined,
    classId: string,
    dto: AnswerLiveMovePollRequest
  ): Promise<LiveMovePollStateResponse> {
    const { user, liveSession } = await this.liveClass.resolveParticipant(accessToken, classId);
    if (user.role !== UserRole.STUDENT) {
      throw new ForbiddenException("Only students answer the coach's question.");
    }
    const poll = await this.findCurrent(classId);
    if (!poll || poll.status !== LiveClassMovePollStatus.OPEN) {
      throw new BadRequestException("This question is no longer taking answers.");
    }
    const move = this.playable(poll.fen, dto.uci);

    await this.prisma.liveClassMovePollAnswer.upsert({
      where: { pollId_studentId: { pollId: poll.id, studentId: user.id } },
      create: { pollId: poll.id, san: move.san, studentId: user.id, uci: move.uci },
      update: { answeredAt: new Date(), san: move.san, uci: move.uci }
    });

    const fresh = await this.prisma.liveClassMovePoll.findUniqueOrThrow({
      where: { id: poll.id },
      include: pollInclude
    });
    await this.broadcast(liveSession.roomName, {
      type: "POLL_ANSWERED",
      pollId: poll.id,
      answerCount: fresh.answers.length
    });
    return { poll: this.toPoll(fresh, user.id) };
  }

  // ── Helpers ──

  private findCurrent(classId: string): Promise<PollRow | null> {
    return this.prisma.liveClassMovePoll.findFirst({
      where: { liveClassId: classId, status: { not: LiveClassMovePollStatus.ENDED } },
      include: pollInclude
    });
  }

  private async endCurrent(tx: PrismaTx, classId: string): Promise<string | null> {
    const current = await tx.liveClassMovePoll.findFirst({
      where: { liveClassId: classId, status: { not: LiveClassMovePollStatus.ENDED } },
      select: { id: true, closedAt: true }
    });
    if (!current) return null;
    const now = new Date();
    await tx.liveClassMovePoll.update({
      where: { id: current.id },
      data: { closedAt: current.closedAt ?? now, endedAt: now, status: LiveClassMovePollStatus.ENDED }
    });
    return current.id;
  }

  private load(fen: string): Chess {
    try {
      return new Chess(fen);
    } catch {
      throw new BadRequestException("That position is not valid.");
    }
  }

  private playable(fen: string, uci: string): { uci: string; san: string } {
    const chess = this.load(fen);
    try {
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      return { san: move.san, uci: move.from + move.to + (move.promotion ?? "") };
    } catch {
      throw new BadRequestException("That move is not legal in this position.");
    }
  }

  private toPoll(row: PollRow, viewerStudentId: string | null): LiveMovePoll {
    const answers: LiveMovePollAnswer[] = row.answers.map((a) => ({
      answeredAt: a.answeredAt.toISOString(),
      san: a.san,
      studentId: a.studentId,
      studentName: fullName(a.student) ?? "Student",
      uci: a.uci
    }));
    const correctSan = row.correctUci ? this.sanOf(row.fen, row.correctUci) : null;
    const base = {
      answerCount: answers.length,
      closedAt: row.closedAt?.toISOString() ?? null,
      fen: row.fen,
      id: row.id,
      prompt: row.prompt,
      revealed: row.revealed,
      startedAt: row.startedAt.toISOString(),
      status: row.status
    };

    if (viewerStudentId === null) {
      return { ...base, answers, correctSan, correctUci: row.correctUci, myAnswer: null, options: tallyMovePollAnswers(answers) };
    }

    const mine = answers.find((a) => a.studentId === viewerStudentId);
    const showResults = row.status === LiveClassMovePollStatus.CLOSED && row.revealed;
    return {
      ...base,
      answers: [],
      correctSan: showResults ? correctSan : null,
      correctUci: showResults ? row.correctUci : null,
      myAnswer: mine ? { san: mine.san, uci: mine.uci } : null,
      options: showResults
        ? tallyMovePollAnswers(answers).map((o) => ({ ...o, studentNames: [] }))
        : []
    };
  }

  private sanOf(fen: string, uci: string): string | null {
    try {
      return this.playable(fen, uci).san;
    } catch {
      return null;
    }
  }

  private async broadcast(roomName: string, message: LiveMovePollMessage): Promise<void> {
    try {
      await this.livekit.broadcastData(roomName, encodeLiveMovePoll(message), LIVE_CLASS_MOVE_POLL_TOPIC);
    } catch {
      // Nudge only — REST is authoritative and clients refetch on reconnect.
    }
  }
}
