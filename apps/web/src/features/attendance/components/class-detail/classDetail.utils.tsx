import {
  Clock,
  LayoutGrid,
  LogIn,
  LogOut,
  RefreshCcw,
  WifiOff,
} from "lucide-react";

export function getEventIcon(eventType: string) {
  switch (eventType) {
    case "JOIN":
      return <LogIn className="h-4 w-4 text-success-ink" />;
    case "LEAVE":
      return <LogOut className="h-4 w-4 text-app-muted" />;
    case "DISCONNECT":
      return <WifiOff className="h-4 w-4 text-warning-ink" />;
    case "RECONNECT":
      return <RefreshCcw className="h-4 w-4 text-primary-ink" />;
    case "BOARD_JOIN":
    case "BOARD_LEAVE":
      return <LayoutGrid className="h-4 w-4 text-primary-ink" />;
    default:
      return <Clock className="h-4 w-4 text-app-muted" />;
  }
}

const EVENT_LABELS: Record<string, string> = {
  JOIN: "Joined",
  LEAVE: "Left",
  DISCONNECT: "Disconnected",
  RECONNECT: "Reconnected",
  BOARD_JOIN: "Started board sharing",
  BOARD_LEAVE: "Stopped board sharing",
};

export function formatEventLabel(eventType: string) {
  return EVENT_LABELS[eventType] ?? eventType;
}

export function getEventDotClass(type: string) {
  switch (type) {
    case "JOIN":
      return "bg-success ring-2 ring-success/20";
    case "LEAVE":
      return "bg-app-muted ring-2 ring-app-border";
    case "DISCONNECT":
      return "bg-warning ring-2 ring-warning/20";
    case "RECONNECT":
    case "BOARD_JOIN":
    case "BOARD_LEAVE":
      return "bg-primary ring-2 ring-primary/40";
    default:
      return "bg-app-muted ring-2 ring-app-border";
  }
}
