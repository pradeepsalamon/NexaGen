"use client";

import { useState } from "react";
import { Download, RotateCw, Undo2 } from "lucide-react";
import {
  API_ROUTES,
  formatMoney,
  PAYMENT_METHOD_KINDS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_SOURCE_LABELS,
  PAYMENT_SOURCES,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUSES,
  type PaymentListItem,
  type PaymentListQuery,
  type PaymentStatus
} from "@nexa-chess/types";
import { getWebEnv } from "@nexa-chess/config/web";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { Skeleton } from "@/components/ui/Skeleton";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import {
  useAdminPayments,
  useReconcilePayment
} from "../hooks/usePaymentsApi";
import { RefundDialog } from "./RefundDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useTableSort } from "@/hooks/useTableSort";
import { SortButton } from "@/components/ui/DataTableSortButton";
import { DateStringPicker } from "@/components/ui/DatePicker";

const STATUS_VARIANT: Record<
  PaymentStatus,
  "success" | "destructive" | "warning" | "secondary" | "outline"
> = {
  CREATED: "outline",
  PENDING: "warning",
  PROCESSING: "warning",
  AUTHORIZED: "warning",
  PAID: "success",
  FAILED: "destructive",
  CANCELLED: "secondary",
  EXPIRED: "secondary",
  REFUND_PENDING: "warning",
  PARTIALLY_REFUNDED: "secondary",
  REFUNDED: "secondary"
};

const API_BASE_URL = getWebEnv({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL
}).NEXT_PUBLIC_API_URL;

/** The admin payment table (§16) with its filters, export and refund action. */
export function PaymentsTablePanel() {
  const timeZone = useUserTimeZone();
  const [filters, setFilters] = useState<Partial<PaymentListQuery>>({
    page: 1,
    pageSize: 25
  });
  const [refunding, setRefunding] = useState<PaymentListItem | null>(null);

  const { data, isLoading } = useAdminPayments(filters);
  const { rows: payments, sortProps } = useTableSort({
    rows: data?.payments,
    accessors: {
      amount: (p) => p.amount,
      date: (p) => p.createdAt,
      gateway: (p) => PAYMENT_SOURCE_LABELS[p.provider],
      method: (p) => (p.method ? PAYMENT_METHOD_LABELS[p.method] : null),
      order: (p) => p.orderNumber,
      status: (p) => PAYMENT_STATUS_LABELS[p.status],
      transaction: (p) => p.providerPaymentId,
      user: (p) => p.userName
    },
    initialKey: "date"
  });
  const reconcile = useReconcilePayment();

  const set = (patch: Partial<PaymentListQuery>) =>
    setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));

  const exportHref = `${API_BASE_URL}${API_ROUTES.adminPayments.export}?${new URLSearchParams(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)])
  ).toString()}`;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end justify-end gap-3 p-4">
        <div className="min-w-48 flex-1">
          <Input
            aria-label="Search payments"
            onChange={(event) => set({ search: event.target.value })}
            placeholder="Order, email, transaction ID…"
            value={filters.search ?? ""}
          />
        </div>

        <div className="min-w-36">
          <Select
            aria-label="Filter by gateway"
            onChange={(event) =>
              set({
                provider: (event.target.value ||
                  undefined) as PaymentListQuery["provider"]
              })
            }
            options={PAYMENT_SOURCES.map((provider) => ({
              label: PAYMENT_SOURCE_LABELS[provider],
              value: provider
            }))}
            placeholder="Any gateway"
            value={filters.provider ?? ""}
          />
        </div>

        <div className="min-w-36">
          <Select
            aria-label="Filter by status"
            onChange={(event) =>
              set({
                status: (event.target.value ||
                  undefined) as PaymentListQuery["status"]
              })
            }
            options={PAYMENT_STATUSES.map((status) => ({
              label: PAYMENT_STATUS_LABELS[status],
              value: status
            }))}
            placeholder="Any status"
            value={filters.status ?? ""}
          />
        </div>

        <div className="min-w-36">
          <Select
            aria-label="Filter by method"
            onChange={(event) =>
              set({
                method: (event.target.value ||
                  undefined) as PaymentListQuery["method"]
              })
            }
            options={PAYMENT_METHOD_KINDS.map((method) => ({
              label: PAYMENT_METHOD_LABELS[method],
              value: method
            }))}
            placeholder="Any method"
            value={filters.method ?? ""}
          />
        </div>

        <div className="min-w-36">
          <DateStringPicker
            aria-label="From date"
            onChange={(value) => set({ from: value || undefined })}
            
            value={filters.from ?? ""} placeholder="From date"
          />
        </div>

        <div className="min-w-36">
          <DateStringPicker
            aria-label="To date"
            onChange={(value) => set({ to: value || undefined })}
            
            value={filters.to ?? ""} placeholder="To date"
          />
        </div>

        <SimpleTooltip label="Download these rows as CSV">
          <Button
            aria-label="Export payments as CSV"
            asChild
            className="size-10 rounded-full border-app-border p-0 hover:bg-primary hover:text-white"
            size="icon"
            variant="outline"
          >
            <a download href={exportHref}>
              <Download className="size-4" strokeWidth={2.5} />
            </a>
          </Button>
        </SimpleTooltip>
      </Card>

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : !data || data.payments.length === 0 ? (
        <EmptyState
          description="No payments match these filters."
          title="Nothing to show"
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table className="w-full min-w-[900px] text-sm">
              <TableHeader className="border-b border-app-border bg-app-soft text-left">
                <TableRow className="text-xs uppercase tracking-wide text-app-muted">
                  <TableHead className="px-4 py-3"><SortButton label="Date" {...sortProps("date")} /></TableHead>
                  <TableHead className="px-4 py-3"><SortButton label="User" {...sortProps("user")} /></TableHead>
                  <TableHead className="px-4 py-3"><SortButton label="Order" {...sortProps("order")} /></TableHead>
                  <TableHead className="px-4 py-3 text-right"><SortButton label="Amount" {...sortProps("amount")} /></TableHead>
                  <TableHead className="px-4 py-3"><SortButton label="Method" {...sortProps("method")} /></TableHead>
                  <TableHead className="px-4 py-3"><SortButton label="Gateway" {...sortProps("gateway")} /></TableHead>
                  <TableHead className="px-4 py-3"><SortButton label="Status" {...sortProps("status")} /></TableHead>
                  <TableHead className="px-4 py-3"><SortButton label="Transaction ID" {...sortProps("transaction")} /></TableHead>
                  <TableHead className="px-4 py-3 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow
                    className="border-b border-app-border last:border-b-0"
                    key={payment.id}
                  >
                    <TableCell className="text-left whitespace-nowrap px-4 py-3 text-app-muted">
                      {formatDateTime(payment.createdAt, timeZone)}
                    </TableCell>
                    <TableCell className="text-left px-4 py-3">
                      <span className="block font-semibold text-app-text">
                        {payment.userName ?? "—"}
                      </span>
                      <span className="block text-xs text-app-muted">
                        {payment.userEmail ?? ""}
                      </span>
                    </TableCell>
                    <TableCell className="text-left px-4 py-3">
                      <span className="block font-mono text-xs text-app-text">
                        {payment.orderNumber}
                      </span>
                      <span className="block text-xs text-app-muted">
                        {payment.planName ?? ""}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-app-text">
                      {formatMoney(payment.amount, payment.currency)}
                      {payment.amountRefunded > 0 ? (
                        <span className="block text-xs font-normal text-app-muted">
                          −{formatMoney(payment.amountRefunded, payment.currency)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-left px-4 py-3 text-app-muted">
                      {payment.method
                        ? PAYMENT_METHOD_LABELS[payment.method]
                        : "—"}
                    </TableCell>
                    <TableCell className="text-left px-4 py-3 text-app-muted">
                      {PAYMENT_SOURCE_LABELS[payment.provider]}
                    </TableCell>
                    <TableCell className="text-left px-4 py-3">
                      <Badge variant={STATUS_VARIANT[payment.status]}>
                        {PAYMENT_STATUS_LABELS[payment.status]}
                      </Badge>
                      {payment.attempts > 1 ? (
                        <span className="ml-1 text-xs text-app-muted">
                          {payment.attempts} attempts
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-left max-w-[160px] truncate px-4 py-3 font-mono text-xs text-app-muted">
                      {payment.providerPaymentId ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <SimpleTooltip label="Re-read this payment from the gateway">
                          <Button
                            aria-label="Reconcile with the gateway"
                            className="size-8 rounded-full border border-primary bg-primary p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-white"
                            disabled={reconcile.isPending}
                            onClick={() => reconcile.mutate(payment.id)}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <RotateCw className="size-3.5" strokeWidth={2.5} />
                          </Button>
                        </SimpleTooltip>

                        {payment.status === "PAID" ||
                        payment.status === "PARTIALLY_REFUNDED" ? (
                          <SimpleTooltip label="Refund this payment">
                            <Button
                              aria-label="Refund this payment"
                              className="size-8 rounded-full border border-app-danger bg-app-danger p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:text-white"
                              onClick={() => setRefunding(payment)}
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <Undo2 className="size-3.5" strokeWidth={2.5} />
                            </Button>
                          </SimpleTooltip>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-app-border px-4 py-3">
            <p className="text-sm text-app-muted">
              {data.meta.total} payment(s) · page {data.meta.page} of{" "}
              {data.meta.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                disabled={data.meta.page <= 1}
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    page: Math.max(1, (current.page ?? 1) - 1)
                  }))
                }
                size="sm"
                type="button"
                variant="outline"
              >
                Previous
              </Button>
              <Button
                disabled={data.meta.page >= data.meta.totalPages}
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    page: (current.page ?? 1) + 1
                  }))
                }
                size="sm"
                type="button"
                variant="outline"
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}

      {refunding ? (
        <RefundDialog
          onClose={() => setRefunding(null)}
          payment={refunding}
        />
      ) : null}
    </div>
  );
}
