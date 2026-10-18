import { API_ROUTES } from "@nexa-chess/types";
import { apiFetch } from "../../../lib/api";

export async function getStudentDashboard(): Promise<any> {
  return apiFetch(API_ROUTES.student.dashboard);
}
