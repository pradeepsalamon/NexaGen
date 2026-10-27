"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Languages, Lightbulb, ThumbsDown, ThumbsUp } from "lucide-react";
import { KNOWLEDGE_SOURCE_LABELS, type KnowledgeHelpArticle } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { usePlanFeature } from "@/features/subscription/hooks/useSubscription";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { canAccessPath } from "@/lib/routeAccess";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useHelpArticle, useHelpFeedback } from "../hooks/useKnowledgeApi";
import { SuggestionDialog } from "./CoachHelpPanels";
import { ArticleCard, KIND_LABEL } from "./HelpCenterClient";
import { KnowledgeMarkdown, PgnViewer } from "./KnowledgeMarkdown";

export function HelpArticleClient({ slug }: { slug: string }) {
  const article = useHelpArticle(slug);
  if (article.isError) {
    const notFound = (article.error as { status?: number } | null)?.status === 404 || /not be found/i.test(String(article.error));
    return notFound ? (
      <EmptyState
        description="It may have been moved, or it isn't meant for your role."
        title="This help article isn't available"
      />
    ) : (
      <WidgetError message="The article could not be loaded." onRetry={() => void article.refetch()} />
    );
  }
  if (!article.data) return <Skeleton className="h-96" />;
  return <ArticleView article={article.data} />;
}

/** Also the admin's "preview as reader" body. */
export function ArticleView({ article, readOnly = false }: { article: KnowledgeHelpArticle; readOnly?: boolean }) {
  const role = useAuthStore((s) => s.user?.role);
  const timeZone = useUserTimeZone();
  const feedback = useHelpFeedback(article.slug);
  const planHasChat = usePlanFeature("directChat") === true;
  const [suggestOpen, setSuggestOpen] = useState(false);
  const askCoachHref = `/messages?new=1&draft=${encodeURIComponent(`Hi! I read “${article.title}” in Help and still have a question:`)}`;

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      {!readOnly && (
        <Link className="inline-flex items-center gap-1.5 text-sm font-semibold text-app-muted hover:text-app-text" href="/help">
          <ArrowLeft aria-hidden className="size-4" />
          Help centre
        </Link>
      )}
      <header className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{KIND_LABEL[article.kind]}</Badge>
          {article.categoryName && <Badge variant="secondary">{article.categoryName}</Badge>}
        </div>
        <h1 className="text-2xl font-extrabold leading-tight">{article.title}</h1>
        {article.summary && <p className="text-app-muted">{article.summary}</p>}
        {article.translations.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Languages aria-hidden className="size-4 text-app-muted" />
            <span className="text-app-muted">Also in:</span>
            {article.translations.map((t) => (
              <Link className="font-semibold text-primary-ink underline underline-offset-2" href={`/help/${t.slug}`} key={t.slug}>
                {t.language.toUpperCase()} · {t.title}
              </Link>
            ))}
          </div>
        )}
      </header>

      {article.kind === "GAME" && article.pgn && <PgnViewer pgn={article.pgn} />}
      {article.kind === "RESOURCE" && article.resourceRef && <ResourceLink article={article} role={role} />}

      <KnowledgeMarkdown role={role} source={article.body} />

      <footer className="space-y-4 border-t border-app-border pt-4 text-sm">
        <p className="text-xs text-app-muted">
          Updated {formatFullDate(article.publishedAt ?? article.updatedAt, timeZone)} · version {article.versionNumber}
          {article.sourceType !== "OWN_WORK" && (
            <>
              {" "}
              · Source: {KNOWLEDGE_SOURCE_LABELS[article.sourceType]}
              {article.sourceNote ? ` — ${article.sourceNote}` : ""}
            </>
          )}
        </p>
        {!readOnly && (
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <span className="font-semibold">Was this helpful?</span>
            <div className="flex flex-wrap items-center gap-2">
              {([true, false] as const).map((helpful) => (
                <Button
                  aria-pressed={article.myFeedback === helpful}
                  className={cn(article.myFeedback === helpful && "border-primary bg-primary/10")}
                  disabled={feedback.isPending}
                  key={String(helpful)}
                  // undo: intentionally excluded — voting again overwrites the vote.
                  onClick={() => feedback.mutate({ helpful, id: article.id })}
                  size="sm"
                  variant="outline"
                >
                  {helpful ? <ThumbsUp aria-hidden className="mr-1.5 size-4" /> : <ThumbsDown aria-hidden className="mr-1.5 size-4" />}
                  {helpful ? "Yes" : "No"}
                </Button>
              ))}
              {role === "STUDENT" && planHasChat && article.myFeedback === false && (
                <Button asChild size="sm">
                  <Link href={askCoachHref}>Ask my coach</Link>
                </Button>
              )}
              {role === "COACH" && (
                <Button onClick={() => setSuggestOpen(true)} size="sm" variant="ghost">
                  <Lightbulb aria-hidden className="mr-1.5 size-4" />
                  Suggest an edit
                </Button>
              )}
            </div>
          </Card>
        )}
        {article.related.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-bold">Related</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {article.related.map((r) => (
                <ArticleCard article={r} key={r.id} />
              ))}
            </div>
          </section>
        )}
      </footer>
      {role === "COACH" && (
        <SuggestionDialog
          articleId={article.id}
          initial={{ body: article.body, summary: article.summary ?? "", title: article.title }}
          onOpenChange={setSuggestOpen}
          open={suggestOpen}
          suggestion={null}
        />
      )}
    </article>
  );
}

function ResourceLink({ article, role }: { article: KnowledgeHelpArticle; role: string | undefined }) {
  const ref = article.resourceRef ?? "";
  const href =
    article.resourceType === "PAGE"
      ? ref
      : article.resourceType === "LIBRARY_GAME"
        ? `/games/${encodeURIComponent(ref)}`
        : article.resourceType === "COURSE"
          ? role === "STUDENT"
            ? "/student/courses"
            : `/admin/courses/${encodeURIComponent(ref)}`
          : role === "COACH"
            ? "/coach/puzzles"
            : role === "STUDENT"
              ? "/student/practice"
              : `/admin/puzzles`;
  if (!href.startsWith("/") || !canAccessPath(href.split(/[?#]/)[0], role)) return null;
  return (
    <Button asChild>
      <Link href={href}>
        <ExternalLink aria-hidden className="mr-2 size-4" strokeWidth={2.5} />
        Open
      </Link>
    </Button>
  );
}
