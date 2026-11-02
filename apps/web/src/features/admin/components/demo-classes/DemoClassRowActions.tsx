"use client";

import { memo } from "react";
import { Ban, Copy, Pencil, RotateCcw, Users } from "lucide-react";
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
  onCopyLink: (demoClass: DemoClass) => void;
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
                className="size-8"
                onClick={() => onCopyLink(demoClass)}
                size="icon"
                type="button"
                variant="neutral"
              >
                <Copy aria-hidden="true" className="size-4" strokeWidth={2.5} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {demoClass.accessMode === "PASSCODE" ? "Copy link + passcode" : "Copy class link"}
            </TooltipContent>
          </Tooltip>
        )}

        {demoClass.status === "CANCELLED" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Restore demo class"
                className="size-8 text-warning-ink hover:bg-warning-soft"
                disabled={restorePending}
                onClick={() => onRestore(demoClass.id)}
                size="icon"
                type="button"
                variant="neutral"
              >
                <RotateCcw aria-hidden="true" className="size-4" strokeWidth={2.5} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Restore Demo Class</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={`Details and guests for ${demoClass.topic}`}
              className="size-8"
              onClick={() => onViewDetails(demoClass.id)}
              size="icon"
              type="button"
              variant="neutral"
            >
              <Users aria-hidden="true" className="size-4" strokeWidth={2.5} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Details &amp; guests</TooltipContent>
        </Tooltip>

        {canEditOrCancel && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={`Edit ${demoClass.topic}`}
                  className="size-8 text-warning-ink hover:bg-warning-soft"
                  onClick={() => onEdit(demoClass)}
                  size="icon"
                  type="button"
                  variant="neutral"
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
                  className="size-8 text-app-danger-ink hover:bg-app-danger-soft"
                  disabled={cancelPending}
                  onClick={() => onCancel(demoClass.id)}
                  size="icon"
                  type="button"
                  variant="neutral"
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
