import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import {
  checkRosterRows,
  isPlaceholderEmail,
  NO_EMAIL_DOMAIN,
  rosterImportRequestSchema,
  type ResendInviteResponse,
  type RosterImportResponse,
  type RosterImportRow,
  type RosterImportRowOutcome,
  type RosterImportRowResult
} from "@nexa-chess/types";
import { type User, UserRole, UserStatus } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { authenticateUser } from "../auth/authenticate";
import { createOpaqueToken, hashOpaqueToken, hashSecret } from "../auth/auth.utils";
import { parseOrBadRequest } from "../common/zod-body.pipe";
import { SystemNotifier } from "../mail/system-notifier.service";
import { isUniqueViolation } from "../payments/payments.util";
import { EntitlementService } from "../platform/entitlement.service";
import { PlanRestrictionException } from "../platform/plan-restriction.exception";
import { PrismaService } from "../prisma/prisma.service";
import { ReferralTrackerService } from "../referral/referral-tracker.service";
import { requireTenantId } from "../tenancy/tenant-sql";

/** How long an invite link works (same as a new academy's first super admin). */
export const ACCOUNT_INVITE_TTL_MS = 7 * 24 * 60 * 60_000;

type Actor = Pick<User, "id" | "role">;

/** A checked row plus what the academy's data says about it. */
type PlannedRow = {
  index: number;
  row: RosterImportRow | null;
  outcome: RosterImportRowOutcome;
  messages: string[];
  base: Pick<RosterImportRowResult, "batchName" | "email" | "firstName" | "lastName" | "role">;
  batchId: string | null;
};

/**
 * Roster import (docs/ROSTER_IMPORT.md): an academy admin adds students and
 * coaches from a CSV. `preview` runs every check and creates nothing; `import`
 * runs the same checks, then creates each row in its own transaction (a seat
 * limit stops only the rows that don't fit). Re-running a file is safe: rows
 * whose email already has an account are left alone.
 */
@Injectable()
export class RosterImportService {
  private readonly logger = new Logger(RosterImportService.name);
  private readonly frontendUrl = getFrontendUrl(getApiEnv()).replace(/\/+$/, "");

  constructor(
    private readonly entitlements: EntitlementService,
    private readonly jwtService: JwtService,
    private readonly notifier: SystemNotifier,
    private readonly prisma: PrismaService,
    @Optional() private readonly referralTracker?: ReferralTrackerService
  ) {}

  preview(accessToken: string | undefined, body: unknown): Promise<RosterImportResponse> {
    return this.run(accessToken, body, true);
  }

  import(accessToken: string | undefined, body: unknown): Promise<RosterImportResponse> {
    return this.run(accessToken, body, false);
  }

  /**
   * A fresh set-your-password link for an account that has never signed in
   * (imported, or made by an admin). Earlier unused links stop working.
   */
  async resendInvite(accessToken: string | undefined, userId: string): Promise<ResendInviteResponse> {
    const actor = await this.actor(accessToken);
    const target = await this.prisma.user.findUnique({
      where: { id: userId, isDeleted: false, isPlatformSupport: false }
    });
    if (!target) throw new NotFoundException("User not found.");
    if (actor.role === UserRole.ADMIN && (target.role === UserRole.ADMIN || target.role === UserRole.SUPER_ADMIN)) {
      throw new ForbiddenException("Admins cannot manage admin users.");
    }
    if (isPlaceholderEmail(target.email)) {
      throw new BadRequestException("Add this person's email first; the invite goes to their email.");
    }
    if (target.lastLoginAt) {
      throw new BadRequestException("This person has already signed in. They can use \"Forgot password\" instead.");
    }
    if (target.status !== UserStatus.ACTIVE) {
      throw new BadRequestException("Only an active account can be invited.");
    }
    const sent = await this.sendInvite(target);
    return { sent };
  }

  // ── internals ──────────────────────────────────────────────────────────

  private async run(accessToken: string | undefined, body: unknown, dryRun: boolean): Promise<RosterImportResponse> {
    const actor = await this.actor(accessToken);
    const request = parseOrBadRequest(rosterImportRequestSchema, body);
    const planned = await this.plan(request.rows);

    if (dryRun) return this.respond(true, planned.map((item) => this.result(item)));

    const results: RosterImportRowResult[] = [];
    for (const item of planned) {
      if (item.outcome !== "CREATE" || !item.row) {
        results.push(this.result(item));
        continue;
      }
      results.push(await this.createRow(actor, item, request.sendInvites));
    }
    const created = results.filter((result) => result.outcome === "CREATE").length;
    this.logger.log(`Roster import by ${actor.id}: ${created} created of ${results.length} rows`);
    return this.respond(false, results);
  }

  /** Every check: the file-only ones (shared with the browser), then existing accounts, batches and seats. */
  private async plan(rawRows: Array<Record<string, unknown>>): Promise<PlannedRow[]> {
    const checks = checkRosterRows(rawRows);
    const valid = checks.flatMap((check) => (check.ok ? [check.row] : []));

    const emails = [...new Set(valid.flatMap((row) => (row.email ? [row.email] : [])))];
    // Deleted accounts still hold their email (unique across deleted rows).
    const existing = emails.length
      ? await this.prisma.withDeleted.user.findMany({ select: { email: true }, where: { email: { in: emails } } })
      : [];
    const existingEmails = new Set(existing.map((user) => user.email.toLowerCase()));

    const batchNames = [...new Set(valid.flatMap((row) => (row.batch ? [row.batch.toLowerCase()] : [])))];
    const batches = batchNames.length
      ? await this.prisma.batch.findMany({
          select: { id: true, name: true },
          where: { isDeleted: false, OR: batchNames.map((name) => ({ name: { equals: name, mode: "insensitive" as const } })) }
        })
      : [];
    const batchesByName = new Map<string, Array<{ id: string; name: string }>>();
    for (const batch of batches) {
      const key = batch.name.trim().toLowerCase();
      batchesByName.set(key, [...(batchesByName.get(key) ?? []), batch]);
    }

    const [studentSeats, coachSeats] = await Promise.all([
      this.entitlements.seatsLeft(UserRole.STUDENT),
      this.entitlements.seatsLeft(UserRole.COACH)
    ]);
    const seatsLeft: Record<"STUDENT" | "COACH", number | null> = { COACH: coachSeats, STUDENT: studentSeats };

    return checks.map((check, index) => {
      if (!check.ok) {
        return {
          base: { batchName: null, email: check.email, firstName: check.firstName, lastName: check.lastName, role: null },
          batchId: null,
          index,
          messages: check.messages,
          outcome: "INVALID" as const,
          row: null
        };
      }
      const row = check.row;
      const base = {
        batchName: row.batch ?? null,
        email: row.email ?? null,
        firstName: row.firstName,
        lastName: row.lastName ?? null,
        role: row.role
      };
      if (row.email && existingEmails.has(row.email)) {
        return { base, batchId: null, index, messages: ["An account with this email already exists."], outcome: "EXISTS" as const, row };
      }
      let batchId: string | null = null;
      if (row.batch) {
        const matches = batchesByName.get(row.batch.trim().toLowerCase()) ?? [];
        if (matches.length === 0) {
          return { base, batchId, index, messages: [`No batch is named "${row.batch}".`], outcome: "INVALID" as const, row };
        }
        if (matches.length > 1) {
          return { base, batchId, index, messages: [`More than one batch is named "${row.batch}"; rename one first.`], outcome: "INVALID" as const, row };
        }
        batchId = matches[0].id;
      }
      const left = seatsLeft[row.role];
      if (left !== null) {
        if (left <= 0) {
          const what = row.role === "COACH" ? "coaches" : "students";
          return { base, batchId, index, messages: [`The academy's plan has no room for more ${what}.`], outcome: "NO_SEAT" as const, row };
        }
        seatsLeft[row.role] = left - 1;
      }
      return { base, batchId, index, messages: [], outcome: "CREATE" as const, row };
    });
  }

  private async createRow(actor: Actor, item: PlannedRow, sendInvites: boolean): Promise<RosterImportRowResult> {
    const row = item.row!;
    const role = row.role === "COACH" ? UserRole.COACH : UserRole.STUDENT;
    const email = row.email ?? `${role.toLowerCase()}-${randomBytes(8).toString("hex")}@${NO_EMAIL_DOMAIN}`;
    const tenantId = requireTenantId("user");
    try {
      const password = await hashSecret(createOpaqueToken());
      const user = await this.prisma.$transaction(async (tx) => {
        await this.entitlements.assertSeatAvailable(tx, role);
        const created = await tx.user.create({
          data: {
            createdById: actor.id,
            email,
            firstName: row.firstName,
            isEmailVerified: Boolean(row.email),
            lastName: row.lastName ?? null,
            password,
            phoneNumber: row.phone ?? null,
            role,
            status: UserStatus.ACTIVE
          }
        });
        if (role === UserRole.STUDENT) {
          await tx.studentProfile.create({
            data: {
              parentEmail: row.parentEmail ?? null,
              parentName: row.parentName ?? `${row.firstName} Parent`,
              parentPhone: row.parentPhone ?? null,
              userId: created.id
            }
          });
          if (item.batchId) {
            await tx.batchStudent.upsert({
              create: { batchId: item.batchId, studentId: created.id },
              update: { deletedAt: null, deletedById: null, isDeleted: false },
              where: { batchId_studentId: { batchId: item.batchId, studentId: created.id } }
            });
          }
        } else {
          // An admin adding the account *is* the approval, as in UserService.create.
          await tx.coachProfile.create({
            data: { approvalStatus: UserStatus.ACTIVE, approvedAt: new Date(), approvedById: actor.id, userId: created.id }
          });
          if (item.batchId) {
            await tx.batchCoach.upsert({
              create: { batchId: item.batchId, coachId: created.id },
              update: { deletedAt: null, deletedById: null, isDeleted: false },
              where: { batchId_coachId: { batchId: item.batchId, coachId: created.id } }
            });
          }
        }
        return created;
      });
      if (row.email) await this.referralTracker?.linkSignup({ email: user.email, userId: user.id });
      const invited = sendInvites && Boolean(row.email) ? await this.sendInvite(user) : false;
      return { ...this.result(item), invited, userId: user.id };
    } catch (error) {
      if (error instanceof PlanRestrictionException) {
        const what = role === UserRole.COACH ? "coaches" : "students";
        return { ...this.result(item), messages: [`The academy's plan has no room for more ${what}.`], outcome: "NO_SEAT" };
      }
      if (isUniqueViolation(error)) {
        return { ...this.result(item), messages: ["This email is already used by another account."], outcome: "EXISTS" };
      }
      this.logger.error(`Roster import row ${item.index + 1} in ${tenantId} failed`, error as Error);
      return { ...this.result(item), messages: ["This row couldn't be saved. Try importing it again."], outcome: "INVALID" };
    }
  }

  /** Earlier unused links go (one live invite per person), then a 7-day link is sent. Never throws. */
  private async sendInvite(user: Pick<User, "email" | "firstName" | "id" | "phoneNumber">): Promise<boolean> {
    try {
      const token = createOpaqueToken();
      await this.prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.deleteMany({ where: { usedAt: null, userId: user.id } });
        await tx.passwordResetToken.create({
          data: { expiresAt: new Date(Date.now() + ACCOUNT_INVITE_TTL_MS), tokenHash: hashOpaqueToken(token), userId: user.id }
        });
      });
      const link = new URL("/reset-password", this.frontendUrl);
      link.searchParams.set("token", token);
      const sent = await this.notifier.send(
        "ACCOUNT_INVITE",
        { email: user.email, phone: user.phoneNumber, userId: user.id },
        { "links.reset": link.toString(), "recipient.firstName": user.firstName }
      );
      return sent.outcomes.EMAIL === "SENT" || sent.outcomes.WHATSAPP === "SENT";
    } catch (error) {
      this.logger.warn(`Invite for ${user.id} failed: ${(error as Error).message}`);
      return false;
    }
  }

  private result(item: PlannedRow): RosterImportRowResult {
    return { ...item.base, messages: item.messages, outcome: item.outcome, row: item.index + 1 };
  }

  private respond(dryRun: boolean, rows: RosterImportRowResult[]): RosterImportResponse {
    const counts: Record<RosterImportRowOutcome, number> = { CREATE: 0, EXISTS: 0, INVALID: 0, NO_SEAT: 0 };
    for (const row of rows) counts[row.outcome] += 1;
    return { counts, dryRun, rows };
  }

  /** Academy admins and super admins; a platform operator imports through a support visit (the academy's support account). */
  private async actor(accessToken: string | undefined): Promise<Actor> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("You cannot manage users.");
    }
    return user;
  }
}
