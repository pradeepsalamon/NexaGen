"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { META_PIXEL_ID } from "@/lib/site";
import { useAuthStore } from "@/stores/authStore";
import { useAdConsentMutation } from "../hooks/useAdConsentApi";
import { AD_CONSENT_REOPEN_EVENT, onAcademyHost, readAdConsent, writeAdConsent, type AdConsent } from "../lib/adConsent";
import { loadMetaPixel, trackMetaPixel } from "../lib/metaPixel";

/**
 * Ad measurement on one of Nexa's public pages (docs/AD_MEASUREMENT.md): the cookie banner until
 * the visitor answers, then the Meta Pixel only after Accept (PageView). Renders nothing without a pixel id, on another academy's address, or for a signed-in
 * user. Mount it once per public page; never in signed-in areas or the live class.
 */
export function AdMeasurement() {
  const signedIn = useAuthStore((state) => Boolean(state.user));
  const [ready, setReady] = useState(false);
  const [answer, setAnswer] = useState<AdConsent | null>(null);
  const [reopened, setReopened] = useState(false);
  const consent = useAdConsentMutation();

  const active = ready && Boolean(META_PIXEL_ID) && !signedIn;

  useEffect(() => {
    if (onAcademyHost()) return;
    setAnswer(readAdConsent());
    setReady(true);
    const reopen = () => setReopened(true);
    window.addEventListener(AD_CONSENT_REOPEN_EVENT, reopen);
    return () => window.removeEventListener(AD_CONSENT_REOPEN_EVENT, reopen);
  }, []);

  useEffect(() => {
    if (!active || answer !== "granted") return;
    if (!loadMetaPixel()) return;
    trackMetaPixel("PageView");
  }, [active, answer]);

  const choose = useCallback(
    (value: AdConsent) => {
      writeAdConsent(value);
      setAnswer(value);
      setReopened(false);
      consent.mutate({ consent: value === "granted", referrer: document.referrer || undefined, url: window.location.href });
      // Declining after accepting: the pixel already on this page stops at the next page load.
    },
    [consent]
  );

  if (!active || (answer !== null && !reopened)) return null;

  return (
    <div className="platform-brand-only">
      <section
        aria-label="Cookie choices"
        className="fixed inset-x-4 bottom-4 z-[60] grid gap-3 rounded-panel border border-app-border bg-app-surface p-4 text-sm text-app-text shadow-lift sm:left-auto sm:right-6 sm:w-full sm:max-w-md"
      >
        <p>
          May we use the Meta Pixel? It tells Meta which of our ads brought you here, so we can show fewer, better ones. It never
          sees your child&apos;s details.{" "}
          <Link className="font-semibold text-primary-ink underline underline-offset-2" href="/privacy#ad-measurement">
            How we use it
          </Link>
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => choose("denied")} variant="neutral">
            Decline
          </Button>
          <Button onClick={() => choose("granted")} variant="primary">
            Accept
          </Button>
        </div>
      </section>
    </div>
  );
}
