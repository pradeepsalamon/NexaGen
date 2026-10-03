import { BadRequestException, Injectable } from "@nestjs/common";
import {
  liveBoardStateSchema,
  type LiveBoardState,
  type LiveBoardStateResponse,
} from "@nexa-chess/types";
import { PrismaService } from "../prisma/prisma.service";
import { LiveClassAccessService } from "./live-class-access.service";

/** A long annotated game is well under this; anything bigger is not a board. */
const MAX_BOARD_STATE_BYTES = 128 * 1024;

/** Durable copy of the shared board, so a coach refresh or a full reload can restore it. */
@Injectable()
export class LiveClassBoardStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LiveClassAccessService
  ) {}

  async getBoardState(accessToken: string | undefined, classId: string): Promise<LiveBoardStateResponse> {
    const { liveSession } = await this.access.resolveParticipant(accessToken, classId);
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
    return { state, updatedAt: updatedAt.toISOString() };
  }
}
