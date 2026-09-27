import type { ClassChangeRequestDto } from "@nexa-chess/types";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime, formatTime } from "@/lib/datetime";

/** "Sat 4 Oct, 5:00 PM – 6:00 PM", with the old time struck through for a reschedule. */
export function ClassRequestWhen({ request }: { request: ClassChangeRequestDto }) {
  const tz = useUserTimeZone();
  return (
    <span className="text-sm text-app-text">
      {request.originalStartsAt ? (
        <>
          <span className="text-app-muted line-through">{formatDateTime(request.originalStartsAt, tz)}</span>
          {" → "}
        </>
      ) : null}
      {formatDateTime(request.startsAt, tz)} – {formatTime(request.endsAt, tz)}
    </span>
  );
}
