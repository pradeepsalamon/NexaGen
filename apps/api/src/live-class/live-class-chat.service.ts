import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  privateChatRecipientAllowed,
  type LiveChatMessageResponse,
} from "@nexa-chess/types";
import {
  UserRole,
  UserStatus,
} from "@prisma/client";
import { LiveClassAccessService } from "./live-class-access.service";

/** Persisted room chat and student <-> coach private messages. */
@Injectable()
export class LiveClassChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LiveClassAccessService
  ) {}

  async saveChatMessage(
    accessToken: string | undefined,
    classId: string,
    message: string,
    clientMessageId?: string,
    recipientId?: string | null
  ): Promise<LiveChatMessageResponse> {
    const user = await this.access.authenticate(accessToken);

    const trimmed = typeof message === "string" ? message.trim() : "";
    if (!trimmed) {
      throw new BadRequestException("Message cannot be empty.");
    }
    if (trimmed.length > 2000) {
      throw new BadRequestException("Message is too long (2000 characters max).");
    }

    const liveSession = await this.access.getAccessibleLiveSession(user, classId);

    if (recipientId) {
      await this.assertPrivateChatAllowed(user, liveSession, recipientId);
    }

    const name = [user.firstName, user.role === UserRole.COACH ? user.lastName : null]
      .filter(Boolean)
      .join(" ")
      .trim();

    const row = await this.prisma.liveChatMessage.create({
      data: {
        liveSessionId: liveSession.id,
        senderId: user.id,
        senderName: name,
        senderRole: user.role,
        message: trimmed,
        clientMessageId: clientMessageId ?? null,
        recipientId: recipientId ?? null,
      },
    });

    return LiveClassChatService.toChatMessage(row);
  }

  /**
   * Private chat is deliberately one-to-one **with the coach**: a student may
   * only address staff, and staff may address anyone in the class. This is the
   * write-side enforcement -- the web client hides the option and drops inbound
   * packets that break the same rule, but neither of those binds an attacker.
   */
  private async assertPrivateChatAllowed(
    user: { id: string; role: UserRole },
    liveSession: { id: string; coachId: string; batch?: { students: { studentId: string }[] } | null },
    recipientId: string
  ) {
    if (recipientId === user.id) {
      throw new BadRequestException("You cannot send a private message to yourself.");
    }

    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true, role: true, status: true },
    });
    if (!recipient || recipient.status !== UserStatus.ACTIVE) {
      throw new NotFoundException("Recipient not found.");
    }

    if (!privateChatRecipientAllowed(user.role, recipient.role)) {
      throw new ForbiddenException(
        "Private messages are only allowed between a student and the coach."
      );
    }

    // The recipient must actually belong to this class, whichever side they are on.
    const inClass =
      recipient.id === liveSession.coachId ||
      recipient.role === UserRole.ADMIN ||
      recipient.role === UserRole.SUPER_ADMIN ||
      !!liveSession.batch?.students.some((s) => s.studentId === recipient.id);
    if (!inClass) {
      throw new ForbiddenException("That person is not in this class.");
    }
  }

  async getChatHistory(
    accessToken: string | undefined,
    classId: string
  ): Promise<LiveChatMessageResponse[]> {
    const user = await this.access.authenticate(accessToken);
    const liveSession = await this.access.getAccessibleLiveSession(user, classId);

    // Room-wide messages, plus only the private threads this user is party to --
    // filtering client-side would ship other people's DMs down the wire.
    const rows = await this.prisma.liveChatMessage.findMany({
      where: {
        liveSessionId: liveSession.id,
        OR: [
          { recipientId: null },
          { recipientId: user.id },
          { senderId: user.id, recipientId: { not: null } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 500, // Limit to last 500 messages
    });

    return rows.map(LiveClassChatService.toChatMessage);
  }

  private static toChatMessage(row: {
    id: string;
    senderId: string;
    senderName: string;
    senderRole: string | null;
    recipientId: string | null;
    message: string;
    clientMessageId: string | null;
    createdAt: Date;
  }): LiveChatMessageResponse {
    return {
      id: row.id,
      senderId: row.senderId,
      senderName: row.senderName,
      senderRole: row.senderRole,
      recipientId: row.recipientId,
      message: row.message,
      clientMessageId: row.clientMessageId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
