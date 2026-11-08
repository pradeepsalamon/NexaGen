import { Input } from "@/components/ui/Input";
import { Search } from "lucide-react";
import { type ReactNode } from "react";

interface DataTableToolbarProps {
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters?: ReactNode;
  actions?: ReactNode;
}

/**
 * Search, filters and actions above a table.
 *
 * - From `sm`: one right-aligned row (filters, search, actions), each control
 *   at the width its caller gave it.
 * - Below `sm`: a two-column grid. Search spans the full width on top; the
 *   filters share the row under it and stretch to fill it, with the actions
 *   (e.g. the View menu) at its end. A filter's own width (`w-40`) only counts
 *   from `sm` (below it `flex-1` sets the size), so a phone never gets ragged,
 *   half-width controls.
 */
export function DataTableToolbar({
  searchPlaceholder = "Search...",
  searchValue,
  onSearchChange,
  filters,
  actions
}: DataTableToolbarProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:flex-wrap sm:justify-end sm:gap-3">
      {filters ? (
        <div
          className={
            "flex min-w-0 gap-2 [&>*]:min-w-0 [&>*]:flex-1 sm:contents sm:[&>*]:flex-initial" +
            (actions ? "" : " col-span-2")
          }
        >
          {filters}
        </div>
      ) : null}
      <div className="relative order-first col-span-2 sm:order-none sm:min-w-[220px] sm:max-w-sm">
        <Search
          aria-hidden="true"
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-muted"
          strokeWidth={2.5}
        />
        <Input
          className="pl-9"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          value={searchValue}
        />
      </div>
      {actions ? (
        <div className={"flex justify-end gap-2 sm:contents" + (filters ? "" : " col-span-2")}>{actions}</div>
      ) : null}
    </div>
  );
}
