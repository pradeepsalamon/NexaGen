"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Inbox, Loader2, X } from "lucide-react";
import type { KnowledgeSubmissionDto } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Label } from "@/components/ui/Label";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { useToast } from "@/providers/ToastProvider";
import { rejectKnowledge } from "../../api/knowledgeApi";
import { useInvalidateKnowledge, useKnowledgeSubmissions } from "../../hooks/useKnowledgeApi";
import { KnowledgeMarkdown } from "../KnowledgeMarkdown";

/** Coach suggestions waiting for an admin. Publishing happens in the article editor (audience first). */
export function SubmissionsPanel() {
  const submissions = useKnowledgeSubmissions();
  const timeZone = useUserTimeZone();
  const [rejecting, setRejecting] = useState<KnowledgeSubmissionDto | null>(null);

  if (submissions.isError) return <WidgetError message="Suggestions could not be loaded." onRetry={() => void submissions.refetch()} />;
  if (!submissions.data) return <Skeleton className="h-40" />;
  if (!submissions.data.submissions.length) {
    return <EmptyState description="When a coach suggests an article or an edit, it waits here for review." icon={Inbox} title="No suggestions waiting" />;
  }
  return (
    <div className="space-y-3">
      {submissions.data.submissions.map((s) => (
        <Card className="space-y-3 p-4" key={s.version.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold">{s.version.title}</p>
              <p className="text-xs text-app-muted">
                {s.isNewArticle ? "New article" : `Edit of “${s.articleTitle ?? s.articleSlug}”`} · by {s.version.author?.name ?? "a coach"} ·{" "}
                {formatFullDate(s.version.createdAt, timeZone)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {s.version.warnings.length > 0 && <Badge variant="warning">Flagged</Badge>}
              <Button asChild size="sm">
                <Link href={`/admin/knowledge/${s.articleId}?review=${s.version.id}`}>
                  <Check aria-hidden className="mr-1.5 size-4" strokeWidth={2.5} />
                  Review & publish
                </Link>
              </Button>
              <Button onClick={() => setRejecting(s)} size="sm" variant="outline">
                <X aria-hidden className="mr-1.5 size-4" strokeWidth={2.5} />
                Decline
              </Button>
            </div>
          </div>
          <details className="rounded-control border border-app-border p-3">
            <summary className="cursor-pointer text-sm font-semibold">Read the suggestion</summary>
            <div className="mt-3">
              <KnowledgeMarkdown role="ADMIN" source={s.version.body} />
            </div>
          </details>
        </Card>
      ))}
      <RejectDialog onClose={() => setRejecting(null)} submission={rejecting} />
    </div>
  );
}

function RejectDialog({ submission, onClose }: { submission: KnowledgeSubmissionDto | null; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const invalidate = useInvalidateKnowledge();
  const submit = async () => {
    if (!submission || !note.trim()) return;
    setBusy(true);
    try {
      // undo: intentionally excluded — the coach sees the decision and note; they can suggest again.
      await rejectKnowledge(submission.articleId, { note: note.trim(), versionId: submission.version.id });
      await invalidate();
      toast.success({ title: "Suggestion declined." });
      setNote("");
      onClose();
    } catch (err) {
      toast.error({ message: err instanceof Error ? err.message : undefined, title: "Could not decline it" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={submission !== null}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline this suggestion?</DialogTitle>
          <DialogDescription>The coach sees your note in their suggestions list.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="kb-reject-note">Note to the coach</Label>
          <Textarea id="kb-reject-note" maxLength={1000} onChange={(e) => setNote(e.target.value)} value={note} />
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={busy || !note.trim()} onClick={() => void submit()} variant="destructive">
            {busy && <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />}
            Decline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
