import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import type { DemoInviteeInput } from "@nexa-chess/types";
import {
  ClassStatus,
  DemoGuestApproval,
  DemoRegistrationContactMethod,
  DemoRegistrationSource,
  LeadStatus,
  Prisma
} from "@prisma/client";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";

const CONVERTING_STATUSES: LeadStatus[] = ["CONVERTED", "ACTIVE_STUDENT"];
const INVITABLE_STATUSES: ClassStatus[] = [ClassStatus.SCHEDULED, ClassStatus.LIVE];

type InvitableClass = {
  id: string;
  topic: string | null;
  startsAt: Date;
  coach: { firstName: string; lastName: string | null };
};

type InviteTarget = {
  name: string;
  contactMethod: DemoRegistrationContactMethod;
  phoneNumber: string | null;
  email: string | null;
};

export type AddInviteesResult = { added: number; skipped: number };

export function demoInvitePath(classId: string, inviteToken: string): string {
  return `/demo/${classId}?invite=${inviteToken}`;
}

function newInviteToken(): string {
  return randomBytes(18).toString("base64url");
}

/**
 * Admin-side assignment of guests to a demo class — from a lead or as a new
 * invite. Each becomes a `DemoClassRegistration`; the guest's phone/email is
 * what `LiveClassService.joinDemoClass` matches them on, whatever the class's
 * access mode.
 */
@Injectable()
export class DemoInviteService {
  private readonly env = getApiEnv();
  private readonly logger = new Logger(DemoInviteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly whatsapp: WhatsAppService
  ) {}

  /** Same normalization the public join page uses — the dedupe/match key. */
  normalizeContact(method: DemoRegistrationContactMethod, raw: string | null | undefined): string | null {
    if (!raw) return null;
    if (method === DemoRegistrationContactMethod.EMAIL) {
      return raw.trim().toLowerCase() || null;
    }
    return this.whatsapp.normalizeRecipient(raw) ?? (raw.replace(/\D/g, "") || null);
  }

  async getInvitableClass(classId: string) {
    const demoClass = await this.prisma.coachClass.findUnique({
      where: { id: classId },
      include: { coach: true }
    });
    if (!demoClass || !demoClass.isDemo) {
      throw new NotFoundException("Demo class not found.");
    }
    if (!INVITABLE_STATUSES.includes(demoClass.status)) {
      throw new BadRequestException("Only a scheduled or live demo class can take invitees.");
    }
    return demoClass;
  }

  async addInvitees(
    classId: string,
    actorId: string,
    input: { leadIds?: string[]; invitees?: DemoInviteeInput[]; notify?: boolean }
  ): Promise<AddInviteesResult> {
    const demoClass = await this.getInvitableClass(classId);
    const notify = input.notify ?? true;
    let added = 0;
    let skipped = 0;

    const leadIds = [...new Set(input.leadIds ?? [])];
    if (leadIds.length > 0) {
      const leads = await this.prisma.lead.findMany({ where: { id: { in: leadIds } } });
      if (leads.length !== leadIds.length) {
        throw new BadRequestException("One or more leads were not found.");
      }
      for (const lead of leads) {
        const created = await this.bookLead(demoClass, lead, actorId, notify);
        if (created) added++;
        else skipped++;
      }
    }

    for (const invitee of input.invitees ?? []) {
      const contactMethod =
        invitee.contactMethod === "EMAIL"
          ? DemoRegistrationContactMethod.EMAIL
          : DemoRegistrationContactMethod.PHONE;
      const target: InviteTarget = {
        name: invitee.name,
        contactMethod,
        phoneNumber: contactMethod === DemoRegistrationContactMethod.PHONE ? invitee.phoneNumber ?? null : null,
        email: contactMethod === DemoRegistrationContactMethod.EMAIL ? invitee.email ?? null : null
      };
      const { created, inviteToken } = await this.upsertRegistration(demoClass.id, target, {
        source: DemoRegistrationSource.INVITE,
        invitedById: actorId
      });
      if (created) {
        added++;
        if (notify) void this.sendInvitation(demoClass, target, inviteToken);
      } else {
        skipped++;
      }
    }

    return { added, skipped };
  }

  /**
   * Books a lead into a demo class: a PHONE registration linked to the lead,
   * plus the lead's own pipeline bookkeeping (assigned class, status,
   * timeline). Returns whether a new registration was created — re-booking
   * the same lead still refreshes the lead but adds no duplicate.
   */
  async bookLead(
    demoClass: InvitableClass,
    lead: { id: string; studentName: string; phone: string; status: LeadStatus },
    actorId: string,
    notify = false
  ): Promise<boolean> {
    const target: InviteTarget = {
      name: lead.studentName,
      contactMethod: DemoRegistrationContactMethod.PHONE,
      phoneNumber: lead.phone,
      email: null
    };
    const { created, inviteToken } = await this.upsertRegistration(demoClass.id, target, {
      source: DemoRegistrationSource.LEAD,
      leadId: lead.id,
      invitedById: actorId
    });

    const topic = demoClass.topic ?? "Demo class";
    const coachName = `${demoClass.coach.firstName} ${demoClass.coach.lastName || ""}`.trim();
    await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        assignedClassId: demoClass.id,
        status:
          CONVERTING_STATUSES.includes(lead.status) || lead.status === "LOST"
            ? lead.status
            : "DEMO_SCHEDULED",
        lastActivityAt: new Date(),
        activities: {
          create: {
            activityType: "DEMO_CLASS_ASSIGNED",
            title: `Assigned to demo class: ${topic}`,
            description: `Scheduled for ${demoClass.startsAt.toISOString()} with ${coachName}`,
            createdById: actorId
          }
        }
      }
    });

    if (created && notify) void this.sendInvitation(demoClass, target, inviteToken);
    return created;
  }

  async removeInvitee(classId: string, registrationId: string, actorId: string) {
    const registration = await this.prisma.demoClassRegistration.findUnique({
      where: { id: registrationId },
      include: { class: true }
    });
    if (!registration || registration.classId !== classId || !registration.class.isDemo) {
      throw new NotFoundException("Invitee not found.");
    }
    if (registration.joinedAt) {
      throw new ConflictException("This guest already joined the class and can't be removed.");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.demoClassRegistration.delete({ where: { id: registrationId } });
      if (!registration.leadId) return;
      const lead = await tx.lead.findUnique({ where: { id: registration.leadId } });
      if (lead?.assignedClassId !== classId) return;
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          assignedClassId: null,
          lastActivityAt: new Date(),
          activities: {
            create: {
              activityType: "DEMO_CLASS_UNASSIGNED",
              title: `Removed from demo class: ${registration.class.topic ?? "Demo class"}`,
              createdById: actorId
            }
          }
        }
      });
    });

    return { ok: true };
  }

  /**
   * Creates the registration, or — when this contact already registered
   * themselves (or is waiting for approval) — turns that row into an approved
   * invite. `created` is true only for a brand-new row.
   */
  private async upsertRegistration(
    classId: string,
    target: InviteTarget,
    link: { source: DemoRegistrationSource; leadId?: string; invitedById: string }
  ): Promise<{ created: boolean; inviteToken: string }> {
    const contactValue = this.normalizeContact(
      target.contactMethod,
      target.contactMethod === DemoRegistrationContactMethod.EMAIL ? target.email : target.phoneNumber
    );
    if (!contactValue) {
      throw new BadRequestException(`Enter a valid phone number or email address for ${target.name}.`);
    }

    const key = { classId, contactMethod: target.contactMethod, contactValue };
    const existing = await this.prisma.demoClassRegistration.findUnique({
      where: { classId_contactMethod_contactValue: key }
    });
    if (existing) {
      const inviteToken = existing.inviteToken ?? newInviteToken();
      await this.prisma.demoClassRegistration.update({
        where: { id: existing.id },
        data: {
          approval: DemoGuestApproval.APPROVED,
          inviteToken,
          invitedById: existing.invitedById ?? link.invitedById,
          leadId: existing.leadId ?? link.leadId ?? null,
          source: existing.source === DemoRegistrationSource.SELF ? link.source : existing.source
        }
      });
      return { created: false, inviteToken };
    }

    const inviteToken = newInviteToken();
    try {
      await this.prisma.demoClassRegistration.create({
        data: {
          ...key,
          name: target.name,
          phoneNumber: target.phoneNumber,
          email: target.email,
          source: link.source,
          leadId: link.leadId ?? null,
          invitedById: link.invitedById,
          inviteToken
        }
      });
      return { created: true, inviteToken };
    } catch (error) {
      // A concurrent registration of the same contact — retry as an update.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return this.upsertRegistration(classId, target, link);
      }
      throw error;
    }
  }

  /** Best-effort — a failed invitation never fails the assignment. */
  private async sendInvitation(demoClass: InvitableClass, target: InviteTarget, inviteToken: string) {
    const topic = demoClass.topic ?? "Demo class";
    const joinUrl = `${getFrontendUrl(this.env)}${demoInvitePath(demoClass.id, inviteToken)}`;
    try {
      if (target.contactMethod === DemoRegistrationContactMethod.EMAIL && target.email) {
        await this.mail.sendDemoClassInvitation({
          to: target.email,
          guestName: target.name,
          classTopic: topic,
          startsAt: demoClass.startsAt,
          joinUrl
        });
      } else if (target.phoneNumber) {
        await this.whatsapp.trySendText({
          to: target.phoneNumber,
          body: `Hi ${target.name}, you're invited to the demo class "${topic}". Your personal link — open it once the class starts: ${joinUrl}`
        });
      }
    } catch (error) {
      this.logger.warn(
        `Demo invitation for class ${demoClass.id} failed: ${(error as Error).message}`
      );
    }
  }
}
