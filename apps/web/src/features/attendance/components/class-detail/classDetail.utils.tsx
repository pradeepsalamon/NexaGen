import {
  Clock,
  LayoutGrid,
  LogIn,
  LogOut,
  RefreshCcw,
  WifiOff,
} from "lucide-react";

export function formatDuration(seconds: number) {
  if (!seconds) return "0 min";
  const minutes = Math.floor(seconds / 60);
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${minutes} min`;
}

export function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getEventIcon(eventType: string) {
  switch (eventType) {
    case "JOIN":
      return <LogIn className="h-4 w-4 text-green-500" />;
    case "LEAVE":
      return <LogOut className="h-4 w-4 text-red-500" />;
    case "DISCONNECT":
      return <WifiOff className="h-4 w-4 text-orange-500" />;
    case "RECONNECT":
      return <RefreshCcw className="h-4 w-4 text-blue-500" />;
    case "BOARD_JOIN":
    case "BOARD_LEAVE":
      return <LayoutGrid className="h-4 w-4 text-blue-500" />;
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
