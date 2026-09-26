"use client";

import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useCoachRatingsQuery, useFeedbackFormsQuery, useFeedbackResponsesQuery } from "../../hooks/useFeedbackApi";
import { FeedbackResponseCard } from "../FeedbackResponseCard";

export type ResponseFilters = { coachId: string; formId: string; page: number };

const PAGE_SIZE = 10;

export function FeedbackResponsesPanel({
  filters,
  onFiltersChange
}: {
  filters: ResponseFilters;
  onFiltersChange: (filters: ResponseFilters) => void;
}) {
  const { data: formsData } = useFeedbackFormsQuery();
  const { data: coachData } = useCoachRatingsQuery();
  const { data, error, isFetching, isLoading, refetch } = useFeedbackResponsesQuery({
    coachId: filters.coachId || undefined,
    formId: filters.formId || undefined,
    page: filters.page,
    pageSize: PAGE_SIZE
  });

  const pagination = data?.pagination;
  const responses = data?.responses ?? [];

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          aria-label="Filter by coach"
          onChange={(e) => onFiltersChange({ ...filters, coachId: e.target.value, page: 1 })}
          options={(coachData?.coaches ?? []).map((c) => ({ label: c.coachName, value: c.coachId }))}
          placeholder="All coaches"
          value={filters.coachId}
        />
        <Select
          aria-label="Filter by form"
          onChange={(e) => onFiltersChange({ ...filters, formId: e.target.value, page: 1 })}
          options={(formsData?.forms ?? []).map((f) => ({ label: f.title, value: f.id }))}
          placeholder="All forms"
          value={filters.formId}
        />
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton className="h-32 rounded-app" key={i} />
          ))}
        </div>
      ) : error ? (
        <WidgetError onRetry={() => refetch()} />
      ) : responses.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            description="Submitted feedback will show up here."
            icon={MessageSquareText}
            title="No responses yet"
          />
        </Card>
      ) : (
        <div className={isFetching ? "grid gap-3 opacity-70 transition-opacity" : "grid gap-3"}>
          {responses.map((response) => (
            <FeedbackResponseCard key={response.id} response={response} />
          ))}
        </div>
      )}

      {pagination && pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-app-muted">
            Page {pagination.page} of {pagination.totalPages} &middot; {pagination.total} responses
          </span>
          <div className="flex gap-2">
            <Button
              disabled={pagination.page <= 1}
              onClick={() => onFiltersChange({ ...filters, page: filters.page - 1 })}
              type="button"
              variant="outline"
            >
              Previous
            </Button>
            <Button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => onFiltersChange({ ...filters, page: filters.page + 1 })}
              type="button"
              variant="outline"
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
