import { Input } from "@/components/ui/Input";
import { ListFilter } from "lucide-react";
import { type ReactNode } from "react";

interface DataTableToolbarProps {
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters?: ReactNode;
  actions?: ReactNode;
}

export function DataTableToolbar({
  searchPlaceholder = "Search...",
  searchValue,
  onSearchChange,
  filters,
  actions
}: DataTableToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {filters}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {actions}
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <ListFilter
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
      </div>
    </div>
  );
}
