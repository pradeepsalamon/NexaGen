"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { META_PIXEL_ID } from "@/lib/site";
import { useAuthStore } from "@/stores/authStore";
import { AD_CONSENT_REOPEN_EVENT, onAcademyHost } from "../lib/adConsent";

/** Reopens the cookie banner so a visitor can change their answer (privacy page). Nothing without a pixel or when signed in. */
export function AdConsentSettingsButton() {
  const signedIn = useAuthStore((state) => Boolean(state.user));
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(Boolean(META_PIXEL_ID) && !onAcademyHost()), []);
  if (!shown || signedIn) return null;
  return (
    <div className="platform-brand-only">
      <Button onClick={() => window.dispatchEvent(new Event(AD_CONSENT_REOPEN_EVENT))} variant="outline">
        Change cookie choices
      </Button>
    </div>
  );
}
