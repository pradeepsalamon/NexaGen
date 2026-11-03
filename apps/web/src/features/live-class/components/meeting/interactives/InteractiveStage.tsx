"use client";

import { useEffect, useMemo, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Crown, LayoutGrid, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { InlineStage } from "../classroom/InlineStage";
import {
  useInteractives,
  useInteractivesTimer,
  useOptionalInteractives,
} from "./InteractivesProvider";
import { usePresentedTool } from "./PresentedInteractive";
import { findInteractiveTool, type InteractiveTool } from "./registry";
import { PresentedViewProvider } from "./shared";

/**
 * The tool that belongs on this user's stage, in the board's place: the
 * coach's open tool, or for a student the tool the coach is presenting.
 */
export function useStageTool(): InteractiveTool | null {
  const ctx = useOptionalInteractives();
  const presented = usePresentedTool();
  if (!ctx) return null;
  return ctx.isManager ? findInteractiveTool(ctx.openToolId) : presented;
}

/** Whether the tool stage replaces the board right now (phones swap their grid out for it). */
export function useInteractiveStageShown(): boolean {
  const ctx = useOptionalInteractives();
  const tool = useStageTool();
  return !!tool && !!ctx?.stageOpen;
}

/** The coach's working copy: full controls, its view sent to the class while "Show to class" is on. */
function ManagerToolBody({ tool }: { tool: InteractiveTool }) {
  const { classId, isManager, publishView, sharing } = useInteractives();
  const timer = useInteractivesTimer();
  const presentedView = useMemo(
    () =>
      sharing
        ? {
            mode: "present" as const,
            publish: (view: unknown) => publishView(tool.id, view),
            toolId: tool.id,
            view: null,
          }
        : null,
    [publishView, sharing, tool.id],
  );
  return (
    <PresentedViewProvider value={presentedView}>
      <tool.Component classId={classId} isManager={isManager} timer={timer} />
    </PresentedViewProvider>
  );
}

/** A student's copy, read-only: shared tools show the class's state, personal ones the coach's view. */
function WatchToolBody({ tool }: { tool: InteractiveTool }) {
  const { classId, presenting } = useInteractives();
  const timer = useInteractivesTimer();
  const view = presenting?.view ?? null;
  const watch = useMemo(
    () => ({ mode: "watch" as const, publish: () => {}, toolId: tool.id, view }),
    [tool.id, view],
  );
  return (
    <PresentedViewProvider value={watch}>
      <tool.Component classId={classId} isManager={false} timer={timer} />
    </PresentedViewProvider>
  );
}

function StageTitle({ tool }: { tool: InteractiveTool }) {
  const { isManager, sharing } = useInteractives();
  const headingRef = useRef<HTMLSpanElement>(null);
  const Icon = tool.icon;

  // The coach chose this tool: move focus to it (a student's opens on its own, so theirs stays put).
  useEffect(() => {
    if (isManager) headingRef.current?.focus();
  }, [isManager, tool.id]);

  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-control", tool.tone)}>
        <Icon aria-hidden="true" className="size-4" strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className="block truncate outline-none" ref={headingRef} tabIndex={-1}>
          {isManager ? tool.label : `Your coach is showing: ${tool.label}`}
        </span>
        {isManager ? <span className="block truncate text-xs font-normal text-app-muted">{tool.blurb}</span> : null}
      </span>
      {isManager ? (
        // Presented or private, in words (spec component 25).
        <Badge variant={sharing ? "info" : "secondary"} className="shrink-0">
          {sharing ? "Students see this" : "Only you"}
        </Badge>
      ) : null}
    </span>
  );
}

const ROUND_ICON_BUTTON =
  "flex size-8 shrink-0 items-center justify-center rounded-control border border-app-line-strong/60 bg-app-surface text-app-text transition-colors hover:bg-app-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus";

/** Back to the board: hides the tool (it stays open, and presented, behind its tab). Escape does the same. */
function BackToBoard() {
  const { setStageOpen } = useInteractives();
  return (
    <Button size="sm" variant="neutral" onClick={() => setStageOpen(false)}>
      <Crown aria-hidden="true" className="size-4" strokeWidth={2} />
      Back to board
    </Button>
  );
}

/** Interactive frame header (spec component 25), coach side: "Show to class", Back to board and Close. */
function ManagerActions({ tool }: { tool: InteractiveTool }) {
  const { closeTool, setSharing, sharing } = useInteractives();
  return (
    <>
      <Switch checked={sharing} className="shrink-0" label="Show to class" onCheckedChange={setSharing} />
      <BackToBoard />
      <SimpleTooltip label={`Close ${tool.label}`}>
        <button aria-label={`Close ${tool.label}`} className={ROUND_ICON_BUTTON} onClick={closeTool} type="button">
          <X aria-hidden="true" className="size-4" strokeWidth={2.5} />
        </button>
      </SimpleTooltip>
    </>
  );
}

function ToolCard({ tool }: { tool: InteractiveTool }) {
  const { isManager } = useInteractives();
  return (
    <div
      className={cn(
        "rounded-app border border-app-border bg-app-surface p-4 sm:p-6",
        tool.wide && "mx-auto max-w-4xl",
      )}
    >
      {isManager ? <ManagerToolBody tool={tool} /> : <WatchToolBody tool={tool} />}
    </div>
  );
}

/**
 * Escape from inside the stage hides it (back to the board; the tool stays
 * open and presented behind its tab). Keys from a modal a tool opened are
 * portaled elsewhere in the DOM, so they close only that modal.
 */
function useHideOnEscape() {
  const { setStageOpen } = useInteractives();
  return (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    if (!e.currentTarget.contains(e.target as Node)) return;
    e.stopPropagation();
    setStageOpen(false);
  };
}

/**
 * md+: the tool as a main-stage tab, in the board's place — the coach's
 * working copy (with "Show to class" and Close) or a student's read-only view.
 * ClassroomLayout switches to it whenever a tool opens.
 */
export function InteractiveStage({ stageSwitch }: { stageSwitch: ReactNode }) {
  const tool = useStageTool();
  const { isManager } = useInteractives();
  const onKeyDown = useHideOnEscape();
  if (!tool) return null;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      <InlineStage
        actions={isManager ? <ManagerActions tool={tool} /> : <BackToBoard />}
        fullWidth={tool.wide}
        stageSwitch={stageSwitch}
        title={<StageTitle tool={tool} />}
      >
        <ToolCard tool={tool} />
      </InlineStage>
    </div>
  );
}

/**
 * Phones: the tool takes the stage in place of the video grid and shared
 * board. "Back to video" hides it; the toolbar (coach: the launcher, student:
 * the Interactives button) brings it back.
 */
export function InteractivePhoneStage() {
  const tool = useStageTool();
  const { isManager, setStageOpen } = useInteractives();
  const onKeyDown = useHideOnEscape();
  if (!tool) return null;
  return (
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-2 pt-2 sm:px-4 sm:pt-3">
        <h2 className="min-w-0 flex-1 text-sm font-semibold text-app-text">
          <StageTitle tool={tool} />
        </h2>
        {isManager ? <ManagerActions tool={tool} /> : null}
        <SimpleTooltip label="Back to video">
          <button
            aria-label="Back to video"
            className={ROUND_ICON_BUTTON}
            onClick={() => setStageOpen(false)}
            type="button"
          >
            <LayoutGrid aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
          </button>
        </SimpleTooltip>
      </div>
      {/* Bottom padding clears the floating toolbar. */}
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-28 pt-2 sm:px-4 sm:pb-24">
        <div className={tool.wide ? "w-full" : "mx-auto w-full max-w-xl"}>
          <ToolCard tool={tool} />
        </div>
      </div>
    </section>
  );
}
