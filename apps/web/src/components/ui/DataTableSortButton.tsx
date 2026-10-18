import type { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

export type SortDirection = "asc" | "desc";

interface SortButtonProps {
  label: string;
  direction: SortDirection | false;
  onClick: () => void;
  className?: string;
}

/** Column-header sort toggle: ↑ ascending, ↓ descending, faint ↕ when unsorted. */
export function SortButton({ label, direction, onClick, className }: SortButtonProps) {
  const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;
  const state =
    direction === "asc" ? "sorted ascending" : direction === "desc" ? "sorted descending" : "not sorted";
  return (
    <Button
      aria-label={`${label}, ${state}. Click to sort ${direction === "asc" ? "descending" : "ascending"}.`}
      variant="ghost"
      onClick={onClick}
      className={cn(
        "-mx-2 h-8 min-h-8 gap-1 px-2 text-current hover:bg-white/15 hover:text-current",
        className
      )}
    >
      <span>{label}</span>
      <Icon className={cn("h-3.5 w-3.5 shrink-0", !direction && "opacity-50")} strokeWidth={2.5} />
    </Button>
  );
}

interface DataTableSortButtonProps<TData, TValue> {
  column: Column<TData, TValue>;
  label: string;
}

/** TanStack wrapper: first click sorts ascending, then flips between asc and desc. */
export function DataTableSortButton<TData, TValue>({
  column,
  label
}: DataTableSortButtonProps<TData, TValue>) {
  const direction = column.getIsSorted();
  return (
    <SortButton
      direction={direction}
      label={label}
      onClick={() => column.toggleSorting(direction === "asc")}
    />
  );
}
