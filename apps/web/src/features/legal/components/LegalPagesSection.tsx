"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import {
  LEGAL_PAGE_KINDS,
  LEGAL_PAGE_LABELS,
  LEGAL_PAGE_MAX_LENGTH,
  LEGAL_PAGE_PATHS,
  type LegalPageKind,
  type PublicLegalPage
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { TextEditor } from "@/components/ui/TextEditor";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { useAdminLegalPages, useUpdateLegalPage } from "../hooks/useLegalPages";

function LegalPageEditor({ page }: { page: PublicLegalPage }) {
  const save = useUpdateLegalPage();
  const timeZone = useUserTimeZone();
  const [text, setText] = useState(page.body ?? "");
  const saved = page.body ?? "";
  const id = `legal-page-${page.kind}`;
  const label = LEGAL_PAGE_LABELS[page.kind];

  return (
    <div className="grid gap-3">
      <p className="text-sm text-app-muted">
        {page.body && page.updatedAt
          ? `Your families see your own text, last changed ${formatFullDate(page.updatedAt, timeZone)}.`
          : "Your families see the built-in text until you write your own."}
      </p>
      <FormField
        hint="Empty the box and save to go back to the built-in text."
        id={id}
        label={label}
      >
        <TextEditor
          id={id}
          linkTargets="site"
          maxLength={LEGAL_PAGE_MAX_LENGTH}
          onChange={setText}
          previewable
          rows={16}
          value={text}
        />
      </FormField>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={text.trim() === saved.trim()}
          isLoading={save.isPending}
          onClick={() => save.mutate({ body: text, kind: page.kind })}
        >
          Save {label.toLowerCase()}
        </Button>
        <Button asChild variant="outline">
          <a href={LEGAL_PAGE_PATHS[page.kind]} rel="noreferrer" target="_blank">
            <ExternalLink aria-hidden="true" className="size-4" strokeWidth={2.5} />
            View the page
          </a>
        </Button>
      </div>
    </div>
  );
}

/**
 * Admin → Branding → Legal pages: the academy's own privacy policy and terms,
 * shown at `/privacy` and `/terms` on its own address. Hidden for Nexa's own
 * academy, whose pages are part of the app.
 */
export function LegalPagesSection() {
  const query = useAdminLegalPages();
  const [tab, setTab] = useState<LegalPageKind>("privacy");

  if (query.isError) return <WidgetError message="Couldn't load the legal pages." onRetry={() => void query.refetch()} />;
  if (!query.data) return <Skeleton className="h-64 w-full" />;
  if (!query.data.editable) return null;

  return (
    <SectionCard
      description="Your privacy policy and terms, shown on your own address and linked from the sign-up form. New sign-ups are recorded against the version shown at the time."
      title="Legal pages"
    >
      <Tabs onValueChange={(value) => setTab(value as LegalPageKind)} value={tab}>
        <TabsList>
          {LEGAL_PAGE_KINDS.map((kind) => (
            <TabsTrigger key={kind} value={kind}>
              {LEGAL_PAGE_LABELS[kind]}
            </TabsTrigger>
          ))}
        </TabsList>
        {query.data.pages.map((page) => (
          // Kept mounted so a draft in the other tab survives switching.
          <TabsContent className="pt-4 data-[state=inactive]:hidden" forceMount key={page.kind} value={page.kind}>
            <LegalPageEditor key={page.updatedAt ?? "built-in"} page={page} />
          </TabsContent>
        ))}
      </Tabs>
    </SectionCard>
  );
}
