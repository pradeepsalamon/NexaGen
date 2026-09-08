import { Loader2 } from "lucide-react";

/**
 * Lightweight loading state for the classroom. Renders a calm skeleton of the
 * video stage rather than a blank screen; the caller supplies the surrounding
 * full-height chrome.
 */
export function LoadingMeeting({ message = "Loading class…" }: { message?: string }) {
  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-6 py-10">
      <div className="grid w-full grid-cols-2 gap-3" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="aspect-video rounded-2xl border border-app-border bg-app-soft motion-safe:animate-pulse"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>
      <p className="flex items-center gap-2 text-sm font-medium text-app-muted">
        <Loader2 className="size-4 animate-spin" />
        {message}
      </p>
    </div>
  );
}

export function JoiningRoom() {
  return <LoadingMeeting message="Connecting to Live Class…" />;
}
