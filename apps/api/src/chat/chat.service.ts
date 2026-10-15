import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  directChatAllowed,
  directConversationKey,
  type ChatContact,
  type ChatContactsResponse,
  type ChatConversationDetail,
  type ChatConversationListResponse,
  type ChatConversationSummary,
  type ChatMessageDto,
  type ChatMessagesQuery,
  type ChatMessagesResponse,
  type ChatRole,
  type ChatUnreadResponse,
  type ChatUserSummary,
  type CreateChatGroupRequest,
  type SendChatMessageRequest,
  type UpdateChatGroupMembersRequest,
} from "@nexa-chess/types";
import { ConversationType, Prisma, UserRole, UserStatus } from "@prisma/client";
import { authenticateUser, isAdminRole } from "../auth/authenticate";
import { PrismaService } from "../prisma/prisma.service";

type Actor = { id: string; role: UserRole };

type NamedUser = { id: string; firstName: string; lastName: string | null; role: UserRole };

const userSelect = { firstName: true, id: true, lastName: true, role: true } as const;

const fullName = (u: { firstName: string; lastName: string | null }) =>
  [u.firstName, u.lastName].filter(Boolean).join(" ") || "Unknown";

const toUser = (u: NamedUser): ChatUserSummary => ({ id: u.id, name: fullName(u), role: u.role as ChatRole });

const conversationInclude = {
  batch: { select: { id: true, isDeleted: true, name: true } },
  members: { include: { user: { select: userSelect } }, where: { leftAt: null } },
} satisfies Prisma.ConversationInclude;

type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>;

/** What the caller may do in one thread, resolved fresh on every request. */
type Access = {
  conversation: ConversationRow;
  /** Messages before this are not theirs to read (joined later). */
  historyFrom: Date | null;
  canSend: boolean;
  lastReadAt: Date | null;
};

/**
 * Persistent chat. Every request re-derives access from live data:
 *  - BATCH thread: the batch's current, non-deleted roster (students see what
 *    was said from their enrolment on; coaches see the whole history; staff
 *    may read and write any batch thread);
 *  - DIRECT / GROUP thread: an active `ConversationMember` row — a removed
 *    member loses access, and a GROUP member only sees messages from when
 *    they were added;
 *  - writing a DIRECT thread re-checks `directChatAllowed` (no student <->
 *    student, coach <-> student only while they share a batch).
 * A thread the caller cannot open is a 404, so ids can't be probed.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async listConversations(accessToken: string | undefined): Promise<ChatConversationListResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    return { conversations: await this.summaries(user) };
  }

  async unread(accessToken: string | undefined): Promise<ChatUnreadResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    const list = await this.summaries(user);
    return { unread: list.reduce((sum, c) => sum + c.unreadCount, 0) };
  }

  async getConversation(accessToken: string | undefined, id: string): Promise<ChatConversationDetail> {
    const user = await this.getAuthenticatedUser(accessToken);
    const access = await this.resolveAccess(user, id);
    return this.toDetail(user, access);
  }

  async listMessages(
    accessToken: string | undefined,
    id: string,
    query: ChatMessagesQuery,
  ): Promise<ChatMessagesResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    const access = await this.resolveAccess(user, id);
    const where: Prisma.ChatMessageWhereInput = { conversationId: id };
    const and: Prisma.ChatMessageWhereInput[] = [];
    if (access.historyFrom) and.push({ createdAt: { gte: access.historyFrom } });
    const cursor = this.parseCursor(query.before);
    if (cursor) {
      and.push({
        OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }],
      });
    }
    if (and.length) where.AND = and;
    const rows = await this.prisma.chatMessage.findMany({
      include: { sender: { select: userSelect } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      where,
    });
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const oldest = page[page.length - 1];
    return {
      messages: page.reverse().map((m) => this.toMessage(m)),
      nextBefore: hasMore && oldest ? `${oldest.createdAt.toISOString()}|${oldest.id}` : null,
    };
  }

  async sendMessage(
    accessToken: string | undefined,
    id: string,
    dto: SendChatMessageRequest,
  ): Promise<ChatMessageDto> {
    const user = await this.getAuthenticatedUser(accessToken);
    const access = await this.resolveAccess(user, id);
    if (!access.canSend) throw new ForbiddenException("You can no longer send messages in this conversation.");

    // A retried send (same clientId) returns the message already stored.
    const existing = await this.prisma.chatMessage.findUnique({
      include: { sender: { select: userSelect } },
      where: { senderId_clientId: { clientId: dto.clientId, senderId: user.id } },
    });
    if (existing) {
      if (existing.conversationId !== id) throw new ConflictException("That message id was already used.");
      return this.toMessage(existing);
    }

    let created;
    try {
      created = await this.prisma.chatMessage.create({
        data: { body: dto.body, clientId: dto.clientId, conversationId: id, senderId: user.id },
        include: { sender: { select: userSelect } },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const raced = await this.prisma.chatMessage.findUnique({
          include: { sender: { select: userSelect } },
          where: { senderId_clientId: { clientId: dto.clientId, senderId: user.id } },
        });
        if (raced && raced.conversationId === id) return this.toMessage(raced);
      }
      throw err;
    }
    await Promise.all([
      this.prisma.conversation.update({ data: { lastMessageAt: created.createdAt }, where: { id } }),
      this.touchRead(id, user.id, created.createdAt),
    ]);
    return this.toMessage(created);
  }

  async markRead(accessToken: string | undefined, id: string): Promise<{ ok: true }> {
    const user = await this.getAuthenticatedUser(accessToken);
    await this.resolveAccess(user, id);
    await this.touchRead(id, user.id, new Date());
    return { ok: true };
  }

  async startDirect(accessToken: string | undefined, targetId: string): Promise<ChatConversationDetail> {
    const user = await this.getAuthenticatedUser(accessToken);
    if (targetId === user.id) throw new BadRequestException("You can't message yourself.");
    const target = await this.prisma.user.findFirst({
      select: userSelect,
      where: { id: targetId, status: UserStatus.ACTIVE },
    });
    if (!target) throw new NotFoundException("That person could not be found.");
    if (!(await this.mayDirect(user, target))) {
      throw new ForbiddenException(
        user.role === UserRole.STUDENT && target.role === UserRole.STUDENT
          ? "Students can't message each other privately. Use your batch group instead."
          : "You can only message coaches and students who share a batch with you.",
      );
    }
    const directKey = directConversationKey(user.id, target.id);
    let conversation = await this.prisma.conversation.findUnique({ select: { id: true }, where: { directKey } });
    if (!conversation) {
      try {
        conversation = await this.prisma.conversation.create({
          data: {
            createdById: user.id,
            directKey,
            members: { create: [{ userId: user.id }, { userId: target.id }] },
            type: ConversationType.DIRECT,
          },
          select: { id: true },
        });
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
        conversation = await this.prisma.conversation.findUniqueOrThrow({ select: { id: true }, where: { directKey } });
      }
    }
    // Restore either side that was somehow detached.
    await this.prisma.conversationMember.updateMany({
      data: { leftAt: null },
      where: { conversationId: conversation.id, leftAt: { not: null } },
    });
    return this.toDetail(user, await this.resolveAccess(user, conversation.id));
  }

  async createGroup(accessToken: string | undefined, dto: CreateChatGroupRequest): Promise<ChatConversationDetail> {
    const user = await this.getAuthenticatedUser(accessToken);
    if (user.role === UserRole.STUDENT) throw new ForbiddenException("Only coaches and admins can create groups.");
    const memberIds = await this.assertGroupCandidates(user, dto.memberIds);
    const conversation = await this.prisma.conversation.create({
      data: {
        createdById: user.id,
        members: {
          create: [
            { role: "OWNER", userId: user.id },
            ...memberIds.filter((id) => id !== user.id).map((userId) => ({ userId })),
          ],
        },
        name: dto.name,
        type: ConversationType.GROUP,
      },
      select: { id: true },
    });
    return this.toDetail(user, await this.resolveAccess(user, conversation.id));
  }

  async updateGroupMembers(
    accessToken: string | undefined,
    id: string,
    dto: UpdateChatGroupMembersRequest,
  ): Promise<ChatConversationDetail> {
    const user = await this.getAuthenticatedUser(accessToken);
    const access = await this.resolveAccess(user, id);
    if (!this.canManageMembers(user, access.conversation)) {
      throw new ForbiddenException("Only the group's owner or an admin can change its members.");
    }
    const owners = new Set(access.conversation.members.filter((m) => m.role === "OWNER").map((m) => m.userId));
    if (dto.remove.some((uid) => owners.has(uid))) throw new BadRequestException("The group's owner can't be removed.");
    const add = dto.add.length ? await this.assertGroupCandidates(user, dto.add) : [];
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      for (const userId of add) {
        // Re-adding someone starts their history again from now.
        await tx.conversationMember.upsert({
          create: { conversationId: id, joinedAt: now, userId },
          update: { joinedAt: now, lastReadAt: null, leftAt: null },
          where: { conversationId_userId: { conversationId: id, userId } },
        });
      }
      if (dto.remove.length) {
        await tx.conversationMember.updateMany({
          data: { leftAt: now },
          where: { conversationId: id, leftAt: null, userId: { in: dto.remove } },
        });
      }
    });
    return this.toDetail(user, await this.resolveAccess(user, id));
  }

  async contacts(accessToken: string | undefined, q?: string): Promise<ChatContactsResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    const search = q?.trim();
    const nameFilter: Prisma.UserWhereInput = search
      ? {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { username: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    if (isAdminRole(user.role)) {
      const people = await this.prisma.user.findMany({
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        select: userSelect,
        take: 30,
        where: { ...nameFilter, id: { not: user.id }, role: { in: [UserRole.COACH, UserRole.STUDENT] }, status: UserStatus.ACTIVE },
      });
      return { contacts: people.map((p) => ({ ...toUser(p), batchNames: [] })), groupCandidates: [] };
    }

    const myBatches = await this.myBatches(user);
    if (myBatches.length === 0) return { contacts: [], groupCandidates: [] };
    const batchIds = myBatches.map((b) => b.id);
    const batchName = new Map(myBatches.map((b) => [b.id, b.name]));

    if (user.role === UserRole.STUDENT) {
      const rows = await this.prisma.batchCoach.findMany({
        include: { coach: { select: { ...userSelect, status: true } } },
        where: { batch: { isDeleted: false }, batchId: { in: batchIds }, isDeleted: false },
      });
      const contacts = this.groupByUser(
        rows.filter((r) => r.coach.status === UserStatus.ACTIVE).map((r) => ({ batchId: r.batchId, user: r.coach })),
        batchName,
      );
      return { contacts: this.filterByName(contacts, search), groupCandidates: [] };
    }

    // Coach: the students of their batches.
    const rows = await this.prisma.batchStudent.findMany({
      include: { student: { select: { ...userSelect, status: true } } },
      where: { batch: { isDeleted: false }, batchId: { in: batchIds }, isDeleted: false },
    });
    const students = this.groupByUser(
      rows.filter((r) => r.student.status === UserStatus.ACTIVE).map((r) => ({ batchId: r.batchId, user: r.student })),
      batchName,
    );
    const filtered = this.filterByName(students, search);
    return { contacts: filtered, groupCandidates: filtered };
  }

  // ── access ────────────────────────────────────────────────────────────────

  private async resolveAccess(user: Actor, id: string): Promise<Access> {
    const conversation = await this.prisma.conversation.findUnique({ include: conversationInclude, where: { id } });
    if (!conversation) throw new NotFoundException("Conversation not found.");
    return this.accessFor(user, conversation);
  }

  private async accessFor(user: Actor, conversation: ConversationRow): Promise<Access> {
    const id = conversation.id;
    const readState = await this.prisma.conversationMember.findUnique({
      select: { joinedAt: true, lastReadAt: true, leftAt: true },
      where: { conversationId_userId: { conversationId: id, userId: user.id } },
    });

    if (conversation.type === ConversationType.BATCH) {
      if (!conversation.batchId || !conversation.batch || conversation.batch.isDeleted) {
        throw new NotFoundException("Conversation not found.");
      }
      if (isAdminRole(user.role)) {
        return { canSend: true, conversation, historyFrom: null, lastReadAt: readState?.lastReadAt ?? null };
      }
      if (user.role === UserRole.COACH) {
        const coach = await this.prisma.batchCoach.findFirst({
          select: { id: true },
          where: { batchId: conversation.batchId, coachId: user.id, isDeleted: false },
        });
        if (!coach) throw new NotFoundException("Conversation not found.");
        return { canSend: true, conversation, historyFrom: null, lastReadAt: readState?.lastReadAt ?? null };
      }
      const enrolment = await this.prisma.batchStudent.findFirst({
        select: { enrolledAt: true },
        where: { batchId: conversation.batchId, isDeleted: false, studentId: user.id },
      });
      if (!enrolment) throw new NotFoundException("Conversation not found.");
      return {
        canSend: true,
        conversation,
        // A student joining a batch later doesn't get its earlier chat.
        historyFrom: enrolment.enrolledAt,
        lastReadAt: readState?.lastReadAt ?? null,
      };
    }

    if (!readState || readState.leftAt) throw new NotFoundException("Conversation not found.");
    if (conversation.type === ConversationType.GROUP) {
      return { canSend: true, conversation, historyFrom: readState.joinedAt, lastReadAt: readState.lastReadAt };
    }
    // DIRECT: the pair rule decides writing, every time (a student who left
    // the batch keeps the history but can no longer message that coach).
    const other = conversation.members.find((m) => m.userId !== user.id)?.user;
    const canSend = other ? await this.mayDirect(user, other) : false;
    return { canSend, conversation, historyFrom: null, lastReadAt: readState.lastReadAt };
  }

  private async mayDirect(user: Actor, target: { id: string; role: UserRole }): Promise<boolean> {
    const pair = [user.role, target.role];
    const needsBatch = pair.includes(UserRole.COACH) && pair.includes(UserRole.STUDENT);
    const shareBatch = needsBatch
      ? await this.shareBatch(
          user.role === UserRole.COACH ? user.id : target.id,
          user.role === UserRole.STUDENT ? user.id : target.id,
        )
      : false;
    return directChatAllowed(user.role as ChatRole, target.role as ChatRole, shareBatch);
  }

  private async shareBatch(coachId: string, studentId: string): Promise<boolean> {
    const row = await this.prisma.batchStudent.findFirst({
      select: { id: true },
      where: {
        batch: { coaches: { some: { coachId, isDeleted: false } }, isDeleted: false },
        isDeleted: false,
        studentId,
      },
    });
    return !!row;
  }

  /** Students only; a coach may only add students of their own batches. */
  private async assertGroupCandidates(user: Actor, ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)].filter((id) => id !== user.id);
    if (unique.length === 0) throw new BadRequestException("Add at least one student.");
    const where: Prisma.UserWhereInput = { id: { in: unique }, role: UserRole.STUDENT, status: UserStatus.ACTIVE };
    if (user.role === UserRole.COACH) {
      where.studentBatches = {
        some: { batch: { coaches: { some: { coachId: user.id, isDeleted: false } }, isDeleted: false }, isDeleted: false },
      };
    }
    const found = await this.prisma.user.findMany({ select: { id: true }, where });
    if (found.length !== unique.length) {
      throw new ForbiddenException("You can only add active students from your own batches.");
    }
    return unique;
  }

  private canManageMembers(user: Actor, conversation: ConversationRow): boolean {
    if (conversation.type !== ConversationType.GROUP) return false;
    if (isAdminRole(user.role)) return true;
    return conversation.members.some((m) => m.userId === user.id && m.role === "OWNER");
  }

  private async myBatches(user: Actor): Promise<{ id: string; name: string }[]> {
    if (user.role === UserRole.STUDENT) {
      const rows = await this.prisma.batchStudent.findMany({
        select: { batch: { select: { id: true, name: true } } },
        where: { batch: { isDeleted: false }, isDeleted: false, studentId: user.id },
      });
      return rows.map((r) => r.batch);
    }
    if (user.role === UserRole.COACH) {
      const rows = await this.prisma.batchCoach.findMany({
        select: { batch: { select: { id: true, name: true } } },
        where: { batch: { isDeleted: false }, coachId: user.id, isDeleted: false },
      });
      return rows.map((r) => r.batch);
    }
    return [];
  }

  // ── listing ───────────────────────────────────────────────────────────────

  private async summaries(user: Actor): Promise<ChatConversationSummary[]> {
    const myBatches = await this.myBatches(user);
    if (myBatches.length) {
      // One thread per batch, created on first sight; the unique batchId makes
      // concurrent first loads harmless.
      await this.prisma.conversation.createMany({
        data: myBatches.map((b) => ({ batchId: b.id, type: ConversationType.BATCH })),
        skipDuplicates: true,
      });
    }
    const conversations = await this.prisma.conversation.findMany({
      include: conversationInclude,
      where: {
        OR: [
          ...(myBatches.length ? [{ batchId: { in: myBatches.map((b) => b.id) }, type: ConversationType.BATCH }] : []),
          // Staff see the batch threads they have opened; everyone their DMs / groups.
          {
            members: { some: { leftAt: null, userId: user.id } },
            type: isAdminRole(user.role)
              ? { in: [ConversationType.BATCH, ConversationType.DIRECT, ConversationType.GROUP] }
              : { in: [ConversationType.DIRECT, ConversationType.GROUP] },
          },
        ],
      },
    });
    const visible = conversations.filter((c) => c.type !== ConversationType.BATCH || (c.batch && !c.batch.isDeleted));
    const summaries = await Promise.all(
      visible.map(async (conversation) => {
        try {
          return await this.toSummary(user, await this.accessFor(user, conversation));
        } catch {
          return null;
        }
      }),
    );
    return summaries
      .filter((s): s is ChatConversationSummary => !!s)
      .sort((a, b) => {
        if (a.lastMessageAt && b.lastMessageAt) return b.lastMessageAt.localeCompare(a.lastMessageAt);
        if (a.lastMessageAt) return -1;
        if (b.lastMessageAt) return 1;
        return a.title.localeCompare(b.title);
      });
  }

  private async toSummary(user: Actor, access: Access): Promise<ChatConversationSummary> {
    const { conversation } = access;
    const visibleFrom: Prisma.ChatMessageWhereInput = access.historyFrom
      ? { createdAt: { gte: access.historyFrom } }
      : {};
    const readFrom = access.lastReadAt && (!access.historyFrom || access.lastReadAt > access.historyFrom)
      ? access.lastReadAt
      : access.historyFrom;
    const [last, unreadCount, memberCount] = await Promise.all([
      this.prisma.chatMessage.findFirst({
        include: { sender: { select: { firstName: true, lastName: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        where: { conversationId: conversation.id, ...visibleFrom },
      }),
      this.prisma.chatMessage.count({
        where: {
          conversationId: conversation.id,
          ...(readFrom ? { createdAt: { gt: readFrom } } : {}),
          OR: [{ senderId: null }, { senderId: { not: user.id } }],
        },
      }),
      conversation.type === ConversationType.BATCH && conversation.batchId
        ? this.batchRosterCount(conversation.batchId)
        : Promise.resolve(conversation.members.length),
    ]);
    const counterpart =
      conversation.type === ConversationType.DIRECT
        ? conversation.members.find((m) => m.userId !== user.id)?.user ?? null
        : null;
    const title =
      conversation.type === ConversationType.BATCH
        ? conversation.batch?.name ?? "Batch"
        : conversation.type === ConversationType.GROUP
          ? conversation.name ?? "Group"
          : counterpart
            ? fullName(counterpart)
            : "Conversation";
    return {
      batchId: conversation.batchId,
      canSend: access.canSend,
      counterpart: counterpart ? toUser(counterpart) : null,
      id: conversation.id,
      lastMessage: last
        ? { body: last.body.slice(0, 140), createdAt: last.createdAt.toISOString(), senderName: last.sender ? fullName(last.sender) : null }
        : null,
      lastMessageAt: last?.createdAt.toISOString() ?? null,
      memberCount,
      title,
      type: conversation.type,
      unreadCount,
    };
  }

  private async toDetail(user: Actor, access: Access): Promise<ChatConversationDetail> {
    const summary = await this.toSummary(user, access);
    const { conversation } = access;
    let members: ChatConversationDetail["members"];
    if (conversation.type === ConversationType.BATCH && conversation.batchId) {
      const [coaches, students] = await Promise.all([
        this.prisma.batchCoach.findMany({
          select: { coach: { select: userSelect } },
          where: { batchId: conversation.batchId, isDeleted: false },
        }),
        this.prisma.batchStudent.findMany({
          select: { student: { select: userSelect } },
          where: { batchId: conversation.batchId, isDeleted: false },
        }),
      ]);
      members = [
        ...coaches.map((c) => ({ ...toUser(c.coach), owner: false })),
        ...students.map((s) => ({ ...toUser(s.student), owner: false })),
      ];
    } else {
      members = conversation.members.map((m) => ({ ...toUser(m.user), owner: m.role === "OWNER" }));
    }
    return { ...summary, canManageMembers: this.canManageMembers(user, conversation), members };
  }

  private async batchRosterCount(batchId: string): Promise<number> {
    const [coaches, students] = await Promise.all([
      this.prisma.batchCoach.count({ where: { batchId, isDeleted: false } }),
      this.prisma.batchStudent.count({ where: { batchId, isDeleted: false } }),
    ]);
    return coaches + students;
  }

  private async touchRead(conversationId: string, userId: string, at: Date) {
    await this.prisma.conversationMember.upsert({
      create: { conversationId, lastReadAt: at, userId },
      update: { lastReadAt: at },
      where: { conversationId_userId: { conversationId, userId } },
    });
  }

  private groupByUser(
    rows: { batchId: string; user: NamedUser }[],
    batchName: Map<string, string>,
  ): ChatContact[] {
    const byId = new Map<string, ChatContact>();
    for (const row of rows) {
      const contact = byId.get(row.user.id) ?? { ...toUser(row.user), batchNames: [] };
      const name = batchName.get(row.batchId);
      if (name && !contact.batchNames.includes(name)) contact.batchNames.push(name);
      byId.set(row.user.id, contact);
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  private filterByName(contacts: ChatContact[], search: string | undefined) {
    if (!search) return contacts;
    const needle = search.toLowerCase();
    return contacts.filter((c) => c.name.toLowerCase().includes(needle));
  }

  private parseCursor(before: string | undefined): { at: Date; id: string } | null {
    if (!before) return null;
    const [iso, id] = before.split("|");
    const at = new Date(iso);
    if (!id || Number.isNaN(at.getTime())) throw new BadRequestException("Invalid cursor.");
    return { at, id };
  }

  private toMessage(m: Prisma.ChatMessageGetPayload<{ include: { sender: { select: typeof userSelect } } }>): ChatMessageDto {
    return {
      body: m.body,
      clientId: m.clientId,
      conversationId: m.conversationId,
      createdAt: m.createdAt.toISOString(),
      id: m.id,
      sender: m.sender ? toUser(m.sender) : null,
    };
  }

  private async getAuthenticatedUser(accessToken: string | undefined): Promise<Actor> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    return { id: user.id, role: user.role };
  }
}
