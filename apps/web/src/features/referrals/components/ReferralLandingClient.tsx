"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Crown } from "lucide-react";
import { recordReferralVisit } from "../api/referralApi";
import { rememberReferralCode } from "../lib/referralStorage";

/**
 * `/r/<code>`: counts the visit (the API sets its attribution cookie), keeps
 * the code for the demo form as a fallback, then opens the academy page at
 * the demo booking section.
 */
export function ReferralLandingClient({ code }: { code: string }) {
  const router = useRouter();
  const [inviter, setInviter] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const go = () => router.replace("/#demo");
    // Never hold the visitor here for long, whatever the API does.
    const fallback = setTimeout(go, 2500);

    recordReferralVisit({ code, referrer: document.referrer || undefined, url: window.location.href })
      .then((result) => {
        if (result.valid) {
          rememberReferralCode(code);
          setInviter(result.referrerFirstName);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(fallback);
        setTimeout(go, 900);
      });

    return () => clearTimeout(fallback);
  }, [code, router]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-app-background px-4">
      <div className="w-full max-w-sm rounded-panel border border-app-border bg-app-surface p-6 text-center shadow-card">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
          <Crown aria-hidden="true" className="size-6" strokeWidth={2.25} />
        </span>
        <h1 className="mt-4 text-xl font-extrabold text-app-text">
          {inviter ? `${inviter} invited you to Nexa Chess` : "You're invited to Nexa Chess"}
        </h1>
        <p className="mt-2 text-sm text-app-muted" role="status">
          Taking you to book a free demo class…
        </p>
      </div>
    </main>
  );
}
