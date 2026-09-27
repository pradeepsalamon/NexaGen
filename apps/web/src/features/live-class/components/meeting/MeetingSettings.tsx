"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Keyboard, Mic, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { InRoomClassControls } from "../../settings/InRoomClassControls";
import { MeetingDeviceSettings } from "./MeetingDeviceSettings";
import { PanelHeader } from "./PanelHeader";

/** One card in the settings panel. Optionally a collapsed disclosure. */
function PanelSection({
  children,
  collapsible = false,
  defaultOpen = true,
  description,
  icon,
  title,
}: {
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  description?: string;
  icon: ReactNode;
  title: string;
}) {
  const [open, setOpen] = useState(collapsible ? defaultOpen : true);

  const heading = (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
      <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-app-muted">
        <span className="text-app-muted">{icon}</span>
        {title}
      </span>
      {description && (
        <span className="text-xs font-normal leading-snug text-app-muted/80">{description}</span>
      )}
    </span>
  );

  return (
    <section className="min-w-0 overflow-hidden rounded-app border border-app-border bg-app-surface">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-start gap-2 px-3.5 py-3 text-left transition-colors hover:bg-app-soft/60"
        >
          {heading}
          <ChevronDown
            className={cn(
              "mt-0.5 size-4 shrink-0 text-app-muted transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      ) : (
        <div className="flex items-start gap-2 px-3.5 pb-1 pt-3">{heading}</div>
      )}

      {open && (
        <div className={cn("min-w-0 px-3.5 pb-3.5", collapsible && "border-t border-app-border pt-3.5")}>
          {children}
        </div>
      )}
    </section>
  );
}

const SHORTCUTS = [
  { key: "M", action: "Toggle microphone" },
  { key: "V", action: "Toggle camera" },
  { key: "Esc", action: "Close panel / exit fullscreen" },
];

export function MeetingSettings() {
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Settings" />

      <div className="custom-scrollbar min-w-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3">
        <PanelSection
          icon={<Mic className="size-3.5" />}
          title="Your devices"
          description="Only affects you — nobody else in the class sees this change."
        >
          <MeetingDeviceSettings />
        </PanelSection>

        {isCoach && (
          // Collapsed by default: it is the longest section in the panel and a
          // coach opens Settings far more often to switch a mic than to
          // re-govern the room.
          <PanelSection
            collapsible
            defaultOpen={false}
            icon={<SlidersHorizontal className="size-3.5" />}
            title="Class settings"
            description="Mic, camera, chat and board rules for everyone in this class."
          >
            <InRoomClassControls />
          </PanelSection>
        )}

        <PanelSection
          collapsible
          defaultOpen={false}
          icon={<Keyboard className="size-3.5" />}
          title="Keyboard shortcuts"
        >
          <dl className="space-y-2">
            {SHORTCUTS.map(({ key, action }) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <dt className="min-w-0 truncate text-sm text-app-text">{action}</dt>
                <dd>
                  <kbd className="rounded-md border border-app-border bg-app-soft px-2 py-0.5 font-mono text-xs font-semibold text-app-muted">
                    {key}
                  </kbd>
                </dd>
              </div>
            ))}
          </dl>
        </PanelSection>
      </div>
    </div>
  );
}
