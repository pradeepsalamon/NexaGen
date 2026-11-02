"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Crown, Gift } from "lucide-react";
import { formatReferralReward, type ReferralBenefitItem } from "@nexa-chess/types";
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
  const [benefits, setBenefits] = useState<ReferralBenefitItem[]>([]);
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
          setBenefits(result.benefits);
        }
        return result.valid && result.benefits.length > 0;
      })
      .catch(() => false)
      .then((hasBenefits) => {
        clearTimeout(fallback);
        // Long enough to read what they get for joining.
        setTimeout(go, hasBenefits ? 3500 : 900);
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
        {benefits.length ? (
          <ul className="mt-4 grid gap-2 text-left">
            {benefits.map((benefit) => (
              <li className="flex items-start gap-2 rounded-control bg-accent-soft p-3 text-sm text-app-text" key={benefit.id}>
                <Gift aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent-ink" strokeWidth={2.5} />
                <span>
                  <span className="font-bold">{formatReferralReward(benefit.amountMinor, benefit.unit, benefit.currency)}</span>{" "}
                  {benefit.description ?? `when you reach "${benefit.stageName}"`}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-4 text-sm text-app-muted" role="status">
          Taking you to book a free demo class…
        </p>
      </div>
    </main>
  );
}
