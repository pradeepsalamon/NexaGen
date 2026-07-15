"use client";

import { Crown, Settings, User } from "lucide-react";
import { ConnectionBadge } from "./ConnectionBadge";

interface MeetingHeaderProps {
  roomName: string;
  coachName?: string;
  batchName?: string;
}

export function MeetingHeader({
  roomName,
  coachName,
  batchName,
}: MeetingHeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-app-border bg-app-surface px-4 sm:px-6">
      {/* Left — Logo + Live badge */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Crown className="size-5 text-primary" />
          <span className="text-sm font-bold text-app-text tracking-tight">
            Nexa Chess
          </span>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <span className="size-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
          Live Class
        </span>
      </div>

      {/* Center — Session info */}
      <div className="hidden flex-col items-center md:flex">
        <h1 className="text-sm font-semibold text-app-text tracking-tight">
          {roomName}
        </h1>
        {(coachName || batchName) && (
          <p className="text-xs text-app-muted">
            {coachName && `Coach: ${coachName}`}
            {coachName && batchName && " · "}
            {batchName && `Batch: ${batchName}`}
          </p>
        )}
      </div>

      {/* Right — Connection + actions */}
      <div className="flex items-center gap-2">
        <ConnectionBadge />
        <button
          type="button"
          className="flex size-9 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-soft hover:text-app-text"
          aria-label="Settings"
        >
          <Settings className="size-4" />
        </button>
        <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-blue-400 text-xs font-bold text-white">
          <User className="size-3.5" />
        </div>
      </div>
    </header>
  );
}
