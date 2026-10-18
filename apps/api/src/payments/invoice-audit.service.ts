import { Injectable, Logger } from "@nestjs/common";
import type { InvoiceAuditEntry, InvoiceEvent } from "@nexa-chess/types";
import { InvoiceEventType, Prisma } from "@prisma/client";
import {
  PrismaService,
  type PrismaTransactionClient
} from "../prisma/prisma.service";
import { fullName } from "./payments-auth.helper";

type AuditInput = {
  event: InvoiceEvent;
  invoiceId?: string | null;
  creditNoteId?: string | null;
  /** Null for anything a webhook, cron or worker did on its own. */
  actorId?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Invoice audit trail (§21). Append-only: nothing here updates or deletes a
 * row, because the point of the trail is that it cannot be tidied up.
 */
@Injectable()
export class InvoiceAuditService {
  private readonly logger = new Logger(InvoiceAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records inside a caller's transaction, so the event and the change it
   * describes commit or roll back together.
   */
  async recordTx(
    tx: PrismaTransactionClient,
    input: AuditInput
  ): Promise<void> {
    await tx.invoiceAuditLog.create({ data: this.toData(input) });
  }

  /**
   * Fire-and-forget for events outside a transaction (a download, an email).
   * A failed audit write is logged and swallowed — losing the trail entry is
   * bad, but failing the customer's download to preserve it is worse.
   */
  async record(input: AuditInput): Promise<void> {
    try {
      await this.prisma.invoiceAuditLog.create({ data: this.toData(input) });
    } catch (error) {
      this.logger.error(
        `Failed to write invoice audit entry ${input.event}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  recordInBackground(input: AuditInput): void {
    void this.record(input);
  }

  async listForInvoice(invoiceId: string): Promise<InvoiceAuditEntry[]> {
    const rows = await this.prisma.invoiceAuditLog.findMany({
      where: { invoiceId },
      include: {
        actor: { select: { firstName: true, lastName: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 200
    });

    return rows.map((row) => ({
      id: row.id,
      invoiceId: row.invoiceId,
      creditNoteId: row.creditNoteId,
      event: row.event as InvoiceEvent,
      actorId: row.actorId,
      actorName: fullName(row.actor),
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt.toISOString()
    }));
  }

  private toData(input: AuditInput): Prisma.InvoiceAuditLogUncheckedCreateInput {
    return {
      event: input.event as InvoiceEventType,
      invoiceId: input.invoiceId ?? null,
      creditNoteId: input.creditNoteId ?? null,
      actorId: input.actorId ?? null,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined
    };
  }
}
