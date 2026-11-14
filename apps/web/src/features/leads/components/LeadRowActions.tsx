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
          className="size-8 rounded-full border border-primary bg-primary p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-white"
          onClick={() => onViewDetails(lead.id)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Info aria-hidden="true" className="size-4" strokeWidth={2.5} />
        </Button>
      </SimpleTooltip>

      <SimpleTooltip label="Delete lead">
        <Button
          aria-label={`Delete lead for ${lead.studentName}`}
          className="size-8 rounded-full border border-app-danger bg-app-danger p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:text-white"
          disabled={deletePending}
          onClick={() => onDelete(lead.id)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Trash2 aria-hidden="true" className="size-4" strokeWidth={2.5} />
        </Button>
      </SimpleTooltip>
    </div>
  );
});
