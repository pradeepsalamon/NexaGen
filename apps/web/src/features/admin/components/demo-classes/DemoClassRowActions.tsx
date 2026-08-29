"use client";

import { memo } from "react";
import { Ban, Copy, Info, Pencil, RotateCcw } from "lucide-react";
import type { DemoClass } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip";

export interface DemoClassRowActionsProps {
  demoClass: DemoClass;
  onEdit: (demoClass: DemoClass) => void;
  onCopyLink: (id: string) => void;
  onCancel: (id: string) => void;
  onRestore: (id: string) => void;
  onViewDetails: (id: string) => void;
  cancelPending: boolean;
  restorePending: boolean;
}

export const DemoClassRowActions = memo(function DemoClassRowActions({
  demoClass,
  onEdit,
  onCopyLink,
  onCancel,
  onRestore,
  onViewDetails,
  cancelPending,
  restorePending,
}: DemoClassRowActionsProps) {
  const canEditOrCancel =
    demoClass.status === "SCHEDULED" || demoClass.status === "LIVE";

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2 justify-center">
        {["SCHEDULED", "LIVE"].includes(demoClass.status) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={`Copy link for ${demoClass.topic}`}
                className="size-8 rounded-full border-primary p-0 text-app-text transition-colors hover:border-primary hover:bg-primary hover:text-white"
                onClick={() => onCopyLink(demoClass.id)}
                size="icon"
                type="button"
                variant="outline"
              >
                <Copy aria-hidden="true" className="size-4" strokeWidth={2.5} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy Invite Link</TooltipContent>
          </Tooltip>
        )}

        {demoClass.status === "CANCELLED" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Restore demo class"
                className="size-8 rounded-full border-secondary p-0 text-app-text transition-colors hover:border-secondary hover:bg-secondary hover:text-black"
                disabled={restorePending}
                onClick={() => onRestore(demoClass.id)}
                size="icon"
                type="button"
                variant="outline"
              >
                <RotateCcw aria-hidden="true" className="size-4" strokeWidth={2.5} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Restore Demo Class</TooltipContent>
          </Tooltip>
        )}

        {demoClass.status === "COMPLETED" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="View demo class details"
                className="size-8 rounded-full border-primary p-0 text-app-text transition-colors hover:border-primary hover:bg-primary hover:text-white"
                onClick={() => onViewDetails(demoClass.id)}
                size="icon"
                type="button"
                variant="outline"
              >
                <Info aria-hidden="true" className="size-4" strokeWidth={2.5} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>View Details</TooltipContent>
          </Tooltip>
        )}

        {canEditOrCancel && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={`Edit ${demoClass.topic}`}
                  className="size-8 rounded-full border-secondary p-0 text-app-text transition-colors hover:border-secondary hover:bg-secondary hover:text-black"
                  onClick={() => onEdit(demoClass)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <Pencil aria-hidden="true" className="size-4" strokeWidth={2.5} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit class</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={`Cancel ${demoClass.topic}`}
                  className="size-8 rounded-full border-app-danger p-0 text-app-text transition-colors hover:border-app-danger hover:bg-app-danger hover:text-white"
                  disabled={cancelPending}
                  onClick={() => onCancel(demoClass.id)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <Ban aria-hidden="true" className="size-4" strokeWidth={2.5} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Cancel class</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    </TooltipProvider>
  );
});
