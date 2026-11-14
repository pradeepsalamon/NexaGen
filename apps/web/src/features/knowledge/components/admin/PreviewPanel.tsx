"use client";

import { useState } from "react";
import { Eye, Search } from "lucide-react";
import { KNOWLEDGE_AUDIENCES, type KnowledgeAudience } from "@nexa-chess/types";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useBatchesQuery } from "@/features/batches/hooks/useBatchesApi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useHelpPreview } from "../../hooks/useKnowledgeApi";
import { ArticleCard } from "../HelpCenterClient";
import { AUDIENCE_LABEL } from "./KnowledgeAdminClient";

/**
 * The help centre exactly as a role (optionally a member of one batch) sees
 * it, with a test search. Uses the API's own visibility rule; nothing is logged.
 */
export function PreviewPanel() {
  const [asRole, setAsRole] = useState<KnowledgeAudience>("STUDENT");
  const [batchId, setBatchId] = useState("");
  const [q, setQ] = useState("");
  const [route, setRoute] = useState("");
  const debounced = useDebouncedValue(q.trim(), 350);
  const batches = useBatchesQuery({ pageSize: 100 });
  const preview = useHelpPreview({
    asRole,
    batchId: batchId || undefined,
    q: debounced || undefined,
    route: /^\/[A-Za-z0-9\-/_]*$/.test(route) ? route : undefined,
  });
  const batchOptions = (batches.data?.batches ?? []).map((b) => ({ label: b.name, value: b.id }));

  return (
    <div className="space-y-4">
      <Card className="grid gap-3 p-4 md:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="kb-preview-role">See it as</Label>
          <Select
            id="kb-preview-role"
            onChange={(e) => setAsRole(e.target.value as KnowledgeAudience)}
            options={KNOWLEDGE_AUDIENCES.map((a) => ({ label: AUDIENCE_LABEL[a].replace(/s$/, ""), value: a }))}
            value={asRole}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="kb-preview-batch">In batch</Label>
          <Select
            disabled={asRole === "ADMIN"}
            id="kb-preview-batch"
            onChange={(e) => setBatchId(e.target.value)}
            options={batchOptions}
            placeholder="No batch (unscoped only)"
            value={batchId}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="kb-preview-route">On page</Label>
          <Input id="kb-preview-route" onChange={(e) => setRoute(e.target.value)} placeholder="/student/practice" value={route} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="kb-preview-q">Test a search</Label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-app-muted" />
            <Input className="pl-11" id="kb-preview-q" onChange={(e) => setQ(e.target.value)} value={q} />
          </div>
        </div>
      </Card>
      {preview.isError ? (
        <WidgetError message="Preview could not be loaded." onRetry={() => void preview.refetch()} />
      ) : !preview.data ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="space-y-4">
          {preview.data.forThisPage.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-app-muted">Help for that page</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {preview.data.forThisPage.map((a) => (
                  <ArticleCard article={a} hrefBase="/help" key={a.id} />
                ))}
              </div>
            </section>
          )}
          {preview.data.articles.length === 0 ? (
            <EmptyState description="Nothing published is visible to this role here." icon={Eye} title="They would see nothing" variant="inline" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {preview.data.articles.map((a) => (
                <ArticleCard article={a} key={a.id} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
