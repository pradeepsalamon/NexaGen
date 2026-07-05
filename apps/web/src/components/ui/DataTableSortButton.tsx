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
      className="h-8 data-[state=open]:bg-accent"
    >
      <span>{label}</span>
      <ChevronsUpDown className="h-3 w-3" />
    </Button>
  );
}
