"use client";

import { memo } from "react";
import { Info, Trash2 } from "lucide-react";
import type { LeadListItem } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { SimpleTooltip } from "@/components/ui/Tooltip";

export interface LeadRowActionsProps {
  lead: LeadListItem;
  onViewDetails: (id: string) => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
}

export const LeadRowActions = memo(function LeadRowActions({
  lead,
  onViewDetails,
  onDelete,
  deletePending
}: LeadRowActionsProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      <SimpleTooltip label="View details">
        <Button
          aria-label={`View details for ${lead.studentName}`}
          className="size-8 rounded-full border-primary p-0 text-app-text transition-colors hover:border-primary hover:bg-primary hover:text-white"
          onClick={() => onViewDetails(lead.id)}
          size="icon"
          type="button"
          variant="outline"
        >
          <Info aria-hidden="true" className="size-4" strokeWidth={2.5} />
        </Button>
      </SimpleTooltip>

      <SimpleTooltip label="Delete lead">
        <Button
          aria-label={`Delete lead for ${lead.studentName}`}
          className="size-8 rounded-full border-app-danger p-0 text-app-text transition-colors hover:border-app-danger hover:bg-app-danger hover:text-white"
          disabled={deletePending}
          onClick={() => onDelete(lead.id)}
          size="icon"
          type="button"
          variant="outline"
        >
          <Trash2 aria-hidden="true" className="size-4" strokeWidth={2.5} />
        </Button>
      </SimpleTooltip>
    </div>
  );
});
