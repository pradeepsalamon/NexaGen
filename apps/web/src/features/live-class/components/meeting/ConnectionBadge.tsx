"use client";

import { useConnectionState } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { cn } from "@/lib/utils";

const statusConfig: Record<
  ConnectionState,
  { label: string; dotClass: string; textClass: string; pulse: boolean }
> = {
  [ConnectionState.Connected]: {
    label: "Connected",
    dotClass: "bg-emerald-400",
    textClass: "text-emerald-400",
    pulse: false,
  },
  [ConnectionState.Connecting]: {
    label: "Connecting...",
    dotClass: "bg-amber-400",
    textClass: "text-amber-400",
    pulse: true,
  },
  [ConnectionState.Disconnected]: {
    label: "Disconnected",
    dotClass: "bg-red-400",
    textClass: "text-red-400",
    pulse: false,
  },
  [ConnectionState.Reconnecting]: {
    label: "Reconnecting...",
    dotClass: "bg-amber-400",
    textClass: "text-amber-400",
    pulse: true,
  },
  [ConnectionState.SignalReconnecting]: {
    label: "Reconnecting...",
    dotClass: "bg-amber-400",
    textClass: "text-amber-400",
    pulse: true,
  },
};

export function ConnectionBadge() {
  const connectionState = useConnectionState();
  const config = statusConfig[connectionState];

  return (
    <div className="flex items-center gap-2 rounded-full border border-app-border bg-app-surface px-3 py-1.5 shadow-sm">
      <span
        className={cn(
          "size-2 rounded-full",
          config.dotClass,
          config.pulse && "animate-pulse"
        )}
      />
      <span className={cn("text-xs font-medium", config.textClass)}>
        {config.label}
      </span>
    </div>
  );
}
