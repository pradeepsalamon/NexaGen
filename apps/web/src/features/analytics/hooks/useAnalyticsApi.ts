"use client";

import type { AnalyticsRangeQuery } from "@nexa-chess/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { queryKeys } from "@/lib/queryKeys";
import { analyticsApi } from "../api/analyticsApi";

const FIVE_MIN = 5 * 60 * 1000;

function useSection<T>(
  name: string,
  fetcher: (q: AnalyticsRangeQuery) => Promise<T>,
  query: AnalyticsRangeQuery,
  enabled = true
) {
  return useQuery({
    queryKey: queryKeys.analytics.section(name, query as Record<string, unknown>),
    queryFn: () => fetcher(query),
    staleTime: FIVE_MIN,
    enabled
  });
}

export const useOverviewQuery = (q: AnalyticsRangeQuery) =>
  useSection("overview", analyticsApi.overview, q);
export const useUserAnalyticsQuery = (q: AnalyticsRangeQuery) =>
  useSection("users", analyticsApi.users, q);
export const useAcquisitionQuery = (q: AnalyticsRangeQuery) =>
  useSection("acquisition", analyticsApi.acquisition, q);
export const useStudentAnalyticsQuery = (q: AnalyticsRangeQuery) =>
  useSection("students", analyticsApi.students, q);
export const useCoachAnalyticsQuery = (q: AnalyticsRangeQuery) =>
  useSection("coaches", analyticsApi.coaches, q);
export const useClassAnalyticsQuery = (q: AnalyticsRangeQuery) =>
  useSection("classes", analyticsApi.classes, q);
export const useAttendanceAnalyticsQuery = (q: AnalyticsRangeQuery) =>
  useSection("attendance", analyticsApi.attendance, q);
export const useBatchAnalyticsQuery = (q: AnalyticsRangeQuery) =>
  useSection("batches", analyticsApi.batches, q);
export const useRecordingAnalyticsQuery = (q: AnalyticsRangeQuery) =>
  useSection("recordings", analyticsApi.recordings, q);
export const useStorageAnalyticsQuery = (q: AnalyticsRangeQuery) =>
  useSection("storage", analyticsApi.storage, q);
export const useEngagementAnalyticsQuery = (q: AnalyticsRangeQuery) =>
  useSection("engagement", analyticsApi.engagement, q);
export const useOperationsQuery = (q: AnalyticsRangeQuery) =>
  useQuery({
    queryKey: queryKeys.analytics.section("operations", q as Record<string, unknown>),
    queryFn: () => analyticsApi.operations(q),
    staleTime: 30_000,
    refetchInterval: 60_000
  });
export const useTodayQuery = (q: AnalyticsRangeQuery) =>
  useQuery({
    queryKey: queryKeys.analytics.section("today", q as Record<string, unknown>),
    queryFn: () => analyticsApi.today(q),
    staleTime: 30_000,
    refetchInterval: 60_000
  });
export const useAlertsQuery = (q: AnalyticsRangeQuery) =>
  useSection("alerts", analyticsApi.alerts, q);

export const useCoachDetailQuery = (id: string, q: AnalyticsRangeQuery) =>
  useQuery({
    queryKey: queryKeys.analytics.section(`coach:${id}`, q as Record<string, unknown>),
    queryFn: () => analyticsApi.coachById(id, q),
    staleTime: FIVE_MIN,
    enabled: Boolean(id)
  });
export const useBatchDetailQuery = (id: string, q: AnalyticsRangeQuery) =>
  useQuery({
    queryKey: queryKeys.analytics.section(`batch:${id}`, q as Record<string, unknown>),
    queryFn: () => analyticsApi.batchById(id, q),
    staleTime: FIVE_MIN,
    enabled: Boolean(id)
  });

/** Manual "Refresh" — invalidate every analytics query so all sections refetch. */
export function useRefreshAnalytics() {
  const qc = useQueryClient();
  return useCallback(
    () => qc.invalidateQueries({ queryKey: queryKeys.analytics.all }),
    [qc]
  );
}
