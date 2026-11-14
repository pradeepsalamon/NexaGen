"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  EyeOff,
  History,
  Loader2,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  KNOWLEDGE_ARTICLE_KINDS,
  KNOWLEDGE_AUDIENCES,
  KNOWLEDGE_SOURCE_LABELS,
  KNOWLEDGE_SOURCE_TYPES,
  KNOWLEDGE_WARNING_LABELS,
  detectKnowledgeWarnings,
  type KnowledgeAdminArticleDetail,
  type KnowledgeArticleKind,
  type KnowledgeAudience,
  type KnowledgeEventType,
  type KnowledgeSourceType,
  type KnowledgeVersionDto,
  type KnowledgeVersionStatus,
} from "@nexa-chess/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/AlertDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { DatePicker } from "@/components/ui/DatePicker";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { useBatchesQuery } from "@/features/batches/hooks/useBatchesApi";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { queryKeys } from "@/lib/queryKeys";
import { canAccessPath } from "@/lib/routeAccess";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/ToastProvider";
import { useAuthStore } from "@/stores/authStore";
import * as api from "../../api/knowledgeApi";
import {
  useInvalidateKnowledge,
  useKnowledgeArticle,
  useKnowledgeArticles,
  useKnowledgeCategories,
  useKnowledgeDiff,
  useKnowledgeSubmissions,
} from "../../hooks/useKnowledgeApi";
import { internalLinks } from "../../lib/markdown";
import { ContentEditor, EMPTY_CONTENT, contentPayload, type ContentDraft } from "../ContentEditor";
import { KIND_LABEL } from "../HelpCenterClient";
import { KnowledgeMarkdown } from "../KnowledgeMarkdown";
import { AUDIENCE_LABEL, StatusBadge } from "./KnowledgeAdminClient";

type SettingsDraft = {
  kind: KnowledgeArticleKind;
  categoryId: string;
  audience: KnowledgeAudience[];
  batchIds: string[];
  routeTags: string;
  language: string;
  translationOfId: string;
  sourceType: KnowledgeSourceType;
  sourceNote: string;
  publishAt: Date | undefined;
  expiresAt: Date | undefined;
  reviewBy: Date | undefined;
};

const EMPTY_SETTINGS: SettingsDraft = {
  audience: [],
  batchIds: [],
  categoryId: "",
  expiresAt: undefined,
  kind: "ARTICLE",
  language: "en",
  publishAt: undefined,
  reviewBy: undefined,
  routeTags: "",
  sourceNote: "",
  sourceType: "OWN_WORK",
  translationOfId: "",
};

const VERSION_STATUS: Record<KnowledgeVersionStatus, { label: string; variant: "success" | "secondary" | "info" | "destructive" }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  PUBLISHED: { label: "Live", variant: "success" },
  REJECTED: { label: "Declined", variant: "destructive" },
  SUBMITTED: { label: "Coach suggestion", variant: "info" },
  SUPERSEDED: { label: "Replaced", variant: "secondary" },
};

const EVENT_LABEL: Record<KnowledgeEventType, string> = {
  ARCHIVED: "Archived",
  CREATED: "Created",
  DRAFT_SAVED: "Draft saved",
  PUBLISHED: "Published",
  REJECTED: "Suggestion declined",
  RESTORED: "Restored",
  ROLLED_BACK: "Rolled back",
  SETTINGS_CHANGED: "Settings changed",
  SUBMITTED: "Suggestion received",
  UNPUBLISHED: "Unpublished",
};

const ROLE_FOR_AUDIENCE: Record<KnowledgeAudience, string> = { ADMIN: "ADMIN", COACH: "COACH", STUDENT: "STUDENT" };

function contentFrom(v: KnowledgeVersionDto | null): ContentDraft {
  if (!v) return EMPTY_CONTENT;
  return {
    body: v.body,
    changeNote: "",
    pgn: v.pgn ?? "",
    resourceRef: v.resourceRef ?? "",
    resourceType: v.resourceType ?? "",
    summary: v.summary ?? "",
    title: v.title,
  };
}

function settingsFrom(a: KnowledgeAdminArticleDetail): SettingsDraft {
  return {
    audience: a.audience,
    batchIds: a.batchIds,
    categoryId: a.categoryId ?? "",
    expiresAt: a.expiresAt ? new Date(a.expiresAt) : undefined,
    kind: a.kind,
    language: a.language,
    publishAt: a.publishAt ? new Date(a.publishAt) : undefined,
    reviewBy: a.reviewBy ? new Date(a.reviewBy) : undefined,
    routeTags: a.routeTags.join(", "),
    sourceNote: a.sourceNote ?? "",
    sourceType: a.sourceType,
    translationOfId: a.translations[0]?.id ?? "",
  };
}

function settingsPayload(s: SettingsDraft) {
  return {
    audience: s.audience,
    batchIds: s.batchIds,
    categoryId: s.categoryId || null,
    expiresAt: s.expiresAt?.toISOString() ?? null,
    kind: s.kind,
    language: s.language.trim() || "en",
    publishAt: s.publishAt?.toISOString() ?? null,
    reviewBy: s.reviewBy?.toISOString() ?? null,
    routeTags: s.routeTags
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean),
    sourceNote: s.sourceNote.trim() || null,
    sourceType: s.sourceType,
    translationOfId: s.translationOfId || null,
  };
}

export function KnowledgeArticleEditorClient({ id }: { id: string | null }) {
  const detail = useKnowledgeArticle(id);
  if (id && detail.isError) return <WidgetError message="The article could not be loaded." onRetry={() => void detail.refetch()} />;
  if (id && !detail.data) return <Skeleton className="h-[600px]" />;
  return <Editor article={detail.data ?? null} key={detail.data?.id ?? "new"} />;
}

function Editor({ article }: { article: KnowledgeAdminArticleDetail | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const timeZone = useUserTimeZone();
  const role = useAuthStore((s) => s.user?.role);
  const invalidate = useInvalidateKnowledge();
  const reviewId = params.get("review");
  const submissions = useKnowledgeSubmissions();
  const reviewVersion = submissions.data?.submissions.find((sub) => sub.version.id === reviewId && sub.articleId === article?.id)?.version ?? null;

  const [content, setContent] = useState<ContentDraft>(() => {
    if (article) return contentFrom(article.draft ?? article.published);
    const question = params.get("question");
    return question ? { ...EMPTY_CONTENT, title: question.charAt(0).toUpperCase() + question.slice(1) } : EMPTY_CONTENT;
  });
  const [settings, setSettings] = useState<SettingsDraft>(() => {
    if (article) return settingsFrom(article);
    const audience = (params.get("audience") ?? "").split(",").filter((a): a is KnowledgeAudience => (KNOWLEDGE_AUDIENCES as readonly string[]).includes(a));
    return { ...EMPTY_SETTINGS, audience, kind: params.get("question") ? "FAQ" : "ARTICLE" };
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [ackOpen, setAckOpen] = useState<{ versionId?: string } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const categories = useKnowledgeCategories();
  const batches = useBatchesQuery({ pageSize: 100 });
  const others = useKnowledgeArticles({});

  // A freshly saved draft resets "what changed".
  const baseline = useMemo(() => JSON.stringify(contentFrom(article?.draft ?? article?.published ?? null)), [article]);
  const contentDirty = JSON.stringify({ ...content, changeNote: "" }) !== baseline || !!content.changeNote;
  const settingsBaseline = useMemo(() => (article ? JSON.stringify(settingsPayload(settingsFrom(article))) : ""), [article]);
  const settingsDirty = !!article && JSON.stringify(settingsPayload(settings)) !== settingsBaseline;

  const unreachableLinks = useMemo(() => {
    const links = internalLinks(content.body);
    return links.filter((href) => settings.audience.some((a) => !canAccessPath(href, ROLE_FOR_AUDIENCE[a])));
  }, [content.body, settings.audience]);

  const flagged = article?.draft?.warnings ?? article?.published?.warnings ?? [];

  async function act<T>(label: string, fn: () => Promise<T>, success?: string): Promise<T | undefined> {
    setBusy(label);
    try {
      const result = await fn();
      await invalidate();
      if (success) toast.success({ title: success });
      return result;
    } catch (err) {
      toast.error({ message: err instanceof Error ? err.message : undefined, title: `Could not ${label}` });
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  const create = async () => {
    if (!content.title.trim()) return toast.error({ title: "Give it a title first." });
    // undo: intentionally excluded — a new article is a draft nobody can see; archive or delete it from the list.
    const created = await act("create the article", () => api.createKnowledgeArticle({ content: contentPayload(content), settings: settingsPayload(settings) }), "Draft created.");
    if (created) router.replace(`/admin/knowledge/${created.id}`);
  };

  // undo: intentionally excluded (save draft / settings / publish) — editor Save buttons; every content
  // change is a version and every settings change is in the history, so rollback is the correction.
  const saveDraft = () => article && act("save the draft", () => api.saveKnowledgeDraft(article.id, contentPayload(content)), "Draft saved.");
  const saveSettings = () => article && act("save the settings", () => api.updateKnowledgeSettings(article.id, settingsPayload(settings)), "Settings saved.");

  const publish = async (requestedVersionId?: string, acknowledgeWarnings = false) => {
    if (!article) return;
    // "Republish": unpublished, nothing new to publish — make the last published version live again.
    const republish = article.status === "DRAFT" && !!article.published && !article.draft && !contentDirty;
    const versionId = requestedVersionId ?? (republish ? article.published?.id : undefined);
    if (settingsDirty) {
      const saved = await act("save the settings", () => api.updateKnowledgeSettings(article.id, settingsPayload(settings)));
      if (!saved) return;
    }
    if (!versionId && contentDirty) {
      const saved = await act("save the draft", () => api.saveKnowledgeDraft(article.id, contentPayload(content)));
      if (!saved) return;
    }
    const pendingWarnings = versionId
      ? (article.versions.find((v) => v.id === versionId)?.warnings ?? [])
      : detectKnowledgeWarnings({ ...contentPayload(content), sourceNote: settings.sourceNote, sourceType: settings.sourceType });
    if (pendingWarnings.some((w) => w !== "missing-credit") && !acknowledgeWarnings) {
      setAckOpen({ versionId });
      return;
    }
    const done = await act("publish", () => api.publishKnowledge(article.id, { acknowledgeWarnings, changeNote: content.changeNote || null, versionId }), "Published.");
    if (done && versionId) router.replace(`/admin/knowledge/${article.id}`);
  };

  const unpublish = useUndoableMutation({
    invalidates: [queryKeys.knowledge.all],
    mutationFn: (a: KnowledgeAdminArticleDetail) => api.unpublishKnowledge(a.id),
    strategy: "immediate",
    toast: () => ({ message: "Readers can no longer see it.", title: "Unpublished." }),
    undo: (a) => api.publishKnowledge(a.id, { versionId: a.published?.id }),
  });
  const archive = useUndoableMutation({
    invalidates: [queryKeys.knowledge.all],
    mutationFn: (a: KnowledgeAdminArticleDetail) => api.archiveKnowledge(a.id),
    strategy: "immediate",
    toast: () => ({ title: "Archived." }),
    undo: (a) => api.restoreKnowledge(a.id),
  });
  const restore = useUndoableMutation({
    invalidates: [queryKeys.knowledge.all],
    mutationFn: (a: KnowledgeAdminArticleDetail) => api.restoreKnowledge(a.id),
    strategy: "immediate",
    toast: () => ({ title: "Restored." }),
    undo: (a) => api.archiveKnowledge(a.id),
  });

  const discardDraft = () =>
    article &&
    // undo: intentionally excluded — discarding is itself the "undo" of unsaved edits; the live version is untouched.
    act("discard the draft", () => api.discardKnowledgeDraft(article.id), "Draft discarded.").then((d) => d && setContent(contentFrom(d.published)));

  const remove = async () => {
    if (!article) return;
    // undo: intentionally excluded — permanent delete (super admin); archive is the reversible option.
    const ok = await act("delete the article", () => api.deleteKnowledgeArticle(article.id), "Article deleted permanently.");
    if (ok) router.replace("/admin/knowledge");
  };

  const toggleAudience = (a: KnowledgeAudience, on: boolean) =>
    setSettings((s) => ({ ...s, audience: on ? [...new Set([...s.audience, a])] : s.audience.filter((x) => x !== a) }));
  const toggleBatch = (b: string, on: boolean) =>
    setSettings((s) => ({ ...s, batchIds: on ? [...new Set([...s.batchIds, b])] : s.batchIds.filter((x) => x !== b) }));

  const previewRole = settings.audience.includes("STUDENT") ? "STUDENT" : settings.audience.includes("COACH") ? "COACH" : "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <Link className="inline-flex items-center gap-1.5 text-sm font-semibold text-app-muted hover:text-app-text" href="/admin/knowledge">
            <ArrowLeft aria-hidden className="size-4" />
            Knowledge base
          </Link>
          <h1 className="text-2xl font-extrabold leading-tight">{article ? content.title || article.title : "New article"}</h1>
          {article && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <StatusBadge article={article} />
              <span className="text-app-muted">
                {article.publishedVersionNumber ? `v${article.publishedVersionNumber} live` : "Never published"}
                {article.draft ? ` · draft v${article.draft.number} open` : ""}
              </span>
              {article.live && (
                <Link className="font-semibold text-primary-ink underline underline-offset-2" href={`/help/${article.slug}`}>
                  View in help centre
                </Link>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!article ? (
            <Button disabled={busy !== null} onClick={() => void create()}>
              {busy ? <Loader2 aria-hidden className="mr-2 size-4 animate-spin" /> : <Save aria-hidden className="mr-2 size-4" strokeWidth={2.5} />}
              Create draft
            </Button>
          ) : (
            <>
              {article.draft && (
                <SimpleTooltip label="Discard the open draft">
                  <Button aria-label="Discard draft" className="rounded-full" disabled={busy !== null || !article.published} onClick={() => void discardDraft()} size="icon" variant="outline">
                    <Undo2 className="size-4" strokeWidth={2.5} />
                  </Button>
                </SimpleTooltip>
              )}
              <Button disabled={busy !== null || !contentDirty} onClick={() => void saveDraft()} variant="outline">
                <Save aria-hidden className="mr-2 size-4" strokeWidth={2.5} />
                Save draft
              </Button>
              <Button disabled={busy !== null || (!article.draft && !contentDirty && !settingsDirty && article.status === "PUBLISHED")} onClick={() => void publish()}>
                {busy === "publish" ? <Loader2 aria-hidden className="mr-2 size-4 animate-spin" /> : <Send aria-hidden className="mr-2 size-4" strokeWidth={2.5} />}
                {article.status === "DRAFT" && article.published && !article.draft && !contentDirty ? "Republish" : "Publish"}
              </Button>
              {article.status === "PUBLISHED" && (
                <SimpleTooltip label="Unpublish (hide from readers)">
                  <Button aria-label="Unpublish" className="rounded-full" disabled={busy !== null} onClick={() => void unpublish.run(article)} size="icon" variant="outline">
                    <EyeOff className="size-4" strokeWidth={2.5} />
                  </Button>
                </SimpleTooltip>
              )}
              {article.status === "ARCHIVED" ? (
                <SimpleTooltip label="Restore">
                  <Button aria-label="Restore" className="rounded-full" onClick={() => void restore.run(article)} size="icon" variant="outline">
                    <ArchiveRestore className="size-4" strokeWidth={2.5} />
                  </Button>
                </SimpleTooltip>
              ) : (
                <SimpleTooltip label="Archive">
                  <Button aria-label="Archive" className="rounded-full" onClick={() => void archive.run(article)} size="icon" variant="outline">
                    <Archive className="size-4" strokeWidth={2.5} />
                  </Button>
                </SimpleTooltip>
              )}
              {role === "SUPER_ADMIN" && (
                <SimpleTooltip label="Delete permanently">
                  <Button
                    aria-label="Delete permanently"
                    className="rounded-full bg-app-danger text-white hover:bg-app-danger/85"
                    onClick={() => setDeleteOpen(true)}
                    size="icon"
                    variant="ghost"
                  >
                    <Trash2 className="size-4" strokeWidth={2.5} />
                  </Button>
                </SimpleTooltip>
              )}
            </>
          )}
        </div>
      </div>

      {reviewVersion && article && (
        <Card className="space-y-3 border-info/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold">
              Coach suggestion v{reviewVersion.number} by {reviewVersion.author?.name ?? "a coach"}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setContent(contentFrom(reviewVersion))} size="sm" variant="outline">
                Load into the editor
              </Button>
              <Button disabled={busy !== null || !settings.audience.length} onClick={() => void publish(reviewVersion.id)} size="sm">
                Publish as is
              </Button>
            </div>
          </div>
          {!settings.audience.length && <p className="text-sm text-warning-ink">Choose who it is for (Settings) before publishing.</p>}
          <SuggestionBody article={article} version={reviewVersion} />
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Card className="min-w-0 p-4 sm:p-5">
          <ContentEditor kind={settings.kind} onChange={setContent} previewRole={previewRole} showChangeNote={!!article} value={content} />
        </Card>

        <div className="min-w-0 space-y-4">
          {(flagged.length > 0 || unreachableLinks.length > 0) && (
            <Card className="space-y-2 border-warning/40 p-4 text-sm">
              <p className="flex items-center gap-2 font-bold text-warning-ink">
                <ShieldAlert aria-hidden className="size-4" strokeWidth={2.5} />
                Check before publishing
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {flagged.map((w) => (
                  <li key={w}>{KNOWLEDGE_WARNING_LABELS[w] ?? w}</li>
                ))}
                {unreachableLinks.map((href) => (
                  <li key={href}>
                    <code>{href}</code> can&apos;t be opened by everyone in the audience (it shows as plain text for them)
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold">Settings</h2>
              {article && (
                <Button disabled={busy !== null || !settingsDirty} onClick={() => void saveSettings()} size="sm" variant="outline">
                  Save settings
                </Button>
              )}
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Who can read it</legend>
              {KNOWLEDGE_AUDIENCES.map((a) => (
                <label className="flex items-center gap-2 text-sm" key={a}>
                  <Checkbox checked={settings.audience.includes(a)} onCheckedChange={(v) => toggleAudience(a, v === true)} />
                  {AUDIENCE_LABEL[a]}
                </label>
              ))}
              {!settings.audience.length && <p className="text-xs text-warning-ink">Nobody yet — it can&apos;t be published until you pick a role.</p>}
            </fieldset>

            {(settings.audience.includes("STUDENT") || settings.audience.includes("COACH")) && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">Only these batches (optional)</legend>
                <p className="text-xs text-app-muted">Leave empty for everyone in the roles above. Admins always see it.</p>
                <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-control border border-app-border p-2">
                  {(batches.data?.batches ?? []).map((b) => (
                    <label className="flex items-center gap-2 text-sm" key={b.id}>
                      <Checkbox checked={settings.batchIds.includes(b.id)} onCheckedChange={(v) => toggleBatch(b.id, v === true)} />
                      <span className="truncate">{b.name}</span>
                    </label>
                  ))}
                  {batches.data && !batches.data.batches.length && <p className="text-xs text-app-muted">No batches.</p>}
                </div>
              </fieldset>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="space-y-1.5">
                <Label htmlFor="kb-kind">Type</Label>
                <Select
                  id="kb-kind"
                  onChange={(e) => setSettings((s) => ({ ...s, kind: e.target.value as KnowledgeArticleKind }))}
                  options={KNOWLEDGE_ARTICLE_KINDS.map((k) => ({ label: KIND_LABEL[k], value: k }))}
                  value={settings.kind}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kb-category">Category</Label>
                <Select
                  id="kb-category"
                  onChange={(e) => setSettings((s) => ({ ...s, categoryId: e.target.value }))}
                  options={(categories.data?.categories ?? []).filter((c) => !c.archived || c.id === settings.categoryId).map((c) => ({ label: c.name, value: c.id }))}
                  placeholder="None"
                  value={settings.categoryId}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="kb-routes">Show on pages (page-aware help)</Label>
              <Input
                id="kb-routes"
                onChange={(e) => setSettings((s) => ({ ...s, routeTags: e.target.value }))}
                placeholder="/student/practice, /coach/schedule"
                value={settings.routeTags}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="space-y-1.5">
                <Label htmlFor="kb-language">Language code</Label>
                <Input id="kb-language" maxLength={12} onChange={(e) => setSettings((s) => ({ ...s, language: e.target.value }))} placeholder="en, ta, hi" value={settings.language} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kb-translation">Translation of</Label>
                <Select
                  id="kb-translation"
                  onChange={(e) => setSettings((s) => ({ ...s, translationOfId: e.target.value }))}
                  options={(others.data?.articles ?? []).filter((o) => o.id !== article?.id).map((o) => ({ label: `${o.title} (${o.language})`, value: o.id }))}
                  placeholder="Not a translation"
                  value={settings.translationOfId}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="kb-source">Source / licence</Label>
              <Select
                id="kb-source"
                onChange={(e) => setSettings((s) => ({ ...s, sourceType: e.target.value as KnowledgeSourceType }))}
                options={KNOWLEDGE_SOURCE_TYPES.map((t) => ({ label: KNOWLEDGE_SOURCE_LABELS[t], value: t }))}
                value={settings.sourceType}
              />
              {(settings.sourceType === "CC_BY" || settings.sourceType === "PERMISSION" || settings.sourceType === "PUBLIC_DOMAIN") && (
                <Input
                  aria-label="Credit / licence note"
                  maxLength={1000}
                  onChange={(e) => setSettings((s) => ({ ...s, sourceNote: e.target.value }))}
                  placeholder={settings.sourceType === "PERMISSION" ? "Who gave permission, and when" : "Author, title, licence"}
                  value={settings.sourceNote}
                />
              )}
              <p className="text-xs text-app-muted">No copyrighted books or paid courses without written permission (OD-7).</p>
            </div>

            <div className="space-y-3">
              <DateField label="Publish from (optional)" onChange={(d) => setSettings((s) => ({ ...s, publishAt: d }))} value={settings.publishAt} />
              <DateField label="Hide after (optional)" onChange={(d) => setSettings((s) => ({ ...s, expiresAt: d }))} value={settings.expiresAt} />
              <DateField label="Review by (reminder)" onChange={(d) => setSettings((s) => ({ ...s, reviewBy: d }))} value={settings.reviewBy} />
            </div>
          </Card>
        </div>
      </div>

      {article && <VersionsSection article={article} onRollback={(versionId) => act("roll back", () => api.rollbackKnowledge(article.id, { versionId }), "Rolled back: that version is live again as a new version.")} />}
      {article && (
        <Card className="space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-bold">
            <History aria-hidden className="size-4" />
            Change log
          </h2>
          <ol className="space-y-2 text-sm">
            {article.events.map((e) => (
              <li className="flex flex-wrap items-baseline gap-x-2" key={e.id}>
                <span className="font-semibold">{EVENT_LABEL[e.type]}</span>
                {e.versionNumber && <span className="text-app-muted">v{e.versionNumber}</span>}
                <span className="text-app-muted">
                  by {e.actor?.name ?? "someone"} · {formatDateTime(e.createdAt, timeZone)}
                </span>
                {e.detail && <EventDetail detail={e.detail} />}
              </li>
            ))}
          </ol>
        </Card>
      )}

      <AlertDialog onOpenChange={(open) => !open && setAckOpen(null)} open={ackOpen !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish flagged text?</AlertDialogTitle>
            <AlertDialogDescription>
              This version contains text that looks like instructions to an AI (for example “ignore previous instructions”). It is shown to readers as
              written, and it will be quoted to the assistant later. Publish only if it is meant to be there.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction onClick={() => void publish(ackOpen?.versionId, true)}>Publish anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this article permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              Every version, its change log and its votes are removed and can&apos;t be recovered. Archive it instead to hide it but keep the history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-app-danger hover:bg-app-danger/85" onClick={() => void remove()}>
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** A coach suggestion: the change against the live version, or the whole text for a new article. */
function SuggestionBody({ article, version }: { article: KnowledgeAdminArticleDetail; version: KnowledgeVersionDto }) {
  const diff = useKnowledgeDiff(article.id, article.published?.id ?? null, version.id);
  if (!article.published) return <KnowledgeMarkdown role="ADMIN" source={version.body} />;
  if (!diff.data) return <Skeleton className="h-24" />;
  return <DiffView lines={diff.data.lines} />;
}

function VersionsSection({ article, onRollback }: { article: KnowledgeAdminArticleDetail; onRollback: (versionId: string) => Promise<unknown> }) {
  const timeZone = useUserTimeZone();
  const [compare, setCompare] = useState<{ from: string; to: string } | null>(null);
  const diff = useKnowledgeDiff(article.id, compare?.from ?? null, compare?.to ?? null);
  const [rollbackTo, setRollbackTo] = useState<string | null>(null);
  const liveId = article.published?.id ?? null;

  useEffect(() => setCompare(null), [article.latestVersionNumber]);

  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-bold">Versions</h2>
      <ul className="divide-y divide-app-border">
        {article.versions.map((v) => {
          const s = VERSION_STATUS[v.status];
          const against = liveId && liveId !== v.id ? liveId : article.versions.find((x) => x.number < v.number)?.id;
          return (
            <li className="flex flex-wrap items-center gap-3 py-2.5" key={v.id}>
              <span className="w-10 font-mono text-sm font-bold">v{v.number}</span>
              <Badge variant={s.variant}>{s.label}</Badge>
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-semibold">{v.title}</p>
                <p className="text-xs text-app-muted">
                  {v.author?.name ?? "—"} · {formatDateTime(v.publishedAt ?? v.updatedAt, timeZone)}
                  {v.changeNote ? ` · “${v.changeNote}”` : ""}
                  {v.reviewNote ? ` · declined: ${v.reviewNote}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                {against && (
                  <Button
                    onClick={() => setCompare(compare?.to === v.id ? null : { from: against, to: v.id })}
                    size="sm"
                    variant={compare?.to === v.id ? "primary" : "outline"}
                  >
                    {liveId && liveId !== v.id ? "Compare with live" : "Compare with previous"}
                  </Button>
                )}
                {v.status === "SUPERSEDED" && (
                  <SimpleTooltip label={`Make v${v.number} live again`}>
                    <Button aria-label={`Roll back to v${v.number}`} className="rounded-full" onClick={() => setRollbackTo(v.id)} size="icon" variant="outline">
                      <RotateCcw className="size-4" strokeWidth={2.5} />
                    </Button>
                  </SimpleTooltip>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {compare && (diff.data ? <DiffView lines={diff.data.lines} /> : <Skeleton className="h-24" />)}
      <AlertDialog onOpenChange={(open) => !open && setRollbackTo(null)} open={rollbackTo !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Roll back to this version?</AlertDialogTitle>
            <AlertDialogDescription>
              Its text is copied into a new version and published. Nothing is deleted, so you can roll forward again the same way.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                // undo: intentionally excluded — a rollback is a new version; rolling back again reverses it.
                if (rollbackTo) void onRollback(rollbackTo);
                setRollbackTo(null);
              }}
            >
              Roll back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export function DiffView({ lines }: { lines: { kind: "same" | "added" | "removed"; text: string }[] }) {
  if (!lines.some((l) => l.kind !== "same")) return <p className="text-sm text-app-muted">No differences.</p>;
  return (
    <pre className="max-h-[420px] overflow-auto rounded-control border border-app-border bg-app-surface p-3 text-xs leading-5">
      {lines.map((l, i) => (
        <div
          className={cn(
            "whitespace-pre-wrap break-words px-1",
            l.kind === "added" && "bg-success/15 text-success-ink",
            l.kind === "removed" && "bg-app-danger/10 text-app-danger-ink line-through decoration-app-danger/40",
          )}
          key={i}
        >
          {l.kind === "added" ? "+ " : l.kind === "removed" ? "− " : "  "}
          {l.text || " "}
        </div>
      ))}
    </pre>
  );
}

function EventDetail({ detail }: { detail: Record<string, unknown> }) {
  if (detail.after && typeof detail.after === "object") {
    const keys = Object.keys(detail.after as object);
    return <span className="text-app-muted">({keys.join(", ")})</span>;
  }
  if (typeof detail.note === "string") return <span className="text-app-muted">— {detail.note}</span>;
  if (typeof detail.fromVersion === "number") return <span className="text-app-muted">(copy of v{detail.fromVersion})</span>;
  if (detail.imported) return <span className="text-app-muted">(imported)</span>;
  if (detail.republished) return <span className="text-app-muted">(republished)</span>;
  if (Array.isArray(detail.acknowledgedWarnings)) return <span className="text-warning-ink">(flags acknowledged)</span>;
  return null;
}

function DateField({ label, value, onChange }: { label: string; value: Date | undefined; onChange: (d: Date | undefined) => void }) {
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-semibold">{label}</span>
      <div className="flex items-center gap-2">
        <DatePicker aria-label={label} className="flex-1" onChange={onChange} value={value} withTime />
        {value && (
          <Button aria-label={`Clear ${label}`} onClick={() => onChange(undefined)} size="sm" variant="ghost">
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
