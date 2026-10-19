"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminInvoiceQuery,
  CreateCreditNoteRequest,
  UpdateBillingProfileRequest,
  UpdateInvoiceSettingsRequest
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import {
  createCreditNote,
  getAdminCreditNotes,
  getAdminInvoice,
  getAdminInvoiceAudit,
  getAdminInvoices,
  getBillingProfile,
  getCreditNote,
  getInvoice,
  getInvoiceAudit,
  getInvoiceSettings,
  getMyCreditNotes,
  getMyInvoices,
  resendInvoiceEmail,
  retryInvoicePdf,
  updateBillingProfile,
  updateInvoiceSettings
} from "../api/invoicesApi";

// ── Student ──

export function useMyInvoices() {
  return useQuery({
    queryKey: queryKeys.invoices.mine,
    queryFn: getMyInvoices
  });
}

export function useInvoice(id: string | null) {
  return useQuery({
    queryKey: queryKeys.invoices.detail(id ?? ""),
    queryFn: () => getInvoice(id as string),
    enabled: Boolean(id)
  });
}

export function useInvoiceAudit(id: string | null) {
  return useQuery({
    queryKey: queryKeys.invoices.audit(id ?? ""),
    queryFn: () => getInvoiceAudit(id as string),
    enabled: Boolean(id)
  });
}

export function useMyCreditNotes() {
  return useQuery({
    queryKey: queryKeys.invoices.creditNotes,
    queryFn: getMyCreditNotes
  });
}

export function useCreditNote(id: string | null) {
  return useQuery({
    queryKey: queryKeys.invoices.creditNote(id ?? ""),
    queryFn: () => getCreditNote(id as string),
    enabled: Boolean(id)
  });
}

export function useBillingProfile() {
  return useQuery({
    queryKey: queryKeys.invoices.billingProfile,
    queryFn: getBillingProfile
  });
}

export function useUpdateBillingProfile() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (body: UpdateBillingProfileRequest) => updateBillingProfile(body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.billingProfile
      });
      // Invoices freeze their billing details at issue time, so the change
      // deliberately does not reach receipts already sent.
      toast.success({
        title: "Billing details saved",
        message: "They will appear on your next invoice."
      });
    }
  });
}

// ── Admin ──

export function useAdminInvoices(query: Partial<AdminInvoiceQuery>) {
  return useQuery({
    queryKey: queryKeys.invoices.adminList(query),
    queryFn: () => getAdminInvoices(query),
    // Keep the table and stats on screen while the next page or filter loads.
    placeholderData: keepPreviousData
  });
}

export function useAdminInvoice(id: string | null) {
  return useQuery({
    queryKey: queryKeys.invoices.adminDetail(id ?? ""),
    queryFn: () => getAdminInvoice(id as string),
    enabled: Boolean(id)
  });
}

export function useAdminInvoiceAudit(id: string | null) {
  return useQuery({
    queryKey: queryKeys.invoices.adminAudit(id ?? ""),
    queryFn: () => getAdminInvoiceAudit(id as string),
    enabled: Boolean(id)
  });
}

export function useAdminCreditNotes() {
  return useQuery({
    queryKey: queryKeys.invoices.adminCreditNotes,
    queryFn: getAdminCreditNotes
  });
}

export function useRetryInvoicePdf() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) =>
      retryInvoicePdf(id, force),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      if (invoice.pdfStatus === "READY") {
        toast.success({ title: "Invoice PDF regenerated" });
      } else {
        toast.warning({
          title: "Generation is still failing",
          message: "The invoice is unaffected and will be retried automatically."
        });
      }
    }
  });
}

export function useResendInvoiceEmail() {
  const toast = useToast();

  return useMutation({
    mutationFn: (id: string) => resendInvoiceEmail(id),
    onSuccess: (result) => {
      if (result.sent) {
        toast.success({ title: "Invoice email sent" });
      } else {
        toast.warning({
          title: "Nothing was sent",
          message: "This invoice has no billing email address."
        });
      }
    }
  });
}

export function useCreateCreditNote() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (body: CreateCreditNoteRequest) => createCreditNote(body),
    onSuccess: (creditNote) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      toast.success({
        title: `Credit note ${creditNote.number} issued`,
        message: "The original invoice is unchanged."
      });
    }
  });
}

export function useInvoiceSettings() {
  return useQuery({
    queryKey: queryKeys.invoices.settings,
    queryFn: getInvoiceSettings
  });
}

export function useUpdateInvoiceSettings() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (body: UpdateInvoiceSettingsRequest) => updateInvoiceSettings(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.settings });
      toast.success({
        title: "Billing details saved",
        message: "Invoices issued from now on will carry them."
      });
    }
  });
}
