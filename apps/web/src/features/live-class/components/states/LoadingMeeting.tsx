import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";

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
          <Skeleton key={i} className="aspect-video rounded-app border border-app-border" />
        ))}
      </div>
      <p className="flex items-center gap-2 text-sm font-medium text-app-muted" role="status">
        <Spinner className="size-4" />
        {message}
      </p>
    </div>
  );
}

export function JoiningRoom() {
  return <LoadingMeeting message="Connecting to Live Class…" />;
}
