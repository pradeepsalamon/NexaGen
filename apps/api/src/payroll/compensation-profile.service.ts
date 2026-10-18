import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CompensationProfileItem,
  CompensationRateItem,
  CreateCompensationRateRequest,
  UpdateCompensationProfileRequest
} from "@nexa-chess/types";
import type { CoachCompensationProfile, CoachCompensationRate, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { fullName } from "../payments/payments-auth.helper";
import { PayrollAuditService } from "./payroll-audit.service";

type CoachIdentity = { name: string; email: string };

const DEFAULT_ENGAGEMENT_TYPE = "EMPLOYEE" as const;
const DEFAULT_COMPENSATION_MODEL = "HOURLY" as const;

/**
 * Admin CRUD for a coach's compensation configuration (§13/§14/§26). A rate
 * "change" always closes the previous row's `effectiveTo` and inserts a new
 * row — a past rate's value is never mutated in place, so a historical
 * payroll period always resolves the rate that was actually in force when
 * it ran.
 */
@Injectable()
export class CompensationProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PayrollAuditService
  ) {}

  /** Every coach's compensation profile (a lazy default for one that was never configured). */
  async listProfiles(): Promise<CompensationProfileItem[]> {
    const coaches = await this.prisma.user.findMany({
      where: { role: "COACH" },
      select: { id: true }
    });
    return Promise.all(coaches.map((c) => this.getProfile(c.id)));
  }

  /** Read-only — does not persist the lazy default, so a GET has no side effect. */
  async getProfile(coachId: string): Promise<CompensationProfileItem> {
    const [profile, rates, coach] = await Promise.all([
      this.prisma.coachCompensationProfile.findUnique({ where: { coachId } }),
      this.listRateRows(coachId),
      this.getCoachIdentity(coachId)
    ]);

    if (profile) return this.toItem(profile, rates, coach);

    return {
      id: "",
      coachId,
      coachName: coach.name,
      coachEmail: coach.email,
      engagementType: DEFAULT_ENGAGEMENT_TYPE,
      defaultCompensationModel: DEFAULT_COMPENSATION_MODEL,
      currency: "INR",
      paymentMethod: null,
      paymentDetails: null,
      panNumber: null,
      gstin: null,
      taxTreatment: null,
      notes: null,
      rates: rates.map((r) => this.toRateItem(r)),
      createdAt: "",
      updatedAt: ""
    };
  }

  private async getCoachIdentity(coachId: string): Promise<CoachIdentity> {
    const user = await this.prisma.user.findUnique({
      where: { id: coachId },
      select: { firstName: true, lastName: true, email: true }
    });
    return { name: user ? (fullName(user) ?? user.email) : coachId, email: user?.email ?? "" };
  }

  async updateProfile(
    coachId: string,
    actorId: string,
    dto: UpdateCompensationProfileRequest
  ): Promise<CompensationProfileItem> {
    const existing = await this.prisma.coachCompensationProfile.findUnique({ where: { coachId } });
    if (!existing) {
      const coach = await this.prisma.user.findFirst({ select: { id: true }, where: { id: coachId, role: "COACH" } });
      if (!coach) throw new NotFoundException("Coach not found.");
    }

    const profile = existing
      ? await this.prisma.coachCompensationProfile.update({
          where: { coachId },
          data: {
            engagementType: dto.engagementType,
            defaultCompensationModel: dto.defaultCompensationModel,
            currency: dto.currency,
            paymentMethod: dto.paymentMethod,
            paymentDetails: dto.paymentDetails as Prisma.InputJsonValue | undefined,
            panNumber: dto.panNumber,
            gstin: dto.gstin,
            notes: dto.notes
          }
        })
      : await this.prisma.coachCompensationProfile.create({
          data: {
            coachId,
            engagementType: dto.engagementType ?? DEFAULT_ENGAGEMENT_TYPE,
            defaultCompensationModel: dto.defaultCompensationModel ?? DEFAULT_COMPENSATION_MODEL,
            currency: dto.currency ?? "INR",
            paymentMethod: dto.paymentMethod,
            paymentDetails: dto.paymentDetails as Prisma.InputJsonValue | undefined,
            panNumber: dto.panNumber,
            gstin: dto.gstin,
            notes: dto.notes,
            createdById: actorId
          }
        });

    await this.audit.log({
      entity: "CoachCompensationProfile",
      entityId: profile.id,
      action: existing ? "COMPENSATION_PROFILE_UPDATED" : "COMPENSATION_PROFILE_CREATED",
      userId: actorId,
      metadata: {
        coachId,
        changedFields: Object.keys(dto)
      }
    });

    const [rates, coach] = await Promise.all([
      this.listRateRows(coachId),
      this.getCoachIdentity(coachId)
    ]);
    return this.toItem(profile, rates, coach);
  }

  async listRates(coachId: string): Promise<CompensationRateItem[]> {
    return (await this.listRateRows(coachId)).map((r) => this.toRateItem(r));
  }

  async addRate(
    coachId: string,
    actorId: string,
    dto: CreateCompensationRateRequest
  ): Promise<CompensationRateItem> {
    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    if (effectiveTo && effectiveTo <= effectiveFrom) {
      throw new BadRequestException("The end date must be after the start date.");
    }
    const scopeKey = JSON.stringify(dto.scopeConfig ?? null);

    let toClose: { id: string }[] = [];
    const rate = await this.prisma.$transaction(async (tx) => {
      const sameScope = (
        await tx.coachCompensationRate.findMany({
          where: { coachId, calculationType: dto.calculationType }
        })
      ).filter((r) => JSON.stringify(r.scopeConfig ?? null) === scopeKey);
      const openEnded = sameScope.filter((r) => r.effectiveTo === null);
      toClose = openEnded.filter((r) => r.effectiveFrom < effectiveFrom);
      const closing = new Set(toClose.map((r) => r.id));
      // Any remaining rate that intersects [effectiveFrom, effectiveTo) makes the resolver's pick arbitrary.
      const overlaps = sameScope.some(
        (r) =>
          !closing.has(r.id) &&
          (!effectiveTo || r.effectiveFrom < effectiveTo) &&
          (!r.effectiveTo || r.effectiveTo > effectiveFrom)
      );
      if (overlaps) {
        throw new ConflictException(
          "Another rate for this scope already covers part of that period. End it first."
        );
      }
      for (const previous of toClose) {
        await tx.coachCompensationRate.update({
          where: { id: previous.id },
          data: { effectiveTo: effectiveFrom }
        });
      }
      return tx.coachCompensationRate.create({
        data: {
          coachId,
          compensationModel: dto.compensationModel,
          calculationType: dto.calculationType,
          rateMinor: dto.rateMinor,
          percentageBps: dto.percentageBps,
          tierConfig: dto.tierConfig as unknown as Prisma.InputJsonValue,
          scopeConfig: dto.scopeConfig as unknown as Prisma.InputJsonValue,
          effectiveFrom,
          effectiveTo,
          createdById: actorId
        }
      });
    });

    await this.audit.log({
      entity: "CoachCompensationRate",
      entityId: rate.id,
      action: "COMPENSATION_RATE_ADDED",
      userId: actorId,
      metadata: {
        coachId,
        calculationType: dto.calculationType,
        rateMinor: dto.rateMinor,
        effectiveFrom: dto.effectiveFrom,
        closedPreviousRateIds: toClose.map((r) => r.id)
      }
    });

    return this.toRateItem(rate);
  }

  /** Ends a rate without replacing it (e.g. a compensation model retired entirely). */
  async closeRate(rateId: string, actorId: string, effectiveTo: string): Promise<CompensationRateItem> {
    const existing = await this.prisma.coachCompensationRate.findUnique({ where: { id: rateId } });
    if (!existing) throw new NotFoundException("Compensation rate not found.");
    if (existing.effectiveTo) {
      throw new ConflictException("This rate already has an end date.");
    }

    const rate = await this.prisma.coachCompensationRate.update({
      where: { id: rateId },
      data: { effectiveTo: new Date(effectiveTo) }
    });

    await this.audit.log({
      entity: "CoachCompensationRate",
      entityId: rateId,
      action: "COMPENSATION_RATE_CLOSED",
      userId: actorId,
      metadata: { effectiveTo }
    });

    return this.toRateItem(rate);
  }

  private listRateRows(coachId: string) {
    return this.prisma.coachCompensationRate.findMany({
      where: { coachId },
      orderBy: { effectiveFrom: "desc" }
    });
  }

  private toItem(
    profile: CoachCompensationProfile,
    rates: CoachCompensationRate[],
    coach: CoachIdentity
  ): CompensationProfileItem {
    return {
      id: profile.id,
      coachId: profile.coachId,
      coachName: coach.name,
      coachEmail: coach.email,
      engagementType: profile.engagementType,
      defaultCompensationModel: profile.defaultCompensationModel,
      currency: profile.currency,
      paymentMethod: profile.paymentMethod,
      paymentDetails: (profile.paymentDetails as Record<string, unknown> | null) ?? null,
      panNumber: profile.panNumber,
      gstin: profile.gstin,
      taxTreatment: profile.taxTreatment,
      notes: profile.notes,
      rates: rates.map((r) => this.toRateItem(r)),
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString()
    };
  }

  private toRateItem(rate: CoachCompensationRate): CompensationRateItem {
    return {
      id: rate.id,
      coachId: rate.coachId,
      compensationModel: rate.compensationModel,
      calculationType: rate.calculationType,
      rateMinor: rate.rateMinor,
      percentageBps: rate.percentageBps,
      tierConfig: rate.tierConfig as CompensationRateItem["tierConfig"],
      scopeConfig: rate.scopeConfig as CompensationRateItem["scopeConfig"],
      effectiveFrom: rate.effectiveFrom.toISOString(),
      effectiveTo: rate.effectiveTo?.toISOString() ?? null,
      createdById: rate.createdById,
      createdAt: rate.createdAt.toISOString(),
      updatedAt: rate.updatedAt.toISOString()
    };
  }
}
