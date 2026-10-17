"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/providers/ToastProvider";
import { useDownloadMyData } from "../hooks/usePrivacyApi";

/** Profile → "Your data": a JSON copy of everything the academy holds about you. */
export function PersonalDataSection() {
  const toast = useToast();
  const download = useDownloadMyData();

  return (
    <section
      aria-labelledby="personal-data-heading"
      className="mx-auto mt-5 max-w-4xl rounded-panel border border-app-border bg-app-surface p-5 shadow-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-lg font-bold text-app-text" id="personal-data-heading">
            Your data
          </h2>
          <p className="mt-1 text-sm text-app-muted">
            Download a copy of everything the academy holds about you: your profile, classes and
            attendance, puzzle and homework results, messages, and payments. It comes as a JSON file.
          </p>
        </div>
        <Button
          disabled={download.isPending}
          onClick={() =>
            download.mutate(undefined, {
              onSuccess: () => toast.success({ title: "Your data was downloaded" })
            })
          }
          variant="outline"
        >
          <Download aria-hidden className="h-4 w-4" strokeWidth={2.5} />
          {download.isPending ? "Preparing…" : "Download my data"}
        </Button>
      </div>
    </section>
  );
}
