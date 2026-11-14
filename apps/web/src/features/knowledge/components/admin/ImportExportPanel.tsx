"use client";

import { useRef, useState } from "react";
import { Download, FileUp, Loader2 } from "lucide-react";
import {
  KNOWLEDGE_IMPORT_MAX,
  type KnowledgeExportFile,
  type KnowledgeImportItem,
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useInvalidateKnowledge } from "../../hooks/useKnowledgeApi";
import { exportKnowledge, importKnowledge } from "../../api/knowledgeApi";
import { useToast } from "@/providers/ToastProvider";

/** A Markdown file becomes one draft: the first "# " line is the title, the rest the body. */
export function markdownFileToItem(name: string, text: string): KnowledgeImportItem {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const headingAt = lines.findIndex((l) => /^#\s+/.test(l));
  const title = headingAt >= 0 ? lines[headingAt].replace(/^#\s+/, "").trim() : name.replace(/\.(md|markdown|txt)$/i, "");
  const body = (headingAt >= 0 ? [...lines.slice(0, headingAt), ...lines.slice(headingAt + 1)] : lines).join("\n").trim();
  return { content: { body, title: title.slice(0, 200) || "Untitled" }, settings: { sourceType: "OWN_WORK" } };
}

/**
 * Export everything (a backup, or to move to another academy) and import it
 * back, or import a batch of Markdown files. Imports always land as drafts:
 * nothing goes live without someone choosing its audience and publishing it.
 */
export function ImportExportPanel() {
  const toast = useToast();
  const invalidate = useInvalidateKnowledge();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);

  const doExport = async () => {
    setBusy("export");
    try {
      const file = await exportKnowledge();
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `knowledge-base-${file.exportedAt.slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success({ title: `Exported ${file.items.length} article(s).` });
    } catch (err) {
      toast.error({ message: err instanceof Error ? err.message : undefined, title: "Export failed" });
    } finally {
      setBusy(null);
    }
  };

  const doImport = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("import");
    try {
      const items: KnowledgeImportItem[] = [];
      for (const file of Array.from(files)) {
        const text = await file.text();
        if (/\.json$/i.test(file.name)) {
          const parsed = JSON.parse(text) as Partial<KnowledgeExportFile>;
          if (parsed.format !== "nexa-knowledge-export" || !Array.isArray(parsed.items)) {
            throw new Error(`${file.name} is not a knowledge-base export.`);
          }
          items.push(...parsed.items);
        } else {
          items.push(markdownFileToItem(file.name, text));
        }
      }
      if (items.length > KNOWLEDGE_IMPORT_MAX) throw new Error(`Import at most ${KNOWLEDGE_IMPORT_MAX} articles at a time.`);
      // undo: intentionally excluded — bulk import; every item is a draft that can be archived or deleted.
      const result = await importKnowledge({ items });
      await invalidate();
      toast.success({ message: "They are drafts: choose an audience and publish each one.", title: `Imported ${result.created} article(s)` });
    } catch (err) {
      toast.error({ message: err instanceof Error ? err.message : undefined, title: "Import failed" });
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="space-y-3 p-5">
        <h3 className="font-bold">Export</h3>
        <p className="text-sm text-app-muted">
          Downloads every article that isn&apos;t archived (its live version, or its draft if never published) with its settings, as JSON.
          Batch scopes aren&apos;t included.
        </p>
        <Button disabled={busy !== null} onClick={() => void doExport()} variant="outline">
          {busy === "export" ? <Loader2 aria-hidden className="mr-2 size-4 animate-spin" /> : <Download aria-hidden className="mr-2 size-4" strokeWidth={2.5} />}
          Download export
        </Button>
      </Card>
      <Card className="space-y-3 p-5">
        <h3 className="font-bold">Import</h3>
        <p className="text-sm text-app-muted">
          Pick an export file, or Markdown files (one article each; the first <code># heading</code> is the title). Up to {KNOWLEDGE_IMPORT_MAX} at a
          time. Everything arrives as a draft. Only import material you own, public-domain or openly licensed content (OD-7).
        </p>
        <input
          accept=".json,.md,.markdown,.txt,application/json,text/markdown,text/plain"
          className="sr-only"
          id="kb-import"
          multiple
          onChange={(e) => void doImport(e.target.files)}
          ref={input}
          type="file"
        />
        <Button disabled={busy !== null} onClick={() => input.current?.click()}>
          {busy === "import" ? <Loader2 aria-hidden className="mr-2 size-4 animate-spin" /> : <FileUp aria-hidden className="mr-2 size-4" strokeWidth={2.5} />}
          Choose files
        </Button>
      </Card>
    </div>
  );
}
