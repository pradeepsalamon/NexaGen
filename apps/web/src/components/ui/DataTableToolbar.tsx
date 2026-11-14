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

export function DataTableToolbar({
  searchPlaceholder = "Search...",
  searchValue,
  onSearchChange,
  filters,
  actions
}: DataTableToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {filters}
      <div className="relative min-w-[220px] sm:max-w-sm">
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
      {actions}
    </div>
  );
}
