import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { getApiEnv } from "@nexa-chess/config/api";
import { DEFAULT_TENANT_ID, LEAD_STATUS_LABELS } from "@nexa-chess/types";
import type { LeadStatus } from "@prisma/client";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { ReferralTrackerService } from "../referral/referral-tracker.service";
import { runInTenant } from "../tenancy/tenant-context";
import { FRAPPE_LEAD_STAGES, FrappeCrmPushService, type FrappeCrmConfig } from "./frappe-crm-push.service";

/** Won stages: a paid or enrolled family is NexaGen's fact; Frappe never moves a lead out of them. */
const WON_STATUSES: readonly LeadStatus[] = ["CONVERTED", "ACTIVE_STUDENT"];
/** Leads untouched for longer than this are no longer read back (Frappe changes to them stay there). */
export const STAGE_RETURN_WINDOW_DAYS = 180;
/** Frappe leads read per request (one `name in [...]` filter). */
export const STAGE_RETURN_BATCH = 50;
/** At most this many leads per run; the rest are read on the next run. */
const MAX_PER_RUN = 2000;

/**
 * Frappe stage name → NexaGen stage, built from `FRAPPE_LEAD_STAGES` so the two can't drift.
 * "Enrolled" is both Converted and Active student there; it comes back as Converted. Older
 * Frappe names (New, New Inquiry, Offer Sent, Junk…) are not in it and are ignored.
 */
export const LEAD_STATUS_FROM_FRAPPE: Readonly<Record<string, LeadStatus>> = Object.freeze(
  Object.fromEntries(
    (Object.entries(FRAPPE_LEAD_STAGES) as [LeadStatus, string][])
      .filter(([status]) => status !== "ACTIVE_STUDENT")
      .map(([status, name]) => [name, status])
  )
);

/**
 * The one rule for the return path (docs/LEAD_STAGES.md "The return path"): the stage a lead
 * moves to because of Frappe, or null when it stays.
 *
 * Frappe's stage is a person's change only when it differs from the stage NexaGen last copied
 * there (`sentStatus`; a lead copied before stage sync has none, so its own stage is the baseline).
 * Unknown names are ignored, and nothing in Frappe moves a won lead.
 */
export function stageFromFrappe(input: {
  frappeStage: string | null | undefined;
  leadStatus: LeadStatus;
  sentStatus: LeadStatus | null;
}): LeadStatus | null {
  if (!input.frappeStage) return null;
  if (!Object.prototype.hasOwnProperty.call(LEAD_STATUS_FROM_FRAPPE, input.frappeStage)) return null;
  const target = LEAD_STATUS_FROM_FRAPPE[input.frappeStage];
  const baseline = input.sentStatus ?? input.leadStatus;
  if (FRAPPE_LEAD_STAGES[baseline] === input.frappeStage) return null;
  if (WON_STATUSES.includes(input.leadStatus)) return null;
  if (FRAPPE_LEAD_STAGES[input.leadStatus] === input.frappeStage) return null;
  return target;
}

type ReturnRow = {
  externalId: string;
  id: string;
  lead: { convertedAt: Date | null; id: string; status: LeadStatus };
  sentStatus: LeadStatus | null;
};

export type StageReturnResult = { checked: number; moved: number };

/** Thrown inside the transaction to undo a half-made change after a lost race. */
class LostRace extends Error {}

/**
 * The return half of the one pipeline: a stage a salesperson sets in Frappe comes back to
 * NexaGen's lead (Nexa's academy only), as if set on the Leads page — status-filtered claim,
 * timeline entry, referral progress — and is then recorded as copied (`sentStatus`), so the
 * push never sends it back (no loop). Off unless FRAPPE_CRM_STAGE_RETURN and
 * FRAPPE_CRM_STAGE_SYNC are both on and the Frappe push is configured.
 */
@Injectable()
export class FrappeCrmStageReturnService {
  private readonly logger = new Logger(FrappeCrmStageReturnService.name);
  private warnedNoSync = false;
  /** Pause between Frappe reads, so a big run stays far below Frappe's rate limits. */
  pauseMs = 500;

  constructor(
    private readonly jobLocks: JobLockService,
    private readonly prisma: PrismaService,
    private readonly push: FrappeCrmPushService,
    private readonly referrals: ReferralTrackerService
  ) {}

  /** Null = off. A method so tests can switch it on. */
  config(): FrappeCrmConfig | null {
    if (!getApiEnv().FRAPPE_CRM_STAGE_RETURN) return null;
    const config = this.push.config();
    if (!config) return null;
    if (!config.stageSync) {
      if (!this.warnedNoSync) {
        this.warnedNoSync = true;
        this.logger.warn("FRAPPE_CRM_STAGE_RETURN is on but FRAPPE_CRM_STAGE_SYNC is off: the return path stays off.");
      }
      return null;
    }
    return config;
  }

  /** Every 15 minutes (second 0 of minutes 0, 15, 30, 45). */
  @Cron("0 */15 * * * *")
  async sweep(): Promise<void> {
    const config = this.config();
    if (!config) return;
    await this.jobLocks.runExclusive(JOB_LOCKS.crmStageReturn, () =>
      runInTenant(DEFAULT_TENANT_ID, "job:crm.stage-return", () => this.run(config))
    );
  }

  /** Reads Frappe's stage for every copied open lead and takes over a person's change. Call inside Nexa's academy. */
  async run(config: FrappeCrmConfig): Promise<StageReturnResult> {
    const since = new Date(Date.now() - STAGE_RETURN_WINDOW_DAYS * 24 * 60 * 60_000);
    let cursor: string | undefined;
    let checked = 0;
    let moved = 0;
    while (checked < MAX_PER_RUN) {
      const rows: ReturnRow[] = (
        await this.prisma.crmLeadPush.findMany({
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: { externalId: true, id: true, lead: { select: { convertedAt: true, id: true, status: true } }, sentStatus: true },
          take: STAGE_RETURN_BATCH,
          // A PENDING row has a NexaGen change on its way to Frappe: Frappe's older stage must not undo it.
          where: {
            externalId: { not: null },
            lead: { status: { notIn: [...WON_STATUSES] }, updatedAt: { gte: since } },
            status: { in: ["SENT", "FAILED"] }
          }
        })
      ).filter((row): row is ReturnRow => row.externalId !== null);
      if (rows.length === 0) break;
      cursor = rows[rows.length - 1].id;
      if (checked > 0 && this.pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, this.pauseMs));

      const stages = await this.readStages(config, rows.map((row) => row.externalId));
      for (const row of rows) {
        const frappeStage = stages.get(row.externalId);
        const target = stageFromFrappe({ frappeStage, leadStatus: row.lead.status, sentStatus: row.sentStatus });
        if (target && frappeStage && (await this.take(row, frappeStage, target))) moved += 1;
      }
      checked += rows.length;
      if (rows.length < STAGE_RETURN_BATCH) break;
    }
    if (moved > 0) this.logger.log(`Took ${moved} stage change(s) from Frappe CRM.`);
    return { checked, moved };
  }

  /** Frappe's current stage for each lead name (a lead deleted there is simply missing). */
  private async readStages(config: FrappeCrmConfig, names: string[]): Promise<Map<string, string>> {
    const query =
      `?fields=${encodeURIComponent(JSON.stringify(["name", "status"]))}` +
      `&filters=${encodeURIComponent(JSON.stringify([["name", "in", names]]))}` +
      `&limit_page_length=${names.length}`;
    const found = (await this.push.request(config, "GET", `/api/resource/CRM%20Lead${query}`)) as { data?: unknown };
    const stages = new Map<string, string>();
    if (!Array.isArray(found?.data)) return stages;
    for (const item of found.data as { name?: unknown; status?: unknown }[]) {
      if (typeof item?.name === "string" && typeof item.status === "string") stages.set(item.name, item.status);
    }
    return stages;
  }

  /**
   * Applies one person's change from Frappe. Both claims must hold: the lead still has the stage
   * read (a NexaGen change meanwhile wins) and the push row still says what was copied (a send
   * that started meanwhile wins). Returns whether the lead moved.
   */
  async take(row: ReturnRow, frappeStage: string, target: LeadStatus): Promise<boolean> {
    const now = new Date();
    const from = row.lead.status;
    try {
      await this.prisma.$transaction(async (tx) => {
        const lead = await tx.lead.updateMany({
          data: {
            lastActivityAt: now,
            status: target,
            ...(WON_STATUSES.includes(target) && !row.lead.convertedAt ? { convertedAt: now } : {})
          },
          where: { id: row.lead.id, status: from }
        });
        if (lead.count !== 1) throw new LostRace();
        const copied = await tx.crmLeadPush.updateMany({
          data: { sentStatus: target },
          where: { id: row.id, sentStatus: row.sentStatus, status: { in: ["SENT", "FAILED"] } }
        });
        if (copied.count !== 1) throw new LostRace();
        await tx.leadActivity.create({
          data: {
            activityType: "STATUS_CHANGED",
            description: `Frappe CRM lead ${row.externalId} is at "${frappeStage}".`,
            leadId: row.lead.id,
            title: `Changed in Frappe: ${LEAD_STATUS_LABELS[from]} → ${LEAD_STATUS_LABELS[target]}`
          }
        });
      });
    } catch (error) {
      if (error instanceof LostRace) return false;
      throw error;
    }
    await this.referrals.onLeadStatus(row.lead.id, target, null);
    return true;
  }
}
