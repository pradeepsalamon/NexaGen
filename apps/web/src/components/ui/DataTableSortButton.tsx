import { ChevronsUpDown } from "lucide-react";
import { Button } from "./Button";

interface DataTableSortButtonProps {
  label: string;
  onClick: () => void;
}

export function DataTableSortButton({ label, onClick }: DataTableSortButtonProps) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className="-mx-2 h-8 min-h-8 px-2 text-current hover:bg-white/15 hover:text-current"
    >
      <span>{label}</span>
      <ChevronsUpDown className="h-3 w-3" />
    </Button>
  );
}
