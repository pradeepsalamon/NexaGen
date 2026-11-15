import { createHash, randomInt } from "node:crypto";
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  SUPPORT_LINK_CODE_ALPHABET,
  SUPPORT_LINK_CODE_LENGTH,
  type SupportLinkCodeRequest,
  type SupportLinkCodeResponse
} from "@nexa-chess/types";
import { UserRole, UserStatus } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { supportSlotTitle } from "./support-demo-slots.service";

/** How long a code works. */
export const SUPPORT_LINK_CODE_TTL_MS = 24 * 60 * 60_000;
/** Wrong codes a number may send per window before it has to wait. */
export const SUPPORT_LINK_MAX_FAILURES = 5;
export const SUPPORT_LINK_FAILURE_WINDOW_MS = 60 * 60_000;
/** Students answered for in one reply. */
const MAX_STUDENTS = 3;

export function hashSupportLinkCode(code: string): string {
  return createHash("sha256").update(`support-link:${code}`).digest("hex");
}

export function newSupportLinkCode(): string {
  let code = "";
  for (let i = 0; i < SUPPORT_LINK_CODE_LENGTH; i += 1) code += SUPPORT_LINK_CODE_ALPHABET[randomInt(SUPPORT_LINK_CODE_ALPHABET.length)];
  return code;
}

/** "ABCD-2345": easier to read out. The bot accepts it with or without the dash. */
export function formatSupportLinkCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * Existing students on WhatsApp (plan Phase D; docs/WHATSAPP_SUPPORT.md §0
 * "Existing students"). A number is linked to a student only through a
 * one-time code staff create for that student and hand to the family (D8: a
 * typed phone number is never proof). A linked number may ask for the
 * student's next class; nothing else about the account is ever sent, and an
 * unlinked number gets no account data at all.
 */
@Injectable()
export class SupportAccountService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async createLinkCode(accessToken: string | undefined, body: SupportLinkCodeRequest): Promise<SupportLinkCodeResponse> {
    const admin = await this.getAdmin(accessToken);
    const student = await this.prisma.user.findFirst({
      select: { firstName: true, id: true, lastName: true },
      where: { id: body.studentId, role: UserRole.STUDENT, status: UserStatus.ACTIVE }
    });
    if (!student) throw new NotFoundException("Student not found.");
    const code = newSupportLinkCode();
    const expiresAt = new Date(Date.now() + SUPPORT_LINK_CODE_TTL_MS);
    await this.prisma.supportLinkCode.create({
      data: { codeHash: hashSupportLinkCode(code), createdById: admin.id, expiresAt, studentId: student.id }
    });
    return { code: formatSupportLinkCode(code), expiresAt: expiresAt.toISOString(), studentName: `${student.firstName} ${student.lastName ?? ""}`.trim() };
  }

  async unlink(accessToken: string | undefined, contactId: string, studentId: string): Promise<{ removed: true }> {
    await this.getAdmin(accessToken);
    const removed = await this.prisma.supportContactLink.deleteMany({ where: { contactId, studentId } });
    if (removed.count === 0) throw new NotFoundException("That number isn't linked to this student.");
    return { removed: true };
  }

  /** "LINK <code>" from WhatsApp, inside the message's transaction (contact lock held). Returns the reply. */
  async linkFromWhatsApp(tx: PrismaTransactionClient, contactId: string, code: string, now: Date): Promise<string> {
    const contact = await tx.whatsAppContact.findFirst({ select: { linkFailures: true, linkFailuresFrom: true }, where: { id: contactId } });
    if (!contact) return "Sorry, that didn't work. Please try again.";
    const windowOpen = contact.linkFailuresFrom !== null && now.getTime() - contact.linkFailuresFrom.getTime() < SUPPORT_LINK_FAILURE_WINDOW_MS;
    if (windowOpen && contact.linkFailures >= SUPPORT_LINK_MAX_FAILURES) {
      return "Too many codes that didn't work. Please try again in an hour, or ask the academy for a new code.";
    }

    const row = await tx.supportLinkCode.findFirst({
      include: { student: { select: { firstName: true, isDeleted: true, role: true, status: true } } },
      where: { codeHash: hashSupportLinkCode(code), expiresAt: { gt: now }, usedAt: null }
    });
    const usable = row && !row.student.isDeleted && row.student.role === UserRole.STUDENT && row.student.status === UserStatus.ACTIVE;
    const claimed = usable
      ? await tx.supportLinkCode.updateMany({ data: { usedAt: now, usedByContactId: contactId }, where: { id: row.id, usedAt: null } })
      : { count: 0 };
    if (!row || claimed.count === 0) {
      await tx.whatsAppContact.update({
        data: windowOpen ? { linkFailures: { increment: 1 } } : { linkFailures: 1, linkFailuresFrom: now },
        where: { id: contactId }
      });
      return "That code didn't work. Codes work once and for 24 hours; please ask the academy for a new one.";
    }
    await tx.supportContactLink.upsert({
      create: { codeId: row.id, contactId, studentId: row.studentId },
      update: { codeId: row.id },
      where: { contactId_studentId: { contactId, studentId: row.studentId } }
    });
    await tx.whatsAppContact.update({ data: { linkFailures: 0, linkFailuresFrom: null }, where: { id: contactId } });
    return `Done: this number is now linked to ${row.student.firstName}. Send NEXT CLASS any time to see their next class.`;
  }

  /** "NEXT CLASS" from WhatsApp: the next scheduled class of each linked student, or how to link. */
  async nextClassReply(tx: PrismaTransactionClient, contactId: string, now: Date): Promise<string> {
    const links = await tx.supportContactLink.findMany({
      include: { student: { select: { firstName: true, id: true, timezone: true } } },
      orderBy: { createdAt: "asc" },
      take: MAX_STUDENTS,
      where: { contactId, student: { isDeleted: false, role: UserRole.STUDENT, status: UserStatus.ACTIVE } }
    });
    if (links.length === 0) {
      return "This number isn't linked to a student yet. Ask the academy for a link code, then send LINK and the code here.";
    }
    const lines: string[] = [];
    for (const link of links) {
      const next = await tx.coachClass.findFirst({
        orderBy: { startsAt: "asc" },
        select: { batch: { select: { name: true } }, startsAt: true },
        where: {
          batch: { isDeleted: false, students: { some: { isDeleted: false, studentId: link.student.id } } },
          isDemo: false,
          startsAt: { gt: now },
          status: "SCHEDULED"
        }
      });
      lines.push(
        next
          ? `${link.student.firstName}: ${supportSlotTitle(next.startsAt, link.student.timezone)}${next.batch ? ` (${next.batch.name})` : ""}`
          : `${link.student.firstName}: no class is scheduled yet.`
      );
    }
    return [`Next class${links.length > 1 ? "es" : ""}:`, ...lines, "Join from the app as usual."].join("\n");
  }

  private async getAdmin(accessToken: string | undefined) {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only admins can link WhatsApp numbers to students.");
    }
    return user;
  }
}
