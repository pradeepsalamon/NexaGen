import type { ApprovalActionType } from "@nexa-chess/types";
import type { ApprovalRequest, Prisma, User, UserRole } from "@prisma/client";
import type { ZodType } from "zod";
import type { PrismaTransactionClient } from "../prisma/prisma.service";

/** The authenticated caller, as handlers see it. */
export type ApprovalActor = Pick<User, "id" | "role" | "timezone">;

/** What a handler derives from a validated payload when a request is created. */
export interface PreparedApproval {
  batchId?: string | null;
  classId?: string | null;
  subjectUserId?: string | null;
  /** Snapshot of the affected state; compared again at approval. */
  currentValue: Prisma.InputJsonValue | null;
  /** What will happen if approved (usually the normalised payload). */
  requestedValue: Prisma.InputJsonValue;
  details?: Prisma.InputJsonValue | null;
  /** One PENDING request per key (DB partial unique index). */
  dedupeKey: string;
  /** Sooner than the catalogue TTL when the action stops making sense (e.g. class start). */
  expiresAt?: Date;
  /** Forced urgent regardless of what the requester ticked (e.g. close to class start). */
  urgent?: boolean;
}

/**
 * One handler per approval action (plan §2.3). The engine owns the lifecycle
 * — auth, claim, expiry, self-approval, duplicates, events — and calls these
 * hooks inside its transactions. Throw an HttpException to refuse.
 */
export interface ApprovalHandler<P = unknown> {
  readonly actionType: ApprovalActionType;
  readonly payloadSchema: ZodType<P>;
  /** Requester's scope check + snapshot, at creation. */
  prepare(tx: PrismaTransactionClient, requester: ApprovalActor, payload: P): Promise<PreparedApproval>;
  /**
   * At approval, inside the claim transaction: re-check the REQUESTER's
   * authority and that the state still matches `request.currentValue`. Throw a
   * ConflictException when it doesn't — nothing executes and the request stays
   * PENDING so the admin can reject it.
   */
  revalidate(tx: PrismaTransactionClient, request: ApprovalRequest): Promise<void>;
  /** The change itself, in the same transaction. Returns a JSON summary for the record. */
  execute(
    tx: PrismaTransactionClient,
    request: ApprovalRequest,
    reviewer: { id: string; role: UserRole }
  ): Promise<Prisma.InputJsonValue | null>;
  /** After commit (messaging, queues). Never throws into the caller. */
  afterCommit?(request: ApprovalRequest, outcome: "CREATED" | "APPROVED" | "REJECTED" | "CANCELLED"): void;
}

/** Nest token for the list of registered handlers. */
export const APPROVAL_HANDLERS = Symbol("APPROVAL_HANDLERS");
