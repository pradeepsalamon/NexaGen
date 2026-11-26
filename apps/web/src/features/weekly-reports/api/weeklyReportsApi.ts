import { API_ROUTES, type WeeklyReportListResponse, type WeeklyReportPreviewResponse } from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

// Weekly progress reports (docs/WEEKLY_REPORTS.md).

const withCursor = (path: string, cursor?: string) => (cursor ? `${path}?cursor=${encodeURIComponent(cursor)}` : path);

export const getMyWeeklyReports = (cursor?: string) =>
  apiFetch<WeeklyReportListResponse>(withCursor(API_ROUTES.weeklyReports.mine, cursor));

export const getStudentWeeklyReports = (studentId: string, cursor?: string) =>
  apiFetch<WeeklyReportListResponse>(withCursor(API_ROUTES.weeklyReports.forStudent(studentId), cursor));

export const getWeeklyReportPreview = (studentId: string) =>
  apiFetch<WeeklyReportPreviewResponse>(API_ROUTES.weeklyReports.preview(studentId));
