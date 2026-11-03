"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { ParticipantAvatar } from "../meeting/ParticipantAvatar";

/**
 * Request row (spec component 17): 48px. Avatar, name and a note, then Deny
 * (neutral) and the positive action (Admit / Allow, outline). Each button
 * stays pressed and disabled until the server answers.
 */
export function RequestRow({
  name,
  note,
  actions,
}: {
  name: string;
  note?: ReactNode;
  actions: { label: string; spokenLabel: string; tone: "deny" | "allow"; onClick: () => Promise<void> | void }[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div className="flex min-h-12 items-center justify-between gap-2 rounded-control px-2 py-1.5 hover:bg-app-soft" role="listitem">
      <div className="flex min-w-0 items-center gap-2.5">
        <ParticipantAvatar name={name} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-app-text">{name}</span>
          {note ? <span className="block truncate text-xs text-app-muted">{note}</span> : null}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {actions.map((action) => (
          <Button
            key={action.label}
            size="sm"
            variant={action.tone === "allow" ? "outline" : "neutral"}
            aria-label={action.spokenLabel}
            isLoading={busy === action.label}
            disabled={busy !== null}
            onClick={async () => {
              setBusy(action.label);
              try {
                await action.onClick();
              } finally {
                setBusy(null);
              }
            }}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Section header over a group of rows; `action` carries e.g. "Admit all". */
export function RowSectionHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-2 px-2 pb-1">
      <h3 className="text-xs font-semibold text-app-muted">{children}</h3>
      {action}
    </div>
  );
}
