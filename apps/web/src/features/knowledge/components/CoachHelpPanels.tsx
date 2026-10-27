"use client";

import { useState } from "react";
import Link from "next/link";
import { Lightbulb, Loader2, Pencil, Trash2, TrendingUp } from "lucide-react";
import type { KnowledgeSubmissionDto, KnowledgeVersionStatus } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { suggestArticle, updateSuggestion, withdrawSuggestion } from "../api/knowledgeApi";
import { useCoachTrends, useInvalidateKnowledge, useMySuggestions } from "../hooks/useKnowledgeApi";
import { ContentEditor, EMPTY_CONTENT, contentPayload, type ContentDraft } from "./ContentEditor";

const STATUS_BADGE: Record<KnowledgeVersionStatus, { label: string; variant: "info" | "success" | "destructive" | "secondary" }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  PUBLISHED: { label: "Published", variant: "success" },
  REJECTED: { label: "Not accepted", variant: "destructive" },
  SUBMITTED: { label: "Waiting for review", variant: "info" },
  SUPERSEDED: { label: "Published (since updated)", variant: "secondary" },
};

export function CoachSuggestionsPanel() {
  const suggestions = useMySuggestions();
  const timeZone = useUserTimeZone();
  const [editing, setEditing] = useState<KnowledgeSubmissionDto | "new" | null>(null);
  const withdraw = useUndoableMutation({
    invalidates: [queryKeys.knowledge.suggestions],
    mutationFn: (id: string) => withdrawSuggestion(id),
    strategy: "defer",
    toast: () => ({ title: "Suggestion withdrawn." }),
    undo: async () => undefined,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-app-muted">
          Suggest a help article, or an edit to one you can read. An admin reviews it and decides who it is for before it
          goes live.
        </p>
        <Button onClick={() => setEditing("new")}>
          <Lightbulb aria-hidden className="mr-2 size-4" strokeWidth={2.5} />
          Suggest an article
        </Button>
      </div>
      {suggestions.isError ? (
        <WidgetError message="Your suggestions could not be loaded." onRetry={() => void suggestions.refetch()} />
      ) : !suggestions.data ? (
        <Skeleton className="h-24" />
      ) : suggestions.data.submissions.length === 0 ? (
        <EmptyState description="Ideas you send to the admins appear here with their status." icon={Lightbulb} title="No suggestions yet" />
      ) : (
        <ul className="space-y-3">
          {suggestions.data.submissions.map((s) => {
            const badge = STATUS_BADGE[s.version.status];
            return (
              <li key={s.version.id}>
                <Card className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{s.version.title}</p>
                    <p className="mt-0.5 text-xs text-app-muted">
                      {s.isNewArticle ? "New article" : `Edit of “${s.articleTitle ?? s.articleSlug}”`} · sent{" "}
                      {formatFullDate(s.version.createdAt, timeZone)}
                    </p>
                    {s.version.reviewNote && (
                      <p className="mt-2 rounded-control bg-app-soft px-3 py-2 text-sm">Admin note: {s.version.reviewNote}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    {s.version.status === "SUBMITTED" && (
                      <>
                        <SimpleTooltip label="Edit suggestion">
                          <Button aria-label="Edit suggestion" className="rounded-full" onClick={() => setEditing(s)} size="icon" variant="outline">
                            <Pencil className="size-4" strokeWidth={2.5} />
                          </Button>
                        </SimpleTooltip>
                        <SimpleTooltip label="Withdraw suggestion">
                          <Button
                            aria-label="Withdraw suggestion"
                            className="rounded-full bg-app-danger text-white hover:bg-app-danger/85"
                            onClick={() => void withdraw.run(s.version.id)}
                            size="icon"
                            variant="ghost"
                          >
                            <Trash2 className="size-4" strokeWidth={2.5} />
                          </Button>
                        </SimpleTooltip>
                      </>
                    )}
                    {(s.version.status === "PUBLISHED" || s.version.status === "SUPERSEDED") && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/help/${s.articleSlug}`}>View</Link>
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <SuggestionDialog
        onOpenChange={(open) => !open && setEditing(null)}
        open={editing !== null}
        suggestion={editing === "new" ? null : editing}
      />
    </div>
  );
}

/** New suggestion, an edit of a waiting one, or (with `articleId`) an edit of a published article. */
export function SuggestionDialog({
  open,
  onOpenChange,
  suggestion,
  articleId,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestion: KnowledgeSubmissionDto | null;
  articleId?: string;
  initial?: Partial<ContentDraft>;
}) {
  const toast = useToast();
  const invalidate = useInvalidateKnowledge();
  const [value, setValue] = useState<ContentDraft>(EMPTY_CONTENT);
  const [saving, setSaving] = useState(false);
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  // Load the form each time the dialog opens for a different target.
  const key = open ? (suggestion?.version.id ?? articleId ?? "new") : null;
  if (key !== openedFor) {
    setOpenedFor(key);
    if (key) {
      const v = suggestion?.version;
      setValue(
        v
          ? {
              ...EMPTY_CONTENT,
              body: v.body,
              changeNote: v.changeNote ?? "",
              pgn: v.pgn ?? "",
              resourceRef: v.resourceRef ?? "",
              resourceType: v.resourceType ?? "",
              summary: v.summary ?? "",
              title: v.title,
            }
          : { ...EMPTY_CONTENT, ...initial },
      );
    }
  }

  const submit = async () => {
    if (!value.title.trim()) {
      toast.error({ title: "Give it a title first." });
      return;
    }
    setSaving(true);
    try {
      // undo: intentionally excluded — a suggestion is reviewable/withdrawable from the list, not live content.
      if (suggestion) await updateSuggestion(suggestion.version.id, contentPayload(value));
      else await suggestArticle({ articleId, content: contentPayload(value) });
      await invalidate();
      toast.success({ title: suggestion ? "Suggestion updated." : "Suggestion sent to the admins." });
      onOpenChange(false);
    } catch (err) {
      toast.error({ message: err instanceof Error ? err.message : undefined, title: "Could not send the suggestion" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{suggestion ? "Edit suggestion" : articleId ? "Suggest an edit" : "Suggest a help article"}</DialogTitle>
          <DialogDescription>Admins review every suggestion before anyone else can see it.</DialogDescription>
        </DialogHeader>
        <ContentEditor kind="ARTICLE" onChange={setValue} previewRole="STUDENT" showChangeNote={!!articleId || !!suggestion} value={value} />
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void submit()}>
            {saving && <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />}
            {suggestion ? "Save" : "Send suggestion"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CoachTrendsPanel() {
  const trends = useCoachTrends();
  if (trends.isError) return <WidgetError message="Trends could not be loaded." onRetry={() => void trends.refetch()} />;
  if (!trends.data) return <Skeleton className="h-40" />;
  const { batches, days, minCount } = trends.data;
  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-app-muted">
        What students in your batches searched for in the help centre over the last {days} days. Searches are anonymous,
        and a question shows once at least {minCount} searches asked it.
      </p>
      {batches.length === 0 ? (
        <EmptyState description="You aren't coaching a batch yet." icon={TrendingUp} title="No batches" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {batches.map((b) => (
            <Card className="p-4" key={b.id}>
              <h3 className="font-bold">{b.name}</h3>
              {b.queries.length === 0 ? (
                <p className="mt-2 text-sm text-app-muted">Nothing asked often enough yet.</p>
              ) : (
                <ol className="mt-3 space-y-1.5">
                  {b.queries.map((q) => (
                    <li className="flex items-center justify-between gap-3 text-sm" key={q.query}>
                      <span className="min-w-0 truncate">{q.query}</span>
                      <Badge variant="secondary">{q.count}×</Badge>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
