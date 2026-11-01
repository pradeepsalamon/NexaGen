import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  computeCreditBreakdown,
  financialYear,
  formatDocumentNumber,
  type CreateCreditNoteRequest,
  type CreditNoteItem,
  type CreditNoteReason,
  type InvoiceLine
} from "@nexa-chess/types";
import { Prisma, type CreditNote, type User } from "@prisma/client";
import {
  PrismaService,
  type PrismaTransactionClient
} from "../prisma/prisma.service";
import { InvoiceAuditService } from "./invoice-audit.service";
import { InvoiceSettingsService } from "./invoice-settings.service";
import {
  normalizeBilling,
  normalizeLines,
  normalizeSeller
} from "./invoice.service";
import { assertOwnerOrAdmin, fullName } from "./payments-auth.helper";

type CreditNoteRow = Prisma.CreditNoteGetPayload<{
  include: {
    invoice: { select: { number: true } };
    refund: { select: { providerRefundId: true } };
    user: { select: { firstName: true; lastName: true } };
  };
}>;

const CREDIT_NOTE_INCLUDE = {
  invoice: { select: { number: true } },
  refund: { select: { providerRefundId: true } },
  user: { select: { firstName: true, lastName: true } }
} satisfies Prisma.CreditNoteInclude;

/**
 * Credit notes (§19).
 *
 * A refund never edits the invoice it reverses — an issued invoice is a
 * financial record, and silently rewriting one after the fact is exactly what
 * accounting rules exist to prevent. Instead the reversal gets its own
 * sequentially-numbered document that references the original.
 */
@Injectable()
export class CreditNoteService {
  constructor(
    private readonly audit: InvoiceAuditService,
    private readonly prisma: PrismaService,
    private readonly settings: InvoiceSettingsService
  ) {}

  /**
   * Issues the credit note for a settled refund, inside the refund's own
   * transaction.
   *
   * Idempotent on the unique `refundId`: reconciliation re-reading a refund the
   * gateway already settled returns the existing note rather than issuing a
   * second one. Handles both a full refund and a partial one (§22).
   */
  async issueForRefund(
    tx: PrismaTransactionClient,
    input: {
      invoiceId: string;
      refundId: string;
      amount: number;
      reason?: CreditNoteReason;
      note?: string | null;
      actorId?: string | null;
    }
  ): Promise<CreditNote | null> {
    const existing = await tx.creditNote.findUnique({
      where: { refundId: input.refundId }
    });
    if (existing) return existing;

    return this.create(tx, {
      invoiceId: input.invoiceId,
      refundId: input.refundId,
      amount: input.amount,
      reason: input.reason ?? "REFUND",
      note: input.note ?? null,
      actorId: input.actorId ?? null
    });
  }

  /** Admin-issued credit note with no refund behind it (a correction, a write-off). */
  async createForAdmin(
    actor: User,
    input: CreateCreditNoteRequest
  ): Promise<CreditNoteItem> {
    const created = await this.prisma.$transaction((tx) =>
      this.create(tx, {
        invoiceId: input.invoiceId,
        refundId: null,
        amount: input.amount ?? null,
        reason: input.reason,
        note: input.note ?? null,
        actorId: actor.id
      })
    );

    const row = await this.prisma.creditNote.findUniqueOrThrow({
      where: { id: created.id },
      include: CREDIT_NOTE_INCLUDE
    });
    return this.toItem(row);
  }

  private async create(
    tx: PrismaTransactionClient,
    input: {
      invoiceId: string;
      refundId: string | null;
      /** Null credits the whole invoice. */
      amount: number | null;
      reason: CreditNoteReason;
      note: string | null;
      actorId: string | null;
    }
  ): Promise<CreditNote> {
    const invoice = await tx.invoice.findUnique({
      where: { id: input.invoiceId }
    });
    if (!invoice) throw new NotFoundException("Invoice not found.");

    // Serialize concurrent credits for one invoice, so both cannot read the same prior total.
    await tx.$queryRaw`SELECT id FROM "invoices" WHERE id = ${invoice.id} FOR UPDATE`;

    const requested = input.amount ?? invoice.total;
    if (requested <= 0) {
      throw new BadRequestException("A credit note must be for a positive amount.");
    }

    // Everything already credited against this invoice, so repeated partial
    // refunds can never credit more than the invoice was worth.
    const priorCredits = await tx.creditNote.aggregate({
      where: { invoiceId: invoice.id },
      _sum: { total: true }
    });
    const alreadyCredited = priorCredits._sum.total ?? 0;
    const creditable = invoice.total - alreadyCredited;

    if (creditable <= 0) {
      throw new BadRequestException(
        "This invoice has already been credited in full."
      );
    }
    if (requested > creditable) {
      throw new BadRequestException(
        "A credit note cannot exceed the uncredited balance of the invoice."
      );
    }

    const breakdown = computeCreditBreakdown(
      {
        taxableAmount: invoice.taxableAmount,
        cgstAmount: invoice.cgstAmount,
        sgstAmount: invoice.sgstAmount,
        igstAmount: invoice.igstAmount,
        total: invoice.total
      },
      requested
    );

    const isFullCredit = alreadyCredited + requested >= invoice.total;

    const settings = await this.settings.get();
    const issuedAt = new Date();
    const year = financialYear(issuedAt);

    const sequence = await tx.creditNoteSequence.upsert({
      where: { year },
      create: { year, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } }
    });

    const lines = this.creditLines(
      normalizeLines(invoice.lines),
      invoice.total,
      breakdown,
      invoice.taxRatePercent
    );

    const creditNote = await tx.creditNote.create({
      data: {
        number: formatDocumentNumber(
          settings.creditNotePrefix,
          year,
          sequence.lastNumber
        ),
        invoiceId: invoice.id,
        userId: invoice.userId,
        refundId: input.refundId,
        reason: input.reason,
        note: input.note,

        subtotal: breakdown.subtotal,
        cgstAmount: breakdown.cgstAmount,
        sgstAmount: breakdown.sgstAmount,
        igstAmount: breakdown.igstAmount,
        taxTotal: breakdown.taxTotal,
        total: breakdown.total,
        currency: invoice.currency,

        isFullCredit,

        lines: lines as unknown as Prisma.InputJsonValue,
        // The credit note carries its own copies rather than joining the
        // invoice, for the same reason the invoice carries copies.
        billing: {
          name: invoice.billingName,
          email: invoice.billingEmail,
          phone: invoice.billingPhone,
          line1: invoice.billingLine1,
          line2: invoice.billingLine2,
          city: invoice.billingCity,
          state: invoice.billingState,
          stateCode: invoice.billingStateCode,
          postalCode: invoice.billingPostalCode,
          country: invoice.billingCountry,
          gstin: invoice.customerGstin,
          businessName: invoice.businessName
        } as unknown as Prisma.InputJsonValue,
        seller: invoice.seller as Prisma.InputJsonValue,

        issuedAt
      }
    });

    await this.audit.recordTx(tx, {
      event: "CREDIT_NOTE_CREATED",
      invoiceId: invoice.id,
      creditNoteId: creditNote.id,
      actorId: input.actorId,
      metadata: {
        number: creditNote.number,
        amount: breakdown.total,
        currency: invoice.currency,
        reason: input.reason,
        refundId: input.refundId
      }
    });

    return creditNote;
  }

  /**
   * The credited lines. A full credit reverses every original line as it was;
   * a partial one cannot honestly claim which item was returned, so it is a
   * single proportional line instead of pretending to itemise.
   */
  private creditLines(
    original: InvoiceLine[],
    invoiceTotal: number,
    breakdown: { subtotal: number; taxTotal: number; total: number },
    taxRatePercent: number
  ): InvoiceLine[] {
    if (breakdown.total >= invoiceTotal) return original;

    return [
      {
        productId: null,
        description: "Partial refund against the original invoice",
        quantity: 1,
        unitAmount: breakdown.subtotal,
        discountAmount: 0,
        taxRate: taxRatePercent,
        taxAmount: breakdown.taxTotal,
        amount: breakdown.subtotal
      }
    ];
  }

  // ── Reads ──

  async get(user: User, id: string): Promise<CreditNoteItem> {
    const row = await this.prisma.creditNote.findUnique({
      where: { id },
      include: CREDIT_NOTE_INCLUDE
    });
    if (!row) throw new NotFoundException("Credit note not found.");

    assertOwnerOrAdmin(user, row.userId);
    return this.toItem(row);
  }

  async getById(id: string): Promise<CreditNoteItem | null> {
    const row = await this.prisma.creditNote.findUnique({
      where: { id },
      include: CREDIT_NOTE_INCLUDE
    });
    return row ? this.toItem(row) : null;
  }

  async listForUser(userId: string): Promise<CreditNoteItem[]> {
    const rows = await this.prisma.creditNote.findMany({
      where: { userId },
      include: CREDIT_NOTE_INCLUDE,
      orderBy: { issuedAt: "desc" },
      take: 200
    });
    return rows.map((row) => this.toItem(row));
  }

  async listAll(limit = 200): Promise<CreditNoteItem[]> {
    const rows = await this.prisma.creditNote.findMany({
      include: CREDIT_NOTE_INCLUDE,
      orderBy: { issuedAt: "desc" },
      take: limit
    });
    return rows.map((row) => this.toItem(row));
  }

  toItem(row: CreditNoteRow): CreditNoteItem {
    return {
      id: row.id,
      number: row.number,
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoice.number,
      userId: row.userId,
      userName: fullName(row.user),
      refundId: row.refundId,
      providerRefundId: row.refund?.providerRefundId ?? null,

      reason: row.reason,
      note: row.note,

      subtotal: row.subtotal,
      cgstAmount: row.cgstAmount,
      sgstAmount: row.sgstAmount,
      igstAmount: row.igstAmount,
      taxTotal: row.taxTotal,
      total: row.total,
      currency: row.currency,

      isFullCredit: row.isFullCredit,

      lines: normalizeLines(row.lines),
      billing: normalizeBilling(row.billing),
      seller: normalizeSeller(row.seller),

      pdfStatus: row.pdfStatus,
      issuedAt: row.issuedAt.toISOString(),
      createdAt: row.createdAt.toISOString()
    };
  }
}
