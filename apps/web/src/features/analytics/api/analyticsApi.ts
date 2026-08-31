import type {
  AcquisitionAnalyticsResponse,
  AlertsResponse,
  AnalyticsBatchesTableResponse,
  AnalyticsClassesTableResponse,
  AnalyticsCoachesTableResponse,
  AnalyticsOverviewResponse,
  AnalyticsRangeQuery,
  AnalyticsRecordingsTableResponse,
  AnalyticsUsersTableResponse,
  AttendanceAnalyticsResponse,
  BatchAnalyticsResponse,
  BatchDetailAnalyticsResponse,
  ClassAnalyticsResponse,
  CoachAnalyticsResponse,
  CoachDetailAnalyticsResponse,
  EngagementAnalyticsResponse,
  OperationsResponse,
  PaginatedQuery,
  RecordingAnalyticsResponse,
  StorageAnalyticsResponse,
  StudentAnalyticsResponse,
  TodayResponse,
  UserAnalyticsResponse
} from "@nexa-chess/types";
import { API_ROUTES } from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";
import { getWebEnv } from "@nexa-chess/config/web";

/** Serialises the analytics range/filter query into a `?a=b` string. */
export function analyticsQueryString(
  query: (AnalyticsRangeQuery & PaginatedQuery) | undefined
): string {
  if (!query) return "";
  const sp = new URLSearchParams();
  const set = (k: string, v: unknown) => {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  };
  set("preset", query.preset);
  set("from", query.from);
  set("to", query.to);
  set("compare", query.compare);
  set("granularity", query.granularity);
  set("role", query.role);
  set("batchId", query.batchId);
  set("coachId", query.coachId);
  set("classType", query.classType);
  set("acquisitionSource", query.acquisitionSource);
  set("status", query.status);
  set("threshold", query.threshold);
  if (query.fresh) sp.set("fresh", "1");
  set("page", query.page);
  set("pageSize", query.pageSize);
  set("search", query.search);
  set("sort", query.sort);
  set("order", query.order);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

type Q = AnalyticsRangeQuery;
type TableQ = AnalyticsRangeQuery & PaginatedQuery;

const get = <T>(path: string, query?: Q | TableQ) =>
  apiFetch<T>(path + analyticsQueryString(query));

export const analyticsApi = {
  overview: (q?: Q) => get<AnalyticsOverviewResponse>(API_ROUTES.analytics.overview, q),
  users: (q?: Q) => get<UserAnalyticsResponse>(API_ROUTES.analytics.users, q),
  acquisition: (q?: Q) =>
    get<AcquisitionAnalyticsResponse>(API_ROUTES.analytics.acquisition, q),
  students: (q?: Q) => get<StudentAnalyticsResponse>(API_ROUTES.analytics.students, q),
  coaches: (q?: Q) => get<CoachAnalyticsResponse>(API_ROUTES.analytics.coaches, q),
  coachById: (id: string, q?: Q) =>
    get<CoachDetailAnalyticsResponse>(API_ROUTES.analytics.coachById(id), q),
  classes: (q?: Q) => get<ClassAnalyticsResponse>(API_ROUTES.analytics.classes, q),
  attendance: (q?: Q) =>
    get<AttendanceAnalyticsResponse>(API_ROUTES.analytics.attendance, q),
  batches: (q?: Q) => get<BatchAnalyticsResponse>(API_ROUTES.analytics.batches, q),
  batchById: (id: string, q?: Q) =>
    get<BatchDetailAnalyticsResponse>(API_ROUTES.analytics.batchById(id), q),
  recordings: (q?: Q) =>
    get<RecordingAnalyticsResponse>(API_ROUTES.analytics.recordings, q),
  storage: (q?: Q) => get<StorageAnalyticsResponse>(API_ROUTES.analytics.storage, q),
  engagement: (q?: Q) =>
    get<EngagementAnalyticsResponse>(API_ROUTES.analytics.engagement, q),
  operations: (q?: Q) => get<OperationsResponse>(API_ROUTES.analytics.operations, q),
  today: (q?: Q) => get<TodayResponse>(API_ROUTES.analytics.today, q),
  alerts: (q?: Q) => get<AlertsResponse>(API_ROUTES.analytics.alerts, q),
  usersTable: (q?: TableQ) =>
    get<AnalyticsUsersTableResponse>(API_ROUTES.analytics.usersTable, q),
  coachesTable: (q?: TableQ) =>
    get<AnalyticsCoachesTableResponse>(API_ROUTES.analytics.coachesTable, q),
  batchesTable: (q?: TableQ) =>
    get<AnalyticsBatchesTableResponse>(API_ROUTES.analytics.batchesTable, q),
  classesTable: (q?: TableQ) =>
    get<AnalyticsClassesTableResponse>(API_ROUTES.analytics.classesTable, q),
  recordingsTable: (q?: TableQ) =>
    get<AnalyticsRecordingsTableResponse>(API_ROUTES.analytics.recordingsTable, q)
};

/** Absolute URL for a CSV export, for an anchor-click download. */
export function analyticsExportUrl(report: string, query?: Q): string {
  const base = getWebEnv({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL
  }).NEXT_PUBLIC_API_URL;
  return base + API_ROUTES.analytics.export(report) + analyticsQueryString(query);
}
