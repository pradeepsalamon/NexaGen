"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { useParams } from "next/navigation";
import { Pause, Shapes, Timer } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";
import { cn } from "@/lib/utils";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import {
  formatClock,
  useClassroomTimer,
} from "../../../hooks/useClassroomTimer";
import { useClassroomToolsSync } from "../../../hooks/useClassroomTools";
import { MeetingControlButton } from "../MeetingControlButton";
import { InteractivePanel } from "./InteractivePanel";
import { INTERACTIVE_TOOLS, type InteractiveToolId } from "./registry";

const COLUMNS = 4;

/**
 * Toolbar button → popover of the twelve classroom Interactives → the chosen
 * tool in a floating panel. Owns the room's single classroom-timer driver and
 * the `classroom_tools` packet listener, so both run whether a panel is open
 * or not.
 */
export function InteractivesLauncher() {
  const params = useParams();
  const classId = (params?.roomId as string) ?? "";
  const user = useAuthStore((s) => s.user);
  // Same rule as the rest of the toolbar; the API re-checks class ownership.
  const isManager = user?.role === "COACH" || isStaffRole(user?.role);

  const [open, setOpen] = useState(false);
  const [toolId, setToolId] = useState<InteractiveToolId | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useClassroomToolsSync(classId);
  const timer = useClassroomTimer(classId, isManager);
  const tool = INTERACTIVE_TOOLS.find((t) => t.id === toolId) ?? null;

  const choose = (id: InteractiveToolId) => {
    setToolId(id);
    setOpen(false);
  };

  const close = () => {
    setToolId(null);
    triggerRef.current?.focus();
  };

  // Arrow keys move through the 4×3 grid.
  const onGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = itemRefs.current.findIndex(
      (el) => el === document.activeElement,
    );
    if (index < 0) return;
    const step =
      e.key === "ArrowRight"
        ? 1
        : e.key === "ArrowLeft"
          ? -1
          : e.key === "ArrowDown"
            ? COLUMNS
            : e.key === "ArrowUp"
              ? -COLUMNS
              : 0;
    let next = index + step;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = INTERACTIVE_TOOLS.length - 1;
    if (next === index || next < 0 || next >= INTERACTIVE_TOOLS.length) return;
    e.preventDefault();
    e.stopPropagation();
    itemRefs.current[next]?.focus();
  };

  const timerVisible =
    timer.state &&
    (timer.state.status === "RUNNING" || timer.state.status === "PAUSED");

  return (
    <div className="relative">
      {/* The running classroom timer rides on the launcher's top edge, for everyone, while its panel is closed. */}
      {timerVisible && toolId !== "classroom-timer" && timer.phase ? (
        <button
          aria-label={`Classroom timer: ${timer.phase.label}, ${formatClock(timer.remainingMs)} left. Open the timer`}
          className={cn(
            "absolute -top-2.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 whitespace-nowrap rounded-full border border-app-border bg-app-surface px-1.5 text-[0.6875rem] font-bold leading-5 tabular-nums shadow-card transition-colors hover:bg-app-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus",
            timer.state?.status === "RUNNING" && timer.remainingMs <= 60_000 ? "text-app-danger-ink" : "text-app-text"
          )}
          onClick={() => setToolId("classroom-timer")}
          type="button"
        >
          <Timer aria-hidden="true" className="size-3" strokeWidth={2.5} />
          {formatClock(timer.remainingMs)}
          {timer.state?.status === "PAUSED" ? <Pause aria-hidden="true" className="size-3" strokeWidth={2.5} /> : null}
        </button>
      ) : null}

      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <MeetingControlButton
            aria-expanded={open}
            aria-haspopup="dialog"
            icon={<Shapes className="size-5" />}
            label="Interactives"
            ref={triggerRef}
            variant={open || tool ? "active" : "default"}
          />
        </PopoverTrigger>
        <PopoverContent
          aria-label="Interactives"
          className="w-[min(22rem,calc(100vw-2rem))] p-3"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            itemRefs.current[0]?.focus();
          }}
          side="top"
          sideOffset={12}
        >
          <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-app-muted">
            Interactives
          </p>
          <div
            className="grid grid-cols-4 gap-x-1 gap-y-2"
            onKeyDown={onGridKeyDown}
            role="group"
          >
            {INTERACTIVE_TOOLS.map((t, i) => {
              const Icon = t.icon;
              return (
                  <button
                    aria-label={t.label}
                    key={t.id}
                    className="group flex flex-col items-center gap-1 rounded-control p-1 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-focus"
                    onClick={() => choose(t.id)}
                    ref={(el) => {
                      itemRefs.current[i] = el;
                    }}
                    tabIndex={i === 0 ? 0 : -1}
                    type="button"
                  >
                    <span
                      className={cn(
                        "flex size-11 items-center justify-center rounded-full transition-transform group-hover:scale-105 group-active:scale-95 motion-reduce:transition-none",
                        t.tone,
                        t.id === toolId && "ring-2 ring-primary",
                      )}
                    >
                      <Icon
                        aria-hidden="true"
                        className="size-5"
                        strokeWidth={2.25}
                      />
                    </span>
                    {/* Always-visible name — covers hover, keyboard focus and touch alike. */}
                    <span
                      aria-hidden="true"
                      className="line-clamp-2 text-[0.6875rem] font-semibold leading-tight text-app-text"
                    >
                      {t.label}
                    </span>
                  </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {tool ? (
        <InteractivePanel onClose={close} tool={tool}>
          <tool.Component
            classId={classId}
            isManager={isManager}
            timer={timer}
          />
        </InteractivePanel>
      ) : null}
    </div>
  );
}
