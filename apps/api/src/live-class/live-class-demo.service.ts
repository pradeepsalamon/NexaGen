import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { LiveKitService } from "./livekit.service";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import { LiveSessionStatus, LiveKitTokenOptions } from "./types/live-class.types";
import {
  type DemoClassPublicInfo,
  type GuestJoinDemoRequest,
  type GuestJoinDemoResponse,
} from "@nexa-chess/types";
import {
  ClassStatus,
  DemoClassAccessMode,
  DemoGuestApproval,
  DemoRegistrationContactMethod,
  LeadStatus,
  Prisma,
} from "@prisma/client";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { MailService } from "../mail/mail.service";
import { LiveClassWaitingRoomService } from "./live-class-waiting-room.service";

/** Public demo classes: guest registration, access modes and the guest join token. */
@Injectable()
export class LiveClassDemoService {
  private readonly env = getApiEnv();
  private readonly logger = new Logger(LiveClassDemoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LiveKitService,
    private readonly whatsapp: WhatsAppService,
    private readonly mail: MailService,
    private readonly waitingRoom: LiveClassWaitingRoomService
  ) {}

  /**
   * Public: what the join page shows before its form. `idOrSlug` is a demo
   * class id or a static demo schedule's slug — the latter resolves to the
   * schedule's LIVE occurrence, else its next one. Never returns the passcode.
   */
  async getDemoInfo(idOrSlug: string, inviteToken?: string): Promise<DemoClassPublicInfo> {
    const include = { coach: { select: { firstName: true, lastName: true } } } as const;
    let coachClass = await this.prisma.coachClass.findUnique({ where: { id: idOrSlug }, include });

    if (!coachClass) {
      const schedule = await this.prisma.demoSchedule.findUnique({
        where: { slug: idOrSlug.toLowerCase() }
      });
      if (schedule?.isActive) {
        coachClass =
          (await this.prisma.coachClass.findFirst({
            where: { demoScheduleId: schedule.id, status: ClassStatus.LIVE },
            include
          })) ??
          (await this.prisma.coachClass.findFirst({
            where: {
              demoScheduleId: schedule.id,
              status: ClassStatus.SCHEDULED,
              endsAt: { gt: new Date() }
            },
            orderBy: { startsAt: "asc" },
            include
          }));
        if (!coachClass) {
          throw new NotFoundException("There is no upcoming session for this demo class right now.");
        }
      }
    }

    if (!coachClass || !coachClass.isDemo) {
      throw new NotFoundException("This demo class was not found.");
    }

    let invitee: DemoClassPublicInfo["invitee"] = null;
    if (inviteToken) {
      const registration = await this.prisma.demoClassRegistration.findUnique({
        where: { inviteToken }
      });
      if (registration?.classId === coachClass.id) invitee = { name: registration.name };
    }

    return {
      classId: coachClass.id,
      topic: coachClass.topic || coachClass.title || "Demo Class",
      description: coachClass.description,
      startsAt: coachClass.startsAt.toISOString(),
      endsAt: coachClass.endsAt.toISOString(),
      status: coachClass.status === ClassStatus.IN_PROGRESS ? ClassStatus.LIVE : coachClass.status,
      accessMode: coachClass.demoAccessMode,
      coachName: `${coachClass.coach.firstName} ${coachClass.coach.lastName || ""}`.trim(),
      invitee
    };
  }

  /**
   * Admits a demo guest. Three ways in:
   * - a personal invite token (admin-added guest — admitted in every mode);
   * - a phone/email that already has a registration on this class (an invite
   *   typed by hand, or a returning guest re-polling while they wait);
   * - a new registration, which the class's access mode gates: PASSCODE checks
   *   the passcode first, INVITE_ONLY files it as PENDING for the coach to
   *   admit from the waiting room instead of turning the guest away.
   * A token is only minted once the class is LIVE; before that the guest gets
   * `joined: false` and the join page polls the same request again.
   */
  async joinDemoClass(
    classId: string,
    body: GuestJoinDemoRequest
  ): Promise<GuestJoinDemoResponse> {
    const coachClass = await this.prisma.coachClass.findUnique({
      where: { id: classId },
      include: { liveSession: true }
    });

    if (!coachClass || !coachClass.isDemo) {
      throw new NotFoundException("This demo class was not found.");
    }
    if (coachClass.status === ClassStatus.CANCELLED) {
      throw new NotFoundException("This demo class has been cancelled.");
    }
    if (coachClass.status === ClassStatus.COMPLETED) {
      throw new NotFoundException("This demo class has already ended.");
    }

    const liveSession = coachClass.liveSession;
    if (liveSession?.status === LiveSessionStatus.ENDED) {
      throw new NotFoundException("This demo class has already ended.");
    }

    const topic = coachClass.topic || coachClass.title || "Demo Class";
    const isLive = liveSession?.status === LiveSessionStatus.LIVE;
    const { registration, created } = await this.resolveDemoRegistration(coachClass, topic, body);

    if (registration.approval === DemoGuestApproval.DENIED) {
      throw new ForbiddenException({
        message: "The coach has not admitted you to this class.",
        code: "JOIN_DENIED"
      });
    }

    if (registration.approval === DemoGuestApproval.PENDING) {
      if (created && isLive && liveSession) {
        await this.waitingRoom.announceWaitingRoomEvent(
          liveSession.roomName,
          "JOIN_REQUESTED",
          LiveClassWaitingRoomService.toGuestWaitingRoomEntry(registration)
        );
      }
      return {
        registered: true,
        joined: false,
        awaitingApproval: true,
        token: null,
        roomName: null,
        topic,
        startsAt: coachClass.startsAt.toISOString(),
        message: isLive
          ? "This class is for invited guests. The coach has been asked to let you in."
          : "This class is for invited guests. Your request is saved, and the coach can let you in once the class starts."
      };
    }

    if (!isLive || !liveSession) {
      // Guest demo registration — no account/timezone; state the schedule in UTC.
      const formattedTime = coachClass.startsAt.toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        timeZone: 'UTC', timeZoneName: 'short'
      });
      return {
        registered: true,
        joined: false,
        awaitingApproval: false,
        token: null,
        roomName: null,
        topic,
        startsAt: coachClass.startsAt.toISOString(),
        message: `You're registered! This demo class is scheduled for ${formattedTime}. Come back here once the coach starts the session.`
      };
    }

    // `crypto.randomUUID()` — the old `Math.random().toString(36).substring(7)`
    // yielded ~4 chars, so two guests could collide and LiveKit would evict the
    // earlier one for a duplicate identity (AUDIT M18).
    const participantIdentity = `guest_${randomUUID()}`;

    const tokenOptions: LiveKitTokenOptions = {
      roomName: liveSession.roomName,
      participantIdentity,
      participantName: body.guestName || registration.name,
      isCoach: false
    };

    const livekitToken = await this.livekit.generateAccessToken(tokenOptions);

    if (!registration.joinedAt) {
      await this.prisma.demoClassRegistration
        .update({ where: { id: registration.id }, data: { joinedAt: new Date() } })
        .catch(() => undefined);
      if (registration.leadId) void this.markLeadAttended(registration.leadId, topic);
    }

    return {
      registered: true,
      joined: true,
      awaitingApproval: false,
      token: livekitToken,
      roomName: liveSession.roomName,
      topic,
      startsAt: null,
      message: null
    };
  }

  /**
   * Finds or creates the guest's registration (one row per class per contact
   * — `@@unique([classId, contactMethod, contactValue])`). The join page
   * re-submits while it waits, and that retry must reuse the row rather than
   * re-registering, re-asking the coach, or re-sending a confirmation.
   */
  private async resolveDemoRegistration(
    coachClass: { id: string; startsAt: Date; demoAccessMode: DemoClassAccessMode; demoPasscode: string | null },
    topic: string,
    body: GuestJoinDemoRequest
  ) {
    if (body.inviteToken) {
      const registration = await this.prisma.demoClassRegistration.findUnique({
        where: { inviteToken: body.inviteToken }
      });
      if (!registration || registration.classId !== coachClass.id) {
        throw new ForbiddenException({
          message: "This invite link isn't valid for this class. Enter your details instead.",
          code: "DEMO_INVITE_INVALID"
        });
      }
      return { registration, created: false };
    }

    const contactMethod: DemoRegistrationContactMethod =
      body.contactMethod === "EMAIL"
        ? DemoRegistrationContactMethod.EMAIL
        : DemoRegistrationContactMethod.PHONE;

    const contactValue =
      contactMethod === DemoRegistrationContactMethod.EMAIL
        ? (body.email as string)
        : this.whatsapp.normalizeRecipient(body.phoneNumber) ??
          (body.phoneNumber ?? "").replace(/\D/g, "");

    if (!contactValue) {
      throw new BadRequestException("Enter a valid phone number or email address.");
    }

    const key = { classId: coachClass.id, contactMethod, contactValue };
    const existing = await this.prisma.demoClassRegistration.findUnique({
      where: { classId_contactMethod_contactValue: key }
    });
    if (existing) return { registration: existing, created: false };

    if (
      coachClass.demoAccessMode === DemoClassAccessMode.PASSCODE &&
      !LiveClassDemoService.passcodeMatches(body.passcode, coachClass.demoPasscode)
    ) {
      throw new ForbiddenException({
        message: body.passcode ? "That passcode is incorrect." : "Enter the class passcode.",
        code: "DEMO_PASSCODE_INVALID"
      });
    }

    const approval =
      coachClass.demoAccessMode === DemoClassAccessMode.INVITE_ONLY
        ? DemoGuestApproval.PENDING
        : DemoGuestApproval.APPROVED;

    let created;
    try {
      created = await this.prisma.demoClassRegistration.create({
        data: {
          ...key,
          name: body.guestName as string,
          phoneNumber: contactMethod === DemoRegistrationContactMethod.PHONE ? body.phoneNumber : null,
          email: contactMethod === DemoRegistrationContactMethod.EMAIL ? body.email : null,
          approval
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await this.prisma.demoClassRegistration.findUniqueOrThrow({
          where: { classId_contactMethod_contactValue: key }
        });
        return { registration: raced, created: false };
      }
      throw error;
    }

    if (approval === DemoGuestApproval.APPROVED) {
      void this.sendDemoRegistrationConfirmation(coachClass.id, created, coachClass.startsAt, topic);
    }

    return { registration: created, created: true };
  }

  private static passcodeMatches(given: string | undefined, expected: string | null): boolean {
    if (!given || !expected) return false;
    const digest = (value: string) => createHash("sha256").update(value.trim().toUpperCase()).digest();
    return timingSafeEqual(digest(given), digest(expected));
  }

  /** Best-effort: a booked lead who actually joined moves to DEMO_ATTENDED. */
  private async markLeadAttended(leadId: string, topic: string) {
    try {
      await this.prisma.lead.updateMany({
        where: {
          id: leadId,
          status: { in: [LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.INTERESTED, LeadStatus.DEMO_SCHEDULED] }
        },
        data: { status: LeadStatus.DEMO_ATTENDED, lastActivityAt: new Date() }
      });
      await this.prisma.leadActivity.create({
        data: { leadId, activityType: "DEMO_ATTENDED", title: `Joined demo class: ${topic}` }
      });
    } catch (error) {
      this.logger.warn(`Could not mark lead ${leadId} as attended: ${(error as Error).message}`);
    }
  }

  /** Best-effort — a failed confirmation never blocks registration or join. */
  private async sendDemoRegistrationConfirmation(
    classId: string,
    registration: {
      name: string;
      contactMethod: DemoRegistrationContactMethod;
      phoneNumber: string | null;
      email: string | null;
    },
    startsAt: Date,
    topic: string
  ) {
    try {
      if (registration.contactMethod === DemoRegistrationContactMethod.EMAIL && registration.email) {
        await this.mail.sendDemoClassRegistrationConfirmation({
          to: registration.email,
          guestName: registration.name,
          classTopic: topic,
          startsAt,
          joinUrl: `${getFrontendUrl(this.env)}/demo/${classId}`
        });
      } else if (registration.phoneNumber) {
        // A first-time visitor is outside WhatsApp's 24h customer-service
        // window, so this free-form text may simply not deliver — attempted
        // anyway, best effort, and never awaited by the caller's response.
        await this.whatsapp.trySendText({
          to: registration.phoneNumber,
          body: `Hi ${registration.name}, you're registered for the demo class "${topic}". We'll see you there!`
        });
      }
    } catch (error) {
      this.logger.warn(
        `Demo registration confirmation for class ${classId} failed: ${(error as Error).message}`
      );
    }
  }
}
