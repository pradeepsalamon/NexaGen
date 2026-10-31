import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import {
  liveBoardStateSchema,
  type LiveBoardState,
  type LiveBoardStateResponse,
} from "@nexa-chess/types";
import { PrismaService } from "../prisma/prisma.service";
import { GameRecorderService } from "../game-library/game-recorder.service";
import { LiveClassAccessService } from "./live-class-access.service";
import { LiveKitService } from "./livekit.service";

/** A long annotated game is well under this; anything bigger is not a board. */
const MAX_BOARD_STATE_BYTES = 128 * 1024;

/** Durable copy of the shared board, so a coach refresh or a full reload can restore it. */
@Injectable()
export class LiveClassBoardStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LiveClassAccessService,
    private readonly gameRecorder: GameRecorderService,
    private readonly livekit: LiveKitService
  ) {}

  async getBoardState(accessToken: string | undefined, classId: string): Promise<LiveBoardStateResponse> {
    const { liveSession } = await this.access.resolveParticipant(accessToken, classId);
    const parsed = liveBoardStateSchema.safeParse(liveSession.boardState);
    return {
      state: parsed.success ? parsed.data : null,
      updatedAt: parsed.success ? liveSession.boardStateUpdatedAt?.toISOString() ?? null : null,
    };
  }

  /**
   * The saved board for the egress recording template, so a recording opens on
   * the current position instead of the start position. The template has no
   * session, only the LiveKit token egress minted for it, so that token is the
   * credential: it must be signed with our LiveKit secret, be for this class's
   * room, and be a hidden seat (egress marks its token `recorder` + `hidden`;
   * a student or coach token is never hidden). It reads, never writes.
   */
  async getBoardStateForRecorder(authorization: string | undefined, classId: string): Promise<LiveBoardStateResponse> {
    const token = /^Bearer\s+(\S+)$/i.exec(authorization ?? "")?.[1];
    if (!token) throw new UnauthorizedException("A recorder token is required.");
    const grant = await this.livekit.verifyToken(token);
    if (!grant) throw new UnauthorizedException("Invalid recorder token.");

    const liveSession = await this.prisma.liveSession.findUnique({
      select: { boardState: true, boardStateUpdatedAt: true, livekitRoomName: true, roomName: true },
      where: { classId },
    });
    const forThisRoom =
      !!liveSession && !!grant.room && (grant.room === liveSession.roomName || grant.room === liveSession.livekitRoomName);
    // One answer for "no such class" and "not your room", so a valid token
    // for one class can't probe which other class ids exist.
    if (!liveSession || !forThisRoom || !(grant.recorder || grant.hidden)) {
      throw new ForbiddenException("This token can't read that class's board.");
    }
    const parsed = liveBoardStateSchema.safeParse(liveSession.boardState);
    return {
      state: parsed.success ? parsed.data : null,
      updatedAt: parsed.success ? liveSession.boardStateUpdatedAt?.toISOString() ?? null : null,
    };
  }

  /** Coach-owner/admin of a LIVE class. Last write wins; the client serializes its saves. */
  async saveBoardState(
    accessToken: string | undefined,
    classId: string,
    state: LiveBoardState
  ): Promise<LiveBoardStateResponse> {
    const { liveSession } = await this.access.resolveClassManager(accessToken, classId, { requireLive: true });
    if (Buffer.byteLength(JSON.stringify(state)) > MAX_BOARD_STATE_BYTES) {
      throw new BadRequestException("Board state is too large to save.");
    }

    const updatedAt = new Date();
    await this.prisma.liveSession.update({
      where: { id: liveSession.id },
      data: { boardState: state, boardStateUpdatedAt: updatedAt },
    });
    // Every game played on the shared board lands in the Game Library.
    this.gameRecorder.recordBoardStateInBackground(liveSession.id, classId, state);
    return { state, updatedAt: updatedAt.toISOString() };
  }
}
