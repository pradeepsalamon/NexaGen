"use client";

import { useBrandName } from "@/features/branding/context/TenantBrandProvider";
import { useEffect, useState } from "react";
import { Check, Copy, MessageCircle, Share2 } from "lucide-react";
import { referralLink } from "@nexa-chess/types";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SITE_URL } from "@/lib/site";
import { useToast } from "@/providers/ToastProvider";

type Props = {
  code: string;
  active: boolean;
};

/** The referrer's link and code, with copy and share. */
export function ReferralShareCard({ active, code }: Props) {
  const brandName = useBrandName();
  const toast = useToast();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  // The page's own origin, so a staging or self-hosted deployment shares its own link.
  const [origin, setOrigin] = useState(SITE_URL ?? "");
  useEffect(() => setOrigin(window.location.origin), []);

  const link = referralLink(origin, code);
  const message = `Join me at ${brandName}! Book a free demo class here: ${link}`;

  const copy = async (what: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(what === "link" ? link : code);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error({ title: "Couldn't copy", message: "Select the text and copy it yourself." });
    }
  };

  const share = async () => {
    if (navigator.share) {
      await navigator.share({ text: message, title: brandName, url: link }).catch(() => undefined);
    } else {
      await copy("link");
    }
  };

  return (
    <section className="rounded-panel border border-app-border bg-app-surface p-5 shadow-card">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-extrabold text-app-text">Your referral link</h2>
        <p className="text-sm text-app-muted">
          Share it with friends and family. Everyone who opens it and books a demo is tracked to you.
        </p>
      </div>

      {active ? null : (
        <Alert className="mt-4" variant="warning">
          Your link is paused by the academy. Visits through it are not counted right now.
        </Alert>
      )}

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Input aria-label="Referral link" className="font-mono" onFocus={(event) => event.target.select()} readOnly value={link} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => void share()} variant="neutral">
            <Share2 aria-hidden="true" className="size-4" strokeWidth={2.5} />
            Share
          </Button>
          <Button asChild variant="outline">
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} rel="noopener noreferrer" target="_blank">
              <MessageCircle aria-hidden="true" className="size-4" strokeWidth={2.5} />
              WhatsApp
            </a>
          </Button>
          <Button onClick={() => void copy("link")} variant="primary">
            {copied === "link" ? (
              <Check aria-hidden="true" className="size-4" strokeWidth={2.5} />
            ) : (
              <Copy aria-hidden="true" className="size-4" strokeWidth={2.5} />
            )}
            {copied === "link" ? "Copied" : "Copy link"}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-app-muted">
        <span>Or share your code:</span>
        <button
          className="rounded-control border border-dashed border-app-line-strong bg-app-soft px-3 py-1 font-mono font-bold text-app-text transition-colors hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
          onClick={() => void copy("code")}
          type="button"
        >
          {code}
        </button>
        {copied === "code" ? <span className="text-success-ink">Copied</span> : null}
      </div>
    </section>
  );
}
