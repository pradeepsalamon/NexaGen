"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  CircleHelp,
  FileText,
  Lightbulb,
  Link2,
  LifeBuoy,
  MessageCircleQuestion,
  Search,
  Settings2,
  Swords,
  TrendingUp,
} from "lucide-react";
import type { KnowledgeArticleKind, KnowledgeHelpArticleSummary } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { WidgetError } from "@/components/ui/WidgetError";
import { PageHeader } from "@/components/layout/PageHeader";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePlanFeature } from "@/features/subscription/hooks/useSubscription";
import { cn } from "@/lib/utils";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useHelp } from "../hooks/useKnowledgeApi";
import { CoachSuggestionsPanel, CoachTrendsPanel } from "./CoachHelpPanels";

export const KIND_ICON: Record<KnowledgeArticleKind, typeof FileText> = {
  ARTICLE: FileText,
  FAQ: CircleHelp,
  GAME: Swords,
  RESOURCE: Link2,
};

export const KIND_LABEL: Record<KnowledgeArticleKind, string> = {
  ARTICLE: "Article",
  FAQ: "FAQ",
  GAME: "Game",
  RESOURCE: "Link",
};

/** The page the reader opened help from (`?from=`), if it is a real app path. */
function useFromRoute(): string | undefined {
  const from = useSearchParams().get("from") ?? undefined;
  return from && /^\/[A-Za-z0-9\-/_]*$/.test(from) && !from.startsWith("/help") ? from : undefined;
}

export function HelpCenterClient() {
  const role = useAuthStore((s) => s.user?.role);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isCoach = role === "COACH";
  const tab = params.get("tab") ?? "help";

  const setTab = (next: string) => {
    const search = new URLSearchParams(params.toString());
    if (next === "help") search.delete("tab");
    else search.set("tab", next);
    router.replace(`${pathname}${search.size ? `?${search}` : ""}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          isStaffRole(role) ? (
            <Button asChild variant="outline">
              <Link href="/admin/knowledge">
                <Settings2 aria-hidden className="mr-2 size-4" strokeWidth={2.5} />
                Manage knowledge base
              </Link>
            </Button>
          ) : undefined
        }
        description="How the platform works, how to find your way around, and answers to common questions."
        title="Help centre"
      />
      {isCoach ? (
        <Tabs onValueChange={setTab} value={tab}>
          <TabsList>
            <TabsTrigger value="help">
              <LifeBuoy aria-hidden className="size-4" />
              Help articles
            </TabsTrigger>
            <TabsTrigger value="suggest">
              <Lightbulb aria-hidden className="size-4" />
              My suggestions
            </TabsTrigger>
            <TabsTrigger value="trends">
              <TrendingUp aria-hidden className="size-4" />
              What students ask
            </TabsTrigger>
          </TabsList>
          <TabsContent value="help">
            <HelpBrowser />
          </TabsContent>
          <TabsContent value="suggest">
            <CoachSuggestionsPanel />
          </TabsContent>
          <TabsContent value="trends">
            <CoachTrendsPanel />
          </TabsContent>
        </Tabs>
      ) : (
        <HelpBrowser />
      )}
    </div>
  );
}

function HelpBrowser() {
  const role = useAuthStore((s) => s.user?.role);
  const route = useFromRoute();
  const initialQ = useSearchParams().get("q") ?? "";
  const [q, setQ] = useState(initialQ);
  const debounced = useDebouncedValue(q.trim(), 450);
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  // One- and two-letter searches are noise (and would fill the admins' inbox).
  const searchQ = debounced.length >= 3 ? debounced : undefined;
  const help = useHelp({ categoryId: searchQ ? undefined : categoryId, q: searchQ, route });
  const planHasChat = usePlanFeature("directChat") === true;

  const data = help.data;
  const grouped = useMemo(() => {
    if (!data || data.searched) return [];
    const byCategory = new Map<string, { name: string; items: KnowledgeHelpArticleSummary[] }>();
    for (const a of data.articles) {
      const key = a.categoryId ?? "";
      const entry = byCategory.get(key) ?? { items: [], name: a.categoryName ?? "General" };
      entry.items.push(a);
      byCategory.set(key, entry);
    }
    return [...byCategory.values()];
  }, [data]);

  useEffect(() => {
    if (searchQ) setCategoryId(undefined);
  }, [searchQ]);

  const askCoachHref = `/messages?new=1&draft=${encodeURIComponent(q.trim() ? `Hi! I have a question: ${q.trim()}` : "")}`;

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-app-muted" />
        <Input
          aria-label="Search help"
          className="pl-11"
          maxLength={200}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search help — e.g. how do I join a class?"
          value={q}
        />
      </div>

      {data && !searchQ && data.categories.length > 0 && (
        <div aria-label="Categories" className="flex flex-wrap gap-2" role="group">
          <CategoryChip active={!categoryId} label="All" onClick={() => setCategoryId(undefined)} />
          {data.categories.map((c) => (
            <CategoryChip
              active={categoryId === c.id}
              key={c.id}
              label={`${c.name} (${c.articleCount})`}
              onClick={() => setCategoryId(c.id)}
            />
          ))}
        </div>
      )}

      {data && data.forThisPage.length > 0 && !searchQ && (
        <section aria-labelledby="help-this-page" className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-app-muted" id="help-this-page">
            Help for the page you were on
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {data.forThisPage.map((a) => (
              <ArticleCard article={a} key={a.id} />
            ))}
          </div>
        </section>
      )}

      {help.isError ? (
        <WidgetError message="Help could not be loaded." onRetry={() => void help.refetch()} />
      ) : !data ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton className="h-24" key={i} />
          ))}
        </div>
      ) : data.searched ? (
        data.articles.length ? (
          <section aria-label="Search results" className="space-y-3">
            {data.articles.map((a) => (
              <ArticleCard article={a} key={a.id} />
            ))}
            <AskCoachHint href={askCoachHref} show={role === "STUDENT" && planHasChat} />
          </section>
        ) : (
          <Card className="space-y-4 p-6 text-center">
            <MessageCircleQuestion aria-hidden className="mx-auto size-10 text-app-muted" />
            <div>
              <p className="font-bold">No article answers that yet.</p>
              <p className="mt-1 text-sm text-app-muted">
                Your question has been passed to the academy team so they can write one.
              </p>
            </div>
            {role === "STUDENT" && planHasChat && (
              <Button asChild>
                <Link href={askCoachHref}>Ask my coach</Link>
              </Button>
            )}
          </Card>
        )
      ) : data.articles.length === 0 ? (
        <EmptyState
          description="The academy hasn't published any help for you yet. Check back soon."
          icon={BookOpen}
          title="Nothing here yet"
        />
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <section className="space-y-3" key={group.name}>
              <h2 className="text-base font-bold">{group.name}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {group.items.map((a) => (
                  <ArticleCard article={a} key={a.id} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "min-h-9 rounded-full border px-4 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus",
        active ? "border-primary bg-primary text-white" : "border-app-border bg-app-surface text-app-text hover:border-primary/50",
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function AskCoachHint({ href, show }: { href: string; show: boolean }) {
  if (!show) return null;
  return (
    <p className="pt-2 text-center text-sm text-app-muted">
      Still stuck?{" "}
      <Link className="font-semibold text-primary-ink underline underline-offset-2" href={href}>
        Ask my coach
      </Link>
    </p>
  );
}

export function ArticleCard({ article, hrefBase = "/help" }: { article: KnowledgeHelpArticleSummary; hrefBase?: string }) {
  const Icon = KIND_ICON[article.kind];
  return (
    <Link
      className="group block rounded-panel border border-app-border bg-app-surface p-4 shadow-card transition hover:border-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
      href={`${hrefBase}/${article.slug}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary-ink">
          <Icon aria-hidden className="size-4" strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-app-text group-hover:text-primary-ink">{article.title}</p>
          {(article.snippet || article.summary) && (
            <p className="mt-1 line-clamp-2 text-sm text-app-muted">{article.snippet ?? article.summary}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="outline">{KIND_LABEL[article.kind]}</Badge>
            {article.categoryName && <Badge variant="secondary">{article.categoryName}</Badge>}
            {article.language !== "en" && <Badge variant="info">{article.language.toUpperCase()}</Badge>}
            {article.forThisPage && <Badge variant="success">This page</Badge>}
          </div>
        </div>
      </div>
    </Link>
  );
}
