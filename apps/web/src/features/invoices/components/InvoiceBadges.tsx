"use client";

import {
  INVOICE_PDF_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  TAX_TREATMENT_LABELS,
  type InvoiceDocumentStatus,
  type InvoicePdfStatus,
  type TaxTreatment
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";

type BadgeVariant =
  | "default"
  | "secondary"
  | "success"
  | "warning"
  | "info"
  | "destructive"
  | "outline";

const STATUS_VARIANTS: Record<InvoiceDocumentStatus, BadgeVariant> = {
  DRAFT: "outline",
  ISSUED: "info",
  PAID: "success",
  PARTIALLY_REFUNDED: "warning",
  REFUNDED: "secondary",
  VOID: "destructive"
};

export function InvoiceStatusBadge({ status }: { status: InvoiceDocumentStatus }) {
  return (
    <Badge variant={STATUS_VARIANTS[status]}>{INVOICE_STATUS_LABELS[status]}</Badge>
  );
}

const PDF_VARIANTS: Record<InvoicePdfStatus, BadgeVariant> = {
  PENDING: "outline",
  GENERATING: "info",
  READY: "success",
  FAILED: "destructive"
};

/**
 * Shown only when the PDF is not simply ready — a green "Ready" chip beside
 * every row is noise, whereas a failure is something an admin must see.
 */
export function InvoicePdfBadge({ status }: { status: InvoicePdfStatus }) {
  if (status === "READY") return null;
  return (
    <Badge variant={PDF_VARIANTS[status]}>
      PDF: {INVOICE_PDF_STATUS_LABELS[status]}
    </Badge>
  );
}

export function TaxTreatmentBadge({ treatment }: { treatment: TaxTreatment }) {
  if (treatment === "NONE") return null;
  return <Badge variant="outline">{TAX_TREATMENT_LABELS[treatment]}</Badge>;
}
