import { API_ROUTES, type PersonalDataExport } from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export function getMyDataExport(): Promise<PersonalDataExport> {
  return apiFetch<PersonalDataExport>(API_ROUTES.privacy.dataExport);
}
