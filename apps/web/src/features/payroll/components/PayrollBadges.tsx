import {
  COACH_PAYROLL_RECORD_STATUS_LABELS,
  PAYOUT_STATUS_LABELS,
  PAYROLL_PERIOD_STATUS_LABELS,
  PAYSLIP_PDF_STATUS_LABELS,
  type CoachPayrollRecordStatus,
  type PayoutStatus,
  type PayrollPeriodStatus,
  type PayslipPdfStatus
} from "@nexa-chess/types";
import { Badge, type badgeVariants } from "@/components/ui/Badge";
import type { VariantProps } from "class-variance-authority";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const PERIOD_STATUS_VARIANTS: Record<PayrollPeriodStatus, BadgeVariant> = {
  DRAFT: "outline",
  CALCULATING: "info",
  REVIEW: "secondary",
  APPROVED: "info",
  FINALIZED: "success",
  PAID: "success",
  CANCELLED: "destructive"
};

export function PayrollPeriodStatusBadge({ status }: { status: PayrollPeriodStatus }) {
  return <Badge variant={PERIOD_STATUS_VARIANTS[status]}>{PAYROLL_PERIOD_STATUS_LABELS[status]}</Badge>;
}

const RECORD_STATUS_VARIANTS: Record<CoachPayrollRecordStatus, BadgeVariant> = {
  PENDING: "outline",
  CALCULATED: "secondary",
  REVIEWED: "info",
  APPROVED: "info",
  FINALIZED: "success",
  PAID: "success"
};

export function PayrollRecordStatusBadge({ status }: { status: CoachPayrollRecordStatus }) {
  return (
    <Badge variant={RECORD_STATUS_VARIANTS[status]}>
      {COACH_PAYROLL_RECORD_STATUS_LABELS[status]}
    </Badge>
  );
}

const PAYOUT_STATUS_VARIANTS: Record<PayoutStatus, BadgeVariant> = {
  PENDING: "outline",
  PROCESSING: "info",
  PAID: "success",
  FAILED: "destructive",
  CANCELLED: "secondary"
};

export function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  return <Badge variant={PAYOUT_STATUS_VARIANTS[status]}>{PAYOUT_STATUS_LABELS[status]}</Badge>;
}

const PDF_STATUS_VARIANTS: Record<PayslipPdfStatus, BadgeVariant> = {
  PENDING: "outline",
  GENERATING: "info",
  READY: "success",
  FAILED: "destructive"
};

export function PayslipPdfStatusBadge({ status }: { status: PayslipPdfStatus }) {
  return <Badge variant={PDF_STATUS_VARIANTS[status]}>{PAYSLIP_PDF_STATUS_LABELS[status]}</Badge>;
}
