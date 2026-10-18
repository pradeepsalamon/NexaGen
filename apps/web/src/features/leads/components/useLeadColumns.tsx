"use client";

import { useMemo } from "react";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate, formatTime } from "@/lib/datetime";
import type { ColumnDef } from "@tanstack/react-table";
import { LEAD_STATUS_LABELS, type LeadListItem } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { DataTableSortButton } from "@/components/ui/DataTableSortButton";
import { leadStatusBadgeVariant } from "../lib/leadStatus";
import { LeadRowActions, type LeadRowActionsProps } from "./LeadRowActions";

type RowActionHandlers = Omit<LeadRowActionsProps, "lead">;

export function useLeadColumns(handlers: RowActionHandlers) {
  const { onViewDetails, onDelete, deletePending } = handlers;
  const timeZone = useUserTimeZone();

  return useMemo<ColumnDef<LeadListItem>[]>(
    () => [
      {
        accessorKey: "studentName",
        enableColumnFilter: true,
        header: ({ column }) => (
          <DataTableSortButton
            label="Student"
            column={column}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-40">
            <p className="font-extrabold text-app-text">{row.original.studentName}</p>
            <p className="mt-1 text-xs text-app-muted">
              Age {row.original.studentAge} · {row.original.experienceLevel}
            </p>
          </div>
        )
      },
      {
        accessorKey: "parentName",
        header: "Parent",
        cell: ({ row }) => (
          <div>
            <p className="text-app-text">{row.original.parentName}</p>
            <p className="text-xs text-app-muted">{row.original.phone}</p>
          </div>
        )
      },
      {
        accessorKey: "source",
        header: "Source",
        cell: ({ row }) => (
          <div className="text-sm">
            <div>{row.original.source ?? "Unknown"}</div>
            {row.original.campaign ? (
              <div className="text-xs text-app-muted">{row.original.campaign}</div>
            ) : null}
          </div>
        )
      },
      {
        accessorKey: "status",
        enableColumnFilter: true,
        header: ({ column }) => (
          <DataTableSortButton
            label="Status"
            column={column}
          />
        ),
        cell: ({ row }) => {
          const status = row.original.status;
          return (
            <Badge variant={leadStatusBadgeVariant(status)}>
              {LEAD_STATUS_LABELS[status]}
            </Badge>
          );
        }
      },
      {
        accessorKey: "createdAt",
        enableColumnFilter: true,
        header: ({ column }) => (
          <DataTableSortButton
            label="Received"
            column={column}
          />
        ),
        cell: ({ row }) => (
          <div className="text-sm">
            <div>{formatFullDate(row.original.createdAt, timeZone)}</div>
            <div className="text-app-muted">{formatTime(row.original.createdAt, timeZone)}</div>
          </div>
        )
      },
      {
        id: "actions",
        enableHiding: false,
        enableSorting: false,
        header: "Actions",
        cell: ({ row }) => (
          <LeadRowActions
            lead={row.original}
            onViewDetails={onViewDetails}
            onDelete={onDelete}
            deletePending={deletePending}
          />
        )
      }
    ],
    [onViewDetails, onDelete, deletePending, timeZone]
  );
}
