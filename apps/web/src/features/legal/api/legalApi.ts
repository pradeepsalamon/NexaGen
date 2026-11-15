import {
  API_ROUTES,
  type AdminLegalPagesResponse,
  type LegalPageKind,
  type PublicLegalPage,
  type UpdateLegalPageRequest
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

/** Public, by host: the academy's own wording (`body` null = the built-in text). */
export const getPublicLegalPage = (kind: LegalPageKind) =>
  apiFetch<PublicLegalPage>(API_ROUTES.branding.legalPage(kind), { silent: true });

export const getAdminLegalPages = () => apiFetch<AdminLegalPagesResponse>(API_ROUTES.branding.adminLegalPages);

export const updateAdminLegalPage = (kind: LegalPageKind, body: UpdateLegalPageRequest) =>
  apiFetch<AdminLegalPagesResponse>(API_ROUTES.branding.adminLegalPage(kind), { body, method: "PUT" });
