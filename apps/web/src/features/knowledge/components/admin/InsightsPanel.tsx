"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, FilePlus2, Search, SearchX, X } from "lucide-react";
import type { KnowledgeQueryInsight } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { RowActions } from "@/components/ui/RowActions";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/StatTile";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { queryKeys } from "@/lib/queryKeys";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { resolveKnowledgeQuery } from "../../api/knowledgeApi";
import { useKnowledgeInsights } from "../../hooks/useKnowledgeApi";
import { AUDIENCE_LABEL } from "./KnowledgeAdminClient";

/** The unanswered-questions inbox, most searched, and articles readers found unhelpful. */
export function InsightsPanel() {
  const insights = useKnowledgeInsights();
  const timeZone = useUserTimeZone();
  const router = useRouter();
  const dismiss = useUndoableMutation({
    invalidates: [queryKeys.knowledge.admin.insights],
    mutationFn: (q: KnowledgeQueryInsight) => resolveKnowledgeQuery({ query: q.query, resolution: "DISMISSED" }),
    strategy: "defer",
    toast: (q) => ({ title: `“${q.query}” dismissed.` }),
    undo: async () => undefined,
  });

  if (insights.isError) return <WidgetError message="Insights could not be loaded." onRetry={() => void insights.refetch()} />;
  if (!insights.data) return <Skeleton className="h-64" />;
  const d = insights.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile context={`Last ${d.days} days`} icon={Search} label="Help searches" tone="primary" value={String(d.totals.searches)} />
        <StatTile context={`Last ${d.days} days`} icon={SearchX} label="Found nothing" tone="secondary" value={String(d.totals.unanswered)} />
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-bold">Unanswered questions</h2>
        <p className="text-sm text-app-muted">
          Searches that found no article. Write one (the question becomes its title), or dismiss noise. Searches are kept 90 days and carry no names.
        </p>
        {d.unanswered.length === 0 ? (
          <EmptyState description="Every search found something. Nice." icon={BarChart3} title="Nothing unanswered" variant="inline" />
        ) : (
          <ul className="space-y-2">
            {d.unanswered.map((q) => (
              <li key={q.query}>
                <Card className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{q.query}</p>
                    <p className="text-xs text-app-muted">
                      {q.count}× · last {formatFullDate(q.lastAskedAt, timeZone)} · {q.roles.map((r) => AUDIENCE_LABEL[r]).join(", ")}
                    </p>
                  </div>
                  <RowActions
                    actions={[
                      {
                        ariaLabel: `Write an article for “${q.query}”`,
                        icon: FilePlus2,
                        label: "Write an article",
                        onSelect: () =>
                          router.push(`/admin/knowledge/new?question=${encodeURIComponent(q.query)}&audience=${q.roles.join(",")}`),
                      },
                      { ariaLabel: `Dismiss “${q.query}”`, icon: X, label: "Dismiss", onSelect: () => void dismiss.run(q), tone: "danger" },
                    ]}
                  />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-base font-bold">Most searched</h2>
          {d.topQueries.length === 0 ? (
            <p className="text-sm text-app-muted">No searches yet.</p>
          ) : (
            <ol className="space-y-1.5">
              {d.topQueries.map((q) => (
                <li className="flex items-center justify-between gap-3 text-sm" key={q.query}>
                  <span className="min-w-0 truncate">{q.query}</span>
                  <Badge variant="secondary">{q.count}×</Badge>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="space-y-3">
          <h2 className="text-base font-bold">Marked not helpful</h2>
          {d.notHelpful.length === 0 ? (
            <p className="text-sm text-app-muted">No article has a “not helpful” vote.</p>
          ) : (
            <ol className="space-y-1.5">
              {d.notHelpful.map((a) => (
                <li className="flex items-center justify-between gap-3 text-sm" key={a.id}>
                  <Link className="min-w-0 truncate font-semibold hover:text-primary-ink" href={`/admin/knowledge/${a.id}`}>
                    {a.title}
                  </Link>
                  <span className="shrink-0 text-app-muted">
                    👍 {a.helpful} · 👎 {a.notHelpful}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
