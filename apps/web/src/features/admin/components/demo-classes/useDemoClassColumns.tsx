"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import { DEMO_CLASS_ACCESS_MODE_LABELS, type DemoClass } from "@nexa-chess/types";
import { Repeat } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Checkbox } from "@/components/ui/Checkbox";
import { DataTableSortButton } from "@/components/ui/DataTableSortButton";
import {
  DemoClassRowActions,
  type DemoClassRowActionsProps,
} from "./DemoClassRowActions";

type RowActionHandlers = Omit<DemoClassRowActionsProps, "demoClass">;

export function useDemoClassColumns(handlers: RowActionHandlers) {
  const {
    onEdit,
    onCopyLink,
    onCancel,
    onRestore,
    onViewDetails,
    cancelPending,
    restorePending,
  } = handlers;

  return useMemo<ColumnDef<DemoClass>[]>(
    () => [
      {
        id: "select",
        enableHiding: false,
        enableSorting: false,
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all rows"
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(checked) =>
              table.toggleAllPageRowsSelected(!!checked)
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Select ${row.original.topic}`}
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(!!checked)}
          />
        ),
      },
      {
        accessorKey: "topic",
        enableColumnFilter: true,
        header: ({ column }) => (
          <DataTableSortButton
            label="Topic"
            column={column}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-52">
            <p className="font-extrabold text-app-text">{row.original.topic}</p>
            {row.original.schedule && (
              <Badge variant="info" className="mt-1 gap-1 text-[10px]">
                <Repeat aria-hidden="true" className="size-3" /> /demo/{row.original.schedule.slug}
              </Badge>
            )}
            {row.original.description && (
              <p className="mt-1 line-clamp-2 text-xs text-app-muted">
                {row.original.description}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "coachName",
        enableColumnFilter: true,
        header: ({ column }) => (
          <DataTableSortButton
            label="Assigned Coach"
            column={column}
          />
        ),
        cell: ({ row }) => <div>{row.getValue("coachName")}</div>,
      },
      {
        accessorKey: "startsAt",
        enableColumnFilter: true,
        header: ({ column }) => (
          <DataTableSortButton
            label="Schedule"
            column={column}
          />
        ),
        cell: ({ row }) => {
          const date = new Date(row.getValue("startsAt"));
          return (
            <div className="text-sm">
              <div>{format(date, "MMM d, yyyy")}</div>
              <div className="text-app-muted">{format(date, "h:mm a")}</div>
            </div>
          );
        },
      },
      {
        id: "access",
        enableSorting: false,
        header: "Access",
        cell: ({ row }) => (
          <span className="text-sm">{DEMO_CLASS_ACCESS_MODE_LABELS[row.original.accessMode]}</span>
        ),
      },
      {
        id: "guests",
        enableSorting: false,
        header: "Guests",
        cell: ({ row }) => <span className="text-sm font-semibold">{row.original.registrationCount}</span>,
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
          const status = row.getValue("status") as string;
          return (
            <Badge
              variant={
                status === "LIVE"
                  ? "success"
                  : status === "COMPLETED"
                  ? "secondary"
                  : status === "CANCELLED"
                  ? "destructive"
                  : "default"
              }
            >
              {status}
            </Badge>
          );
        },
      },
      {
        id: "actions",
        enableHiding: false,
        enableSorting: false,
        header: "Actions",
        cell: ({ row }) => (
          <DemoClassRowActions
            demoClass={row.original}
            onEdit={onEdit}
            onCopyLink={onCopyLink}
            onCancel={onCancel}
            onRestore={onRestore}
            onViewDetails={onViewDetails}
            cancelPending={cancelPending}
            restorePending={restorePending}
          />
        ),
      },
    ],
    [
      onEdit,
      onCopyLink,
      onCancel,
      onRestore,
      onViewDetails,
      cancelPending,
      restorePending,
    ]
  );
}
