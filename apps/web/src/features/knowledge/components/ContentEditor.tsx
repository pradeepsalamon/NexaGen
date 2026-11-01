"use client";

import { useState } from "react";
import {
  KNOWLEDGE_BODY_MAX,
  KNOWLEDGE_RESOURCE_TYPES,
  KNOWLEDGE_SUMMARY_MAX,
  KNOWLEDGE_TITLE_MAX,
  type KnowledgeArticleKind,
  type KnowledgeResourceType,
} from "@nexa-chess/types";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { TextEditor } from "@/components/ui/TextEditor";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/utils";
import { KnowledgeMarkdown, PgnViewer } from "./KnowledgeMarkdown";

export type ContentDraft = {
  title: string;
  summary: string;
  body: string;
  pgn: string;
  resourceType: KnowledgeResourceType | "";
  resourceRef: string;
  changeNote: string;
};

export const EMPTY_CONTENT: ContentDraft = {
  body: "",
  changeNote: "",
  pgn: "",
  resourceRef: "",
  resourceType: "",
  summary: "",
  title: "",
};

export const RESOURCE_LABELS: Record<KnowledgeResourceType, string> = {
  COURSE: "Course (id)",
  LIBRARY_GAME: "Game library game (id)",
  PAGE: "Page in the app (path)",
  PUZZLE_FOLDER: "Puzzle folder (id)",
};

/** The request body for a content save. */
export function contentPayload(c: ContentDraft) {
  return {
    body: c.body,
    changeNote: c.changeNote.trim() || null,
    pgn: c.pgn.trim() || null,
    resourceRef: c.resourceRef.trim() || null,
    resourceType: c.resourceType || null,
    summary: c.summary.trim() || null,
    title: c.title.trim(),
  };
}

const MARKDOWN_HELP =
  "Markdown: # Heading, **bold**, *italic*, - list, > note, [link](/student/schedule). A ```fen block shows a board; a ```pgn block a replayable game.";

/**
 * Title / summary / body (with a live preview) and the kind-specific fields.
 * Used by the admin editor and the coach's suggestion dialog.
 */
export function ContentEditor({
  value,
  onChange,
  kind,
  previewRole,
  showChangeNote = true,
}: {
  value: ContentDraft;
  onChange: (next: ContentDraft) => void;
  kind: KnowledgeArticleKind;
  previewRole: string | undefined;
  showChangeNote?: boolean;
}) {
  const [mode, setMode] = useState<"write" | "preview">("write");
  const set = <K extends keyof ContentDraft>(key: K, v: ContentDraft[K]) => onChange({ ...value, [key]: v });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="kb-title">{kind === "FAQ" ? "Question" : "Title"}</Label>
        <Input id="kb-title" maxLength={KNOWLEDGE_TITLE_MAX} onChange={(e) => set("title", e.target.value)} value={value.title} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="kb-summary">Short summary (optional)</Label>
        <Input
          id="kb-summary"
          maxLength={KNOWLEDGE_SUMMARY_MAX}
          onChange={(e) => set("summary", e.target.value)}
          placeholder="One line shown in search results"
          value={value.summary}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="kb-body">{kind === "FAQ" ? "Answer" : kind === "GAME" ? "Commentary" : "Body"}</Label>
          <div aria-label="Editor mode" className="inline-flex rounded-full border border-app-border p-0.5" role="group">
            {(["write", "preview"] as const).map((m) => (
              <button
                aria-pressed={mode === m}
                className={cn(
                  "min-h-8 rounded-full px-3 text-xs font-bold capitalize",
                  mode === m ? "bg-primary text-white" : "text-app-muted hover:text-app-text",
                )}
                key={m}
                onClick={() => setMode(m)}
                type="button"
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        {mode === "write" ? (
          <>
            <TextEditor
              className="min-h-[280px] font-mono text-sm"
              id="kb-body"
              linkTargets="site"
              maxLength={KNOWLEDGE_BODY_MAX}
              onChange={(body) => set("body", body)}
              value={value.body}
            />
            <p className="text-xs text-app-muted">{MARKDOWN_HELP}</p>
          </>
        ) : (
          <div className="min-h-[280px] rounded-panel border border-app-border bg-app-surface p-4">
            {value.body.trim() ? (
              <KnowledgeMarkdown role={previewRole} source={value.body} />
            ) : (
              <p className="text-sm text-app-muted">Nothing to preview yet.</p>
            )}
          </div>
        )}
      </div>

      {kind === "GAME" && (
        <div className="space-y-1.5">
          <Label htmlFor="kb-pgn">Game (PGN)</Label>
          <Textarea
            className="min-h-[140px] font-mono text-sm"
            id="kb-pgn"
            onChange={(e) => set("pgn", e.target.value)}
            placeholder={'[White "Capablanca"]\n[Black "Marshall"]\n\n1. e4 e5 2. Nf3 *'}
            value={value.pgn}
          />
          {value.pgn.trim() && mode === "preview" && <PgnViewer pgn={value.pgn} />}
        </div>
      )}

      {kind === "RESOURCE" && (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <div className="space-y-1.5">
            <Label htmlFor="kb-resource-type">Links to</Label>
            <Select
              id="kb-resource-type"
              onChange={(e) => set("resourceType", e.target.value as ContentDraft["resourceType"])}
              options={KNOWLEDGE_RESOURCE_TYPES.map((t) => ({ label: RESOURCE_LABELS[t], value: t }))}
              placeholder="Choose…"
              value={value.resourceType}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kb-resource-ref">{value.resourceType === "PAGE" ? "Path" : "Id"}</Label>
            <Input
              id="kb-resource-ref"
              maxLength={300}
              onChange={(e) => set("resourceRef", e.target.value)}
              placeholder={value.resourceType === "PAGE" ? "/student/schedule" : ""}
              value={value.resourceRef}
            />
          </div>
        </div>
      )}

      {showChangeNote && (
        <div className="space-y-1.5">
          <Label htmlFor="kb-change-note">What changed (optional)</Label>
          <Input
            id="kb-change-note"
            maxLength={1000}
            onChange={(e) => set("changeNote", e.target.value)}
            placeholder="Shown in the version history"
            value={value.changeNote}
          />
        </div>
      )}
    </div>
  );
}
