"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Clock, MonitorUp, MonitorX } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  useClassroomTool,
  useSaveClassroomTool,
} from "../../../../hooks/useClassroomTools";
import {
  LEGEND_STORIES,
  legendById,
} from "../../../../lib/interactives/legends";
import { ToolLoadError, ToolLoading, type ToolContext } from "../shared";

export function ChessLegendsTool({ classId, isManager }: ToolContext) {
  const tool = useClassroomTool(classId, "LEGENDS");
  const save = useSaveClassroomTool(classId, "LEGENDS");
  const showingId = tool.state?.storyId ?? null;
  const [openId, setOpenId] = useState<string | null>(null);

  // A student follows the story the coach puts up (and can still browse back).
  useEffect(() => {
    if (!isManager && showingId) setOpenId(showingId);
  }, [isManager, showingId]);

  if (tool.isLoading) return <ToolLoading />;
  if (tool.isError)
    return <ToolLoadError onRetry={() => void tool.refetch()} />;

  const story = legendById(openId);
  const showing = legendById(showingId);

  if (story) {
    const isShowing = story.id === showingId;
    return (
      <article className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button onClick={() => setOpenId(null)} size="sm" variant="outline">
            <ArrowLeft
              aria-hidden="true"
              className="size-4"
              strokeWidth={2.5}
            />
            All stories
          </Button>
          {isManager ? (
            <Button
              isLoading={save.isPending}
              onClick={() =>
                save.mutate({ storyId: isShowing ? null : story.id })
              }
              size="sm"
              variant={isShowing ? "outline" : "primary"}
            >
              {isShowing ? (
                <MonitorX
                  aria-hidden="true"
                  className="size-4"
                  strokeWidth={2.5}
                />
              ) : (
                <MonitorUp
                  aria-hidden="true"
                  className="size-4"
                  strokeWidth={2.5}
                />
              )}
              {isShowing ? "Stop showing" : "Show to class"}
            </Button>
          ) : isShowing ? (
            <Badge variant="info">Your coach is showing this</Badge>
          ) : null}
        </div>
        <header>
          <p aria-hidden="true" className="text-4xl">
            {story.emoji}
          </p>
          <h3 className="mt-1 text-xl font-extrabold text-app-text">
            {story.title}
          </h3>
          <p className="text-sm text-app-muted">{story.subtitle}</p>
        </header>
        <div className="space-y-3 text-base leading-relaxed text-app-text">
          {story.paragraphs.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
        </div>
        <div className="rounded-control border border-accent/40 bg-accent/10 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-accent-ink">
            The lesson
          </p>
          <p className="mt-0.5 text-sm text-app-text">{story.lesson}</p>
        </div>
      </article>
    );
  }

  return (
    <div className="space-y-3">
      {showing ? (
        <button
          className="w-full rounded-control border border-primary/40 bg-primary/10 p-3 text-left text-sm transition-colors hover:bg-primary/15"
          onClick={() => setOpenId(showing.id)}
          type="button"
        >
          <span className="font-bold text-primary-ink">Now showing:</span>{" "}
          {showing.title}
        </button>
      ) : null}
      <p className="text-sm text-app-muted">
        {isManager
          ? "Pick a story for a class break. 'Show to class' opens it on every student's screen."
          : "Stories from chess history. Tap one to read it."}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {LEGEND_STORIES.map((s) => (
          <li key={s.id}>
            <button
              className={cn(
                "flex h-full w-full gap-3 rounded-control border border-app-border bg-app-surface p-3 text-left transition-colors hover:bg-app-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus",
                s.id === showingId && "border-primary/50",
              )}
              onClick={() => setOpenId(s.id)}
              type="button"
            >
              <span aria-hidden="true" className="text-2xl leading-none">
                {s.emoji}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-app-text">
                  {s.title}
                </span>
                <span className="block text-xs text-app-muted">
                  {s.subtitle}
                </span>
                <span className="mt-1 flex items-center gap-1 text-xs text-app-muted">
                  <Clock
                    aria-hidden="true"
                    className="size-3"
                    strokeWidth={2.5}
                  />
                  {s.minutes} min read
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
