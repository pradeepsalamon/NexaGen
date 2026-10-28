"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import type { InteractiveTool } from "./registry";

/**
 * A floating, non-modal panel: the class, the board and the toolbar stay live
 * and clickable around it. Escape (from inside the panel) or the close button
 * dismisses it. `role="dialog"` also keeps the coach's board shortcuts quiet
 * while focus is in a tool (see matchCoachBoardShortcut).
 *
 * `side` is the coach's working panel; `center` is a student's phone view of
 * what the coach is presenting, centred over the class.
 */
export function InteractivePanel({
  autoFocus = true,
  children,
  closeLabel,
  headerAction,
  onClose,
  placement = "side",
  subtitle,
  tool,
}: {
  /** Move focus to the title on open. Off when the panel opens on its own (a coach's presentation). */
  autoFocus?: boolean;
  children: ReactNode;
  closeLabel?: string;
  /** Rendered between the title and the close button. */
  headerAction?: ReactNode;
  onClose: () => void;
  placement?: "side" | "center";
  /** Replaces the tool's blurb under the title. */
  subtitle?: ReactNode;
  tool: InteractiveTool;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const Icon = tool.icon;

  useEffect(() => {
    if (autoFocus) titleRef.current?.focus();
  }, [autoFocus, tool.id]);

  if (typeof document === "undefined") return null;

  const panel = (
    <div
      aria-labelledby="interactive-panel-title"
      aria-modal="false"
      className={cn(
        "flex flex-col overflow-hidden rounded-app border border-app-border bg-app-surface text-app-text shadow-soft",
        "animate-in fade-in slide-in-from-bottom-4 duration-200",
        placement === "side"
          ? "fixed inset-x-2 bottom-2 top-14 z-40 sm:inset-x-auto sm:bottom-24 sm:right-4 sm:top-16 sm:w-[26rem]"
          // Never taller than the space between the top bar and the toolbar it centres in.
          : "pointer-events-auto max-h-full w-full max-w-lg",
      )}
      onKeyDown={(e) => {
        // Only keys pressed in the panel itself — Escape in a modal opened from a
        // tool (it is portaled elsewhere in the DOM) closes that modal only.
        if (
          e.key === "Escape" &&
          panelRef.current?.contains(e.target as Node)
        ) {
          e.stopPropagation();
          onClose();
        }
      }}
      ref={panelRef}
      role="dialog"
    >
      <header className="flex items-center gap-3 border-b border-app-border px-4 py-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            tool.tone,
          )}
        >
          <Icon aria-hidden="true" className="size-5" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            className="truncate text-base font-extrabold leading-tight outline-none"
            id="interactive-panel-title"
            ref={titleRef}
            tabIndex={-1}
          >
            {tool.label}
          </h2>
          <p className="truncate text-xs text-app-muted">
            {subtitle ?? tool.blurb}
          </p>
        </div>
        {headerAction}
        <SimpleTooltip label={closeLabel ?? "Close"}>
          <button
            aria-label={closeLabel ?? `Close ${tool.label}`}
            className="flex size-9 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-soft hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" strokeWidth={2.5} />
          </button>
        </SimpleTooltip>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {children}
      </div>
    </div>
  );

  return createPortal(
    placement === "side" ? (
      panel
    ) : (
      // Centred over the class; the backdrop lets taps through to nothing but stays light.
      <div className="pointer-events-none fixed inset-x-0 bottom-20 top-14 z-40 flex items-center justify-center px-3">
        {panel}
      </div>
    ),
    document.body,
  );
}
