"use client";

import { useState } from "react";
import { TENANT_CLOSURE_STATUS_LABELS, tenantClosureStatusSchema } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useClosures } from "../hooks/usePlatformApi";
import { ClosuresTable } from "./ClosuresTable";

/** Every academy's closure requests, newest first (docs/ACADEMY_CLOSURE.md). */
export function ClosuresTab() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const closures = useClosures({ page, status });
  const pagination = closures.data?.pagination;

  return (
    <SectionCard
      actions={
        <Select
          aria-label="Filter by status"
          className="w-56"
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          options={[
            { label: "All requests", value: "" },
            ...tenantClosureStatusSchema.options.map((value) => ({ label: TENANT_CLOSURE_STATUS_LABELS[value], value }))
          ]}
          value={status}
        />
      }
      description="An academy's super admin asks from Subscription → Close the academy; you approve or decline here. A deletion waits a week, during which you can cancel it."
      title="Academy closures"
    >
      <div className="grid gap-3 p-4">
        {closures.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : closures.isError ? (
          <WidgetError message="Couldn't load closure requests." onRetry={() => void closures.refetch()} />
        ) : (
          <ClosuresTable closures={closures.data?.closures ?? []} />
        )}
        {pagination && pagination.totalPages > 1 ? (
          <div className="flex items-center justify-end gap-2 text-sm text-app-muted">
            <span>
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button disabled={page <= 1} onClick={() => setPage(page - 1)} variant="neutral">
              Previous
            </Button>
            <Button disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)} variant="neutral">
              Next
            </Button>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
