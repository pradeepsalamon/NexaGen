"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  BarChart3,
  Bot,
  Eye,
  FileText,
  FolderTree,
  Inbox,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Upload,
} from "lucide-react";
import {
  KNOWLEDGE_ARTICLE_STATUSES,
  KNOWLEDGE_AUDIENCES,
  type KnowledgeAdminArticleSummary,
  type KnowledgeAdminListQuery,
  type KnowledgeAudience,
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { RowActions } from "@/components/ui/RowActions";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { WidgetError } from "@/components/ui/WidgetError";
import { PageHeader } from "@/components/layout/PageHeader";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { queryKeys } from "@/lib/queryKeys";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { useAuthStore } from "@/stores/authStore";
import { archiveKnowledge, restoreKnowledge } from "../../api/knowledgeApi";
import { useKnowledgeArticles, useKnowledgeSubmissions } from "../../hooks/useKnowledgeApi";
import { KIND_LABEL } from "../HelpCenterClient";
import { AssistantToolsPanel } from "./AssistantToolsPanel";
import { CategoriesPanel } from "./CategoriesPanel";
import { ImportExportPanel } from "./ImportExportPanel";
import { InsightsPanel } from "./InsightsPanel";
import { PreviewPanel } from "./PreviewPanel";
import { SubmissionsPanel } from "./SubmissionsPanel";

export const AUDIENCE_LABEL: Record<KnowledgeAudience, string> = { ADMIN: "Admins", COACH: "Coaches", STUDENT: "Students" };

const TABS = ["articles", "suggestions", "categories", "insights", "preview", "import", "tools"] as const;
type Tab = (typeof TABS)[number];

export function KnowledgeAdminClient() {
  const role = useAuthStore((s) => s.user?.role);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = params.get("tab") as Tab | null;
  const tab: Tab = requested && TABS.includes(requested) && (requested !== "tools" || role === "SUPER_ADMIN") ? requested : "articles";
  const submissions = useKnowledgeSubmissions();
  const pending = submissions.data?.submissions.length ?? 0;

  const setTab = (next: string) => router.replace(next === "articles" ? pathname : `${pathname}?tab=${next}`, { scroll: false });

  return (
    <div>
      <PageHeader
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/help">
                <Eye aria-hidden className="mr-2 size-4" strokeWidth={2.5} />
                Open help centre
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/knowledge/new">
                <Plus aria-hidden className="mr-2 size-4" strokeWidth={2.5} />
                New article
              </Link>
            </Button>
          </>
        }
        description="Everything the help centre (and, later, the AI assistant) can answer from. You decide who sees each article; every change is versioned."
        title="Knowledge base"
      />
      <Tabs onValueChange={setTab} value={tab}>
        <TabsList>
          <TabsTrigger value="articles">
            <FileText aria-hidden className="size-4" />
            Articles
          </TabsTrigger>
          <TabsTrigger value="suggestions">
            <Inbox aria-hidden className="size-4" />
            Coach suggestions
            {pending > 0 && <span className="rounded-full bg-secondary px-1.5 text-xs font-extrabold text-black">{pending}</span>}
          </TabsTrigger>
          <TabsTrigger value="categories">
            <FolderTree aria-hidden className="size-4" />
            Categories
          </TabsTrigger>
          <TabsTrigger value="insights">
            <BarChart3 aria-hidden className="size-4" />
            Questions & feedback
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye aria-hidden className="size-4" />
            Preview as role
          </TabsTrigger>
          <TabsTrigger value="import">
            <Upload aria-hidden className="size-4" />
            Import & export
          </TabsTrigger>
          {role === "SUPER_ADMIN" && (
            <TabsTrigger value="tools">
              <Bot aria-hidden className="size-4" />
              Assistant tools
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="articles">
          <ArticlesPanel />
        </TabsContent>
        <TabsContent value="suggestions">
          <SubmissionsPanel />
        </TabsContent>
        <TabsContent value="categories">
          <CategoriesPanel />
        </TabsContent>
        <TabsContent value="insights">
          <InsightsPanel />
        </TabsContent>
        <TabsContent value="preview">
          <PreviewPanel />
        </TabsContent>
        <TabsContent value="import">
          <ImportExportPanel />
        </TabsContent>
        {role === "SUPER_ADMIN" && (
          <TabsContent value="tools">
            <AssistantToolsPanel />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function ArticlesPanel() {
  const timeZone = useUserTimeZone();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [audience, setAudience] = useState("");
  const [filter, setFilter] = useState<KnowledgeAdminListQuery["filter"]>("all");
  const debounced = useDebouncedValue(q.trim(), 300);
  const list = useKnowledgeArticles({
    audience: (audience || undefined) as KnowledgeAudience | undefined,
    filter,
    q: debounced || undefined,
    status: (status || undefined) as KnowledgeAdminListQuery["status"],
  });
  const archive = useUndoableMutation({
    invalidates: [queryKeys.knowledge.all],
    mutationFn: (a: KnowledgeAdminArticleSummary) => archiveKnowledge(a.id),
    strategy: "immediate",
    toast: (a) => ({ title: `“${a.title}” archived.` }),
    undo: (a) => restoreKnowledge(a.id),
  });
  const restore = useUndoableMutation({
    invalidates: [queryKeys.knowledge.all],
    mutationFn: (a: KnowledgeAdminArticleSummary) => restoreKnowledge(a.id),
    strategy: "immediate",
    toast: (a) => ({ title: `“${a.title}” restored.` }),
    undo: (a) => archiveKnowledge(a.id),
  });

  const counts = list.data?.counts;
  const filterChip = (value: KnowledgeAdminListQuery["filter"], label: string, count?: number) => (
    <button
      aria-pressed={filter === value}
      className={
        filter === value
          ? "min-h-9 rounded-full border border-primary bg-primary px-3 text-sm font-semibold text-white"
          : "min-h-9 rounded-full border border-app-border bg-app-surface px-3 text-sm font-semibold text-app-text hover:border-primary/50"
      }
      onClick={() => setFilter(value)}
      type="button"
    >
      {label}
      {count ? ` (${count})` : ""}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_12rem]">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-app-muted" />
          <Input aria-label="Search articles" className="pl-11" onChange={(e) => setQ(e.target.value)} placeholder="Search by title" value={q} />
        </div>
        <Select
          aria-label="Status"
          onChange={(e) => setStatus(e.target.value)}
          options={KNOWLEDGE_ARTICLE_STATUSES.map((s) => ({ label: s.charAt(0) + s.slice(1).toLowerCase(), value: s }))}
          placeholder="Any status"
          value={status}
        />
        <Select
          aria-label="Audience"
          onChange={(e) => setAudience(e.target.value)}
          options={KNOWLEDGE_AUDIENCES.map((a) => ({ label: `For ${AUDIENCE_LABEL[a].toLowerCase()}`, value: a }))}
          placeholder="Any audience"
          value={audience}
        />
      </div>
      <div aria-label="Quick filters" className="flex flex-wrap gap-2" role="group">
        {filterChip("all", "All")}
        {filterChip("needsReview", "Review due", counts?.needsReview)}
        {filterChip("flagged", "Flagged", counts?.flagged)}
        {filterChip("scheduled", "Scheduled")}
        {filterChip("expired", "Expired")}
      </div>

      {list.isError ? (
        <WidgetError message="Articles could not be loaded." onRetry={() => void list.refetch()} />
      ) : !list.data ? (
        <Skeleton className="h-48" />
      ) : list.data.articles.length === 0 ? (
        <EmptyState
          action={{ label: "Write the first article", onClick: () => router.push("/admin/knowledge/new") }}
          description="Nothing ships pre-loaded: add platform how-tos, navigation help, FAQs, course notes and games here."
          icon={FileText}
          title={filter === "all" && !debounced && !status && !audience ? "The knowledge base is empty" : "No articles match"}
        />
      ) : (
        <ul className="space-y-2">
          {list.data.articles.map((a) => (
            <li key={a.id}>
              <Card className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link className="font-bold hover:text-primary-ink" href={`/admin/knowledge/${a.id}`}>
                      {a.title}
                    </Link>
                    {a.warnings.length > 0 && (
                      <SimpleTooltip label={`Flagged: ${a.warnings.join(", ")}`}>
                        <span aria-label="Flagged" className="text-warning-ink" role="img" tabIndex={0}>
                          <ShieldAlert className="size-4" strokeWidth={2.5} />
                        </span>
                      </SimpleTooltip>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <StatusBadge article={a} />
                    <Badge variant="outline">{KIND_LABEL[a.kind]}</Badge>
                    {a.audience.length ? (
                      a.audience.map((x) => (
                        <Badge key={x} variant="secondary">
                          {AUDIENCE_LABEL[x]}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="warning">No audience</Badge>
                    )}
                    {a.categoryName && <Badge variant="outline">{a.categoryName}</Badge>}
                    {a.language !== "en" && <Badge variant="info">{a.language.toUpperCase()}</Badge>}
                    {a.pendingSubmissions > 0 && <Badge variant="info">{a.pendingSubmissions} suggestion(s)</Badge>}
                    <span className="text-app-muted">
                      {a.publishedVersionNumber ? `v${a.publishedVersionNumber} live` : "never published"}
                      {a.hasDraft ? " · draft open" : ""} · updated {formatFullDate(a.updatedAt, timeZone)}
                      {a.helpful + a.notHelpful > 0 ? ` · 👍 ${a.helpful} 👎 ${a.notHelpful}` : ""}
                    </span>
                  </div>
                </div>
                <RowActions
                  actions={[
                    { icon: Pencil, label: "Edit", ariaLabel: `Edit ${a.title}`, onSelect: () => router.push(`/admin/knowledge/${a.id}`) },
                    a.status === "ARCHIVED"
                      ? { icon: ArchiveRestore, label: "Restore", ariaLabel: `Restore ${a.title}`, onSelect: () => void restore.run(a) }
                      : { icon: Archive, label: "Archive", ariaLabel: `Archive ${a.title}`, onSelect: () => void archive.run(a), tone: "warning" },
                  ]}
                />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StatusBadge({ article }: { article: KnowledgeAdminArticleSummary }) {
  if (article.status === "ARCHIVED") return <Badge variant="secondary">Archived</Badge>;
  if (article.status === "DRAFT") return <Badge variant="secondary">{article.publishedVersionNumber ? "Unpublished" : "Draft"}</Badge>;
  if (article.live) return <Badge variant="success">Live</Badge>;
  const now = Date.now();
  if (article.publishAt && new Date(article.publishAt).getTime() > now) return <Badge variant="info">Scheduled</Badge>;
  if (article.expiresAt && new Date(article.expiresAt).getTime() <= now) return <Badge variant="warning">Expired</Badge>;
  return <Badge variant="warning">Published, not visible</Badge>;
}
