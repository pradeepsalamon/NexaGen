"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTrackVisitMutation } from "../hooks/useLeadPublicApi";

function TrackingLogic() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { mutate: trackVisit } = useTrackVisitMutation();

  useEffect(() => {
    // Slight delay so this never competes with first paint.
    const timeout = setTimeout(() => trackVisit(), 500);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  return null;
}

export function TrackingProvider() {
  return (
    <Suspense fallback={null}>
      <TrackingLogic />
    </Suspense>
  );
}
