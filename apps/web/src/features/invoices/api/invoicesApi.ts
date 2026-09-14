import { API_ROUTES } from "@nexa-chess/types";
import type {
  AdminInvoiceListResponse,
  AdminInvoiceQuery,
  BillingAddress,
  CreateCreditNoteRequest,
  CreditNoteItem,
  CreditNoteListResponse,
  InvoiceAuditResponse,
  InvoiceItem,
  InvoiceListResponse,
  InvoiceSettingsResponse,
  UpdateBillingProfileRequest,
  UpdateInvoiceSettingsRequest
} from "@nexa-chess/types";
import { getWebEnv } from "@nexa-chess/config/web";
import { apiFetch } from "@/lib/api";

const API_BASE_URL = getWebEnv({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL
}).NEXT_PUBLIC_API_URL;

// ── Student ──

export function getMyInvoices(): Promise<InvoiceListResponse> {
  return apiFetch<InvoiceListResponse>(API_ROUTES.invoices.mine);
}

export function getInvoice(id: string): Promise<InvoiceItem> {
  return apiFetch<InvoiceItem>(API_ROUTES.invoices.get(id));
}

export function getInvoiceAudit(id: string): Promise<InvoiceAuditResponse> {
  return apiFetch<InvoiceAuditResponse>(API_ROUTES.invoices.audit(id));
}

export function getMyCreditNotes(): Promise<CreditNoteListResponse> {
  return apiFetch<CreditNoteListResponse>(API_ROUTES.invoices.creditNotes);
}

export function getCreditNote(id: string): Promise<CreditNoteItem> {
  return apiFetch<CreditNoteItem>(API_ROUTES.invoices.creditNote(id));
}

export function getBillingProfile(): Promise<{
  billingProfile: BillingAddress;
  saved: boolean;
}> {
  return apiFetch(API_ROUTES.invoices.billingProfile);
}

export function updateBillingProfile(
  body: UpdateBillingProfileRequest
): Promise<{ billingProfile: BillingAddress }> {
  return apiFetch(API_ROUTES.invoices.billingProfile, { method: "PUT", body });
}

// ── Admin ──

export function getAdminInvoices(
  query: Partial<AdminInvoiceQuery>
): Promise<AdminInvoiceListResponse> {
  return apiFetch<AdminInvoiceListResponse>(
    `${API_ROUTES.adminInvoices.list}${toQueryString(query)}`
  );
}

export function getAdminInvoice(id: string): Promise<InvoiceItem> {
  return apiFetch<InvoiceItem>(API_ROUTES.adminInvoices.get(id));
}

export function getAdminInvoiceAudit(id: string): Promise<InvoiceAuditResponse> {
  return apiFetch<InvoiceAuditResponse>(API_ROUTES.adminInvoices.audit(id));
}

export function retryInvoicePdf(
  id: string,
  force = false
): Promise<InvoiceItem> {
  return apiFetch<InvoiceItem>(API_ROUTES.adminInvoices.retryPdf(id), {
    method: "POST",
    body: { force }
  });
}

export function resendInvoiceEmail(id: string): Promise<{ sent: boolean }> {
  return apiFetch(API_ROUTES.adminInvoices.resendEmail(id), { method: "POST" });
}

export function getAdminCreditNotes(): Promise<CreditNoteListResponse> {
  return apiFetch<CreditNoteListResponse>(API_ROUTES.adminInvoices.creditNotes);
}

export function createCreditNote(
  body: CreateCreditNoteRequest
): Promise<CreditNoteItem> {
  return apiFetch<CreditNoteItem>(API_ROUTES.adminInvoices.createCreditNote, {
    method: "POST",
    body
  });
}

export function getInvoiceSettings(): Promise<InvoiceSettingsResponse> {
  return apiFetch<InvoiceSettingsResponse>(API_ROUTES.adminInvoices.settings);
}

export function updateInvoiceSettings(
  body: UpdateInvoiceSettingsRequest
): Promise<InvoiceSettingsResponse> {
  return apiFetch<InvoiceSettingsResponse>(API_ROUTES.adminInvoices.settings, {
    method: "PUT",
    body
  });
}

// ── Document URLs ──
//
// These are plain hrefs rather than fetches so the browser handles the PDF with
// its own viewer and download UI. They still hit the authenticated API route —
// there is no signed storage URL in the markup — so the cookie is what grants
// access, and changing the id reaches nothing you are not allowed to see.

export function invoicePdfUrl(id: string): string {
  return `${API_BASE_URL}${API_ROUTES.invoices.pdf(id)}`;
}

export function invoiceHtmlUrl(id: string): string {
  return `${API_BASE_URL}${API_ROUTES.invoices.html(id)}`;
}

export function creditNotePdfUrl(id: string): string {
  return `${API_BASE_URL}${API_ROUTES.invoices.creditNotePdf(id)}`;
}

export function adminInvoicePdfUrl(id: string): string {
  return `${API_BASE_URL}${API_ROUTES.adminInvoices.pdf(id)}`;
}

export function adminCreditNotePdfUrl(id: string): string {
  return `${API_BASE_URL}${API_ROUTES.adminInvoices.creditNotePdf(id)}`;
}

export function adminInvoiceExportUrl(query: Partial<AdminInvoiceQuery>): string {
  return `${API_BASE_URL}${API_ROUTES.adminInvoices.export}${toQueryString(query)}`;
}

function toQueryString(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}
