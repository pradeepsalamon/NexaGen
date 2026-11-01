"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DIAGRAM_CANDIDATE_STATUS_LABELS,
  sanitizeDiagramFileName,
  type DiagramRect,
} from "@nexa-chess/types";
import { Crop, FileText, Loader2, RefreshCw, ScanSearch, Upload, X } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { cn } from "@/lib/utils";
import {
  assessReview,
  candidateFromSelection,
  findCandidates,
  initialReview,
  type CandidateReview,
  type DiagramCandidate,
} from "../lib/candidates";
import { DOCUMENT_LIMITS, DocumentReadError, openDocument, type OpenedDocument, type RenderedPage } from "@/lib/document-reader";
import { DiagramReviewPanel } from "./DiagramReviewPanel";
import { statusBadgeVariant } from "./statusBadge";

/** Everything an action needs about a confirmed position. */
export type ConfirmedDiagram = {
  fen: string;
  corrected: boolean;
  candidate: DiagramCandidate;
  fileName: string;
};

type Props = {
  /** Buttons shown under a confirmed position (load on a board, save to the library…). */
  actions: (confirmed: ConfirmedDiagram) => ReactNode;
  /** Tighter layout for use inside a dialog. */
  compact?: boolean;
};

type PageState = { status: "done"; diagrams: number } | { status: "failed"; error: string };

/** Pages one scan may cover; the coach picks the range. */
const MAX_PAGES_PER_SCAN = 20;

/** Most diagrams kept from one scan; a book page rarely has more than six. */
const MAX_CANDIDATES = 80;

export function DiagramImportWorkbench({ actions, compact = false }: Props) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [pdf, setPdf] = useState<OpenedDocument | null>(null);
  const [opening, setOpening] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("1");
  const [scan, setScan] = useState<{ current: number; total: number } | null>(null);
  const [pages, setPages] = useState<Record<number, PageState>>({});
  const [previews, setPreviews] = useState<Record<number, RenderedPage["preview"]>>({});
  const [candidates, setCandidates] = useState<DiagramCandidate[]>([]);
  const [reviews, setReviews] = useState<Record<string, CandidateReview>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"diagrams" | "pages">("diagrams");
  const cancelRef = useRef(false);
  // Bumped by reset and unmount: async work from an older session must not
  // write into a newer one (or keep a document nobody can close).
  const sessionRef = useRef(0);
  const openingRef = useRef(false);
  const pdfRef = useRef<OpenedDocument | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The last full-resolution page, kept for a manual selection on it.
  const lastPageRef = useRef<RenderedPage | null>(null);

  // The document lives only as long as this component.
  useEffect(
    () => () => {
      cancelRef.current = true;
      sessionRef.current += 1;
      void pdfRef.current?.destroy();
    },
    [],
  );

  const reset = useCallback(async () => {
    cancelRef.current = true;
    sessionRef.current += 1;
    await pdfRef.current?.destroy().catch(() => undefined);
    pdfRef.current = null;
    lastPageRef.current = null;
    setPdf(null);
    setFileName(null);
    setFileError(null);
    setPages({});
    setPreviews({});
    setCandidates([]);
    setReviews({});
    setSelectedId(null);
    setScan(null);
  }, []);

  const onFile = async (file: File | undefined) => {
    if (!file || openingRef.current) return;
    openingRef.current = true;
    await reset();
    const session = sessionRef.current;
    setOpening(true);
    try {
      const opened = await openDocument(file);
      if (session !== sessionRef.current) {
        void opened.destroy();
        return;
      }
      pdfRef.current = opened;
      setPdf(opened);
      setFileName(sanitizeDiagramFileName(file.name));
      setFrom("1");
      setTo(String(Math.min(opened.pageCount, MAX_PAGES_PER_SCAN)));
      // A picture is one page, so there is nothing to choose before scanning it.
      if (opened.kind === "image") void scanPages([1], opened);
    } catch (err) {
      if (!(err instanceof DocumentReadError)) console.warn("Diagram import: unexpected failure", err);
      if (session === sessionRef.current) {
        setFileError(err instanceof DocumentReadError ? err.message : "That file could not be opened.");
      }
    } finally {
      openingRef.current = false;
      if (session === sessionRef.current) setOpening(false);
    }
  };

  const range = useMemo(() => {
    const count = pdf?.pageCount ?? 0;
    const a = Math.max(1, Math.min(count, parseInt(from, 10) || 1));
    const b = Math.max(a, Math.min(count, parseInt(to, 10) || a));
    return { a, b, tooMany: b - a + 1 > MAX_PAGES_PER_SCAN };
  }, [from, to, pdf]);

  const addFromPage = async (doc: OpenedDocument, page: RenderedPage) => {
    lastPageRef.current = page;
    setPreviews((p) => ({ ...p, [page.pageNumber]: page.preview }));
    const found = await findCandidates(doc, page);
    setPages((p) => ({ ...p, [page.pageNumber]: { status: "done", diagrams: found.length } }));
    setCandidates((prev) => {
      // A rescan replaces that page's detected diagrams; hand-marked ones stay.
      const kept = prev.filter((c) => c.page !== page.pageNumber || c.origin === "manual");
      return [...kept, ...found].sort((x, y) => x.page - y.page || x.index - y.index).slice(0, MAX_CANDIDATES);
    });
    setReviews((prev) => {
      const next = { ...prev };
      for (const c of found) next[c.id] = initialReview(c);
      return next;
    });
    return found;
  };

  const scanPages = async (pageNumbers: number[], doc: OpenedDocument | null = pdf) => {
    if (!doc) return;
    cancelRef.current = false;
    const session = sessionRef.current;
    const stale = () => session !== sessionRef.current;
    let firstFound: string | null = null;
    for (let i = 0; i < pageNumbers.length; i += 1) {
      if (cancelRef.current || stale()) break;
      const n = pageNumbers[i];
      setScan({ current: i + 1, total: pageNumbers.length });
      try {
        const rendered = await doc.renderPage(n);
        if (stale()) return;
        const found = await addFromPage(doc, rendered);
        if (stale()) return;
        firstFound ??= found[0]?.id ?? null;
      } catch (err) {
        if (stale()) return;
        setPages((p) => ({
          ...p,
          [n]: { status: "failed", error: err instanceof DocumentReadError ? err.message : `Page ${n} could not be read.` },
        }));
      }
      // Let the browser paint between pages.
      await new Promise((r) => setTimeout(r, 0));
    }
    if (stale()) return;
    setScan(null);
    if (firstFound) setSelectedId((cur) => cur ?? firstFound);
  };

  const onScan = () => {
    if (range.tooMany) return;
    void scanPages(Array.from({ length: range.b - range.a + 1 }, (_, i) => range.a + i));
  };

  const discard = (id: string) => {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  };

  const addManual = async (pageNumber: number, selection: DiagramRect) => {
    if (!pdf) return;
    let page = lastPageRef.current?.pageNumber === pageNumber ? lastPageRef.current : null;
    if (!page) {
      page = await pdf.renderPage(pageNumber);
      lastPageRef.current = page;
    }
    const index = candidates.filter((c) => c.page === pageNumber).length + 1;
    const cand = await candidateFromSelection(pdf, page, selection, index);
    if (!cand) return false;
    setCandidates((prev) => [...prev, cand].sort((x, y) => x.page - y.page || x.index - y.index));
    setReviews((prev) => ({ ...prev, [cand.id]: initialReview(cand) }));
    setSelectedId(cand.id);
    setTab("diagrams");
    return true;
  };

  const selected = candidates.find((c) => c.id === selectedId) ?? null;
  const scannedPages = Object.keys(pages).map(Number).sort((a, b) => a - b);
  const failedPages = scannedPages.filter((n) => pages[n].status === "failed");
  const scannedAll = scannedPages.length > 0 && !scan;
  const everyPageFailed = scannedAll && failedPages.length === scannedPages.length;

  if (!pdf) {
    return (
      <div className="flex flex-col gap-4">
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-app border-2 border-dashed border-app-border bg-app-surface/50 p-8 text-center transition-colors hover:border-primary/40",
            compact ? "min-h-[200px]" : "min-h-[280px]",
          )}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void onFile(e.dataTransfer.files?.[0]);
          }}
        >
          {opening ? (
            <Loader2 className="size-8 animate-spin text-app-muted" strokeWidth={2.25} />
          ) : (
            <Upload className="size-8 text-app-muted" strokeWidth={2.25} />
          )}
          <span className="text-base font-semibold text-app-text">
            {opening ? "Opening the file…" : "Choose a PDF or image, or drop it here"}
          </span>
          <span className="max-w-md text-sm text-app-muted">
            A chess book, worksheet, scan, screenshot or photo (PDF, PNG, JPEG or WebP), up to {DOCUMENT_LIMITS.maxBytes / (1024 * 1024)} MB. The file is read in your browser
            and never uploaded or stored.
          </span>
          <input
            accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            aria-label="PDF or image file"
            className="sr-only"
            data-testid="diagram-pdf-input"
            disabled={opening}
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
            ref={inputRef}
            type="file"
          />
        </label>
        {fileError ? (
          <Alert data-testid="diagram-file-error" title="That file can't be used" variant="error">
            {fileError}
          </Alert>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-app border border-app-border bg-app-surface p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="size-5 shrink-0 text-primary-ink" strokeWidth={2.5} />
            <span className="truncate font-semibold text-app-text" title={fileName ?? undefined}>
              {fileName}
            </span>
            <Badge variant="secondary">
              {pdf.pageCount} page{pdf.pageCount === 1 ? "" : "s"}
            </Badge>
          </div>
          <Button onClick={() => void reset()} size="sm" variant="outline">
            <X className="size-3.5" strokeWidth={2.5} />
            Close file
          </Button>
        </div>
        <div className="flex flex-wrap items-end justify-end gap-3">
          {pdf.kind === "pdf" ? (
            <>
              <label className="flex flex-col gap-1 text-sm text-app-text">
                From page
                <Input
                  className="min-h-9 w-24 px-3"
                  data-testid="diagram-from"
                  max={pdf.pageCount}
                  min={1}
                  onChange={(e) => setFrom(e.target.value)}
                  type="number"
                  value={from}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-app-text">
                To page
                <Input
                  className="min-h-9 w-24 px-3"
                  data-testid="diagram-to"
                  max={pdf.pageCount}
                  min={1}
                  onChange={(e) => setTo(e.target.value)}
                  type="number"
                  value={to}
                />
              </label>
            </>
          ) : null}
          {scan ? (
            <Button onClick={() => (cancelRef.current = true)} variant="outline">
              Stop
            </Button>
          ) : null}
          <Button data-testid="diagram-scan" disabled={!!scan || range.tooMany} onClick={onScan}>
            {scan ? <Loader2 className="size-4 animate-spin" /> : <ScanSearch className="size-4" strokeWidth={2.5} />}
            {scan ? `Scanning page ${scan.current} of ${scan.total}…` : "Scan for diagrams"}
          </Button>
        </div>
        {range.tooMany ? (
          <p className="text-right text-xs text-warning-ink">
            Scan at most {MAX_PAGES_PER_SCAN} pages at a time.
          </p>
        ) : null}
        {scan ? (
          <div
            aria-label="Scan progress"
            aria-valuemax={scan.total}
            aria-valuemin={0}
            aria-valuenow={scan.current}
            className="h-1.5 overflow-hidden rounded-full bg-app-soft"
            role="progressbar"
          >
            <div className="h-full bg-primary transition-[width]" style={{ width: `${(scan.current / scan.total) * 100}%` }} />
          </div>
        ) : null}
        {failedPages.length > 0 ? (
          <Alert
            action={
              <Button disabled={!!scan} onClick={() => void scanPages(failedPages)} size="sm" variant="outline">
                <RefreshCw className="size-3.5" strokeWidth={2.5} />
                Retry
              </Button>
            }
            title={`${failedPages.length} page${failedPages.length === 1 ? "" : "s"} could not be read`}
            variant="warning"
          >
            {failedPages.map((n) => (pages[n] as { error: string }).error).join(" ")}
          </Alert>
        ) : null}
      </div>

      <Tabs onValueChange={(v) => setTab(v as "diagrams" | "pages")} value={tab}>
        <TabsList>
          <TabsTrigger value="diagrams">Diagrams ({candidates.length})</TabsTrigger>
          <TabsTrigger disabled={scannedPages.length === 0} value="pages">
            Pages &amp; manual selection
          </TabsTrigger>
        </TabsList>

        <TabsContent value="diagrams">
          {candidates.length === 0 ? (
            everyPageFailed ? (
              // Unread pages say nothing about diagrams; the alert above has the reason.
              <EmptyState
                description="None of the scanned pages could be read, so we can't say whether they have diagrams."
                icon={ScanSearch}
                title="Nothing could be read"
              />
            ) : scannedAll ? (
              <EmptyState
                description="No chessboards were found on the scanned pages. If a page does have one (for example a diagram without shaded squares), open “Pages & manual selection” and draw a box around it."
                icon={ScanSearch}
                title="No diagrams found"
              />
            ) : (
              <EmptyState
                description="Choose the pages to scan, then press “Scan for diagrams”."
                icon={ScanSearch}
                title="Nothing scanned yet"
              />
            )
          ) : (
            <div className={cn("grid gap-5", !compact && "lg:grid-cols-[260px_minmax(0,1fr)]")}>
              <ul
                aria-label="Detected diagrams"
                className={cn(
                  "flex gap-2 overflow-x-auto pb-1",
                  !compact && "lg:max-h-[calc(100dvh-14rem)] lg:flex-col lg:overflow-y-auto lg:overflow-x-visible",
                )}
              >
                {candidates.map((c) => {
                  const status = assessReview(c, reviews[c.id]).status;
                  return (
                    <li className="shrink-0" key={c.id}>
                      <button
                        aria-pressed={c.id === selectedId}
                        className={cn(
                          "flex w-56 items-center gap-3 rounded-control border bg-app-surface p-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus lg:w-full",
                          c.id === selectedId ? "border-primary bg-primary/[0.06]" : "border-app-border hover:bg-app-soft",
                        )}
                        data-testid="diagram-candidate"
                        onClick={() => setSelectedId(c.id)}
                        type="button"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- in-memory data URL */}
                        <img alt="" className="size-16 shrink-0 rounded-control border border-app-border object-contain" src={c.crop} />
                        <span className="flex min-w-0 flex-col gap-1">
                          <span className="text-sm font-semibold text-app-text">
                            Page {c.page} · #{c.index}
                          </span>
                          <Badge className="w-fit" variant={statusBadgeVariant(status)}>
                            {DIAGRAM_CANDIDATE_STATUS_LABELS[status]}
                          </Badge>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="min-w-0">
                {selected ? (
                  <DiagramReviewPanel
                    actions={(fen, corrected) => actions({ fen, corrected, candidate: selected, fileName: fileName ?? "" })}
                    candidate={selected}
                    key={selected.id}
                    onChange={(next) => setReviews((prev) => ({ ...prev, [selected.id]: next }))}
                    onDiscard={() => discard(selected.id)}
                    review={reviews[selected.id]}
                  />
                ) : (
                  <p className="text-sm text-app-muted">Select a diagram to review it.</p>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="pages">
          <ManualSelection
            onAdd={addManual}
            pageCount={pdf.pageCount}
            pages={scannedPages}
            previews={previews}
            renderPreview={async (n) => {
              const page = await pdf.renderPage(n);
              lastPageRef.current = page;
              setPreviews((p) => ({ ...p, [n]: page.preview }));
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Page preview where the coach draws a box around a diagram the detector missed. */
function ManualSelection({
  onAdd,
  pageCount,
  pages,
  previews,
  renderPreview,
}: {
  onAdd: (page: number, rect: DiagramRect) => Promise<boolean | undefined>;
  pageCount: number;
  pages: number[];
  previews: Record<number, RenderedPage["preview"]>;
  renderPreview: (page: number) => Promise<void>;
}) {
  const [pageText, setPageText] = useState(String(pages[0] ?? 1));
  const page = Math.max(1, Math.min(pageCount, parseInt(pageText, 10) || 1));
  const preview = previews[page];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const dragging = useRef(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setSel(null);
    setError(null);
    if (previews[page]) return;
    let live = true;
    setLoading(true);
    renderPreview(page)
      .catch(() => live && setError(`Page ${page} could not be rendered.`))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const point = (e: React.PointerEvent) => {
    const r = (imgRef.current as HTMLImageElement).getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
  };

  const use = async () => {
    if (!sel || !preview) return;
    const x = Math.min(sel.x0, sel.x1) * preview.width;
    const y = Math.min(sel.y0, sel.y1) * preview.height;
    const w = Math.abs(sel.x1 - sel.x0) * preview.width;
    const h = Math.abs(sel.y1 - sel.y0) * preview.height;
    setLoading(true);
    try {
      const ok = await onAdd(page, { x, y, w, h });
      if (!ok) setError("That selection is too small to hold a chessboard.");
      else setSel(null);
    } catch {
      setError(`Page ${page} could not be rendered.`);
    } finally {
      setLoading(false);
    }
  };

  const box = sel
    ? {
        left: `${Math.min(sel.x0, sel.x1) * 100}%`,
        top: `${Math.min(sel.y0, sel.y1) * 100}%`,
        width: `${Math.abs(sel.x1 - sel.x0) * 100}%`,
        height: `${Math.abs(sel.y1 - sel.y0) * 100}%`,
      }
    : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-xl text-sm text-app-muted">
          Drag a box around the board (just the squares, a little margin is fine), then read it. Use this when a diagram was missed.
        </p>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-sm text-app-text">
            Page
            <Input
              className="min-h-9 w-24 px-3"
              max={pageCount}
              min={1}
              onChange={(e) => setPageText(e.target.value)}
              type="number"
              value={pageText}
            />
          </label>
          <Button disabled={!sel || loading} onClick={() => void use()}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Crop className="size-4" strokeWidth={2.5} />}
            Read selected board
          </Button>
        </div>
      </div>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {preview ? (
        <div className="relative mx-auto w-full max-w-3xl touch-none select-none">
          {/* eslint-disable-next-line @next/next/no-img-element -- in-memory data URL */}
          <img
            alt={`Page ${page}`}
            className="w-full rounded-control border border-app-border"
            draggable={false}
            onPointerDown={(e) => {
              dragging.current = true;
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              const p = point(e);
              setSel({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
            }}
            onPointerMove={(e) => {
              if (!dragging.current) return;
              const p = point(e);
              setSel((s) => (s ? { ...s, x1: p.x, y1: p.y } : s));
            }}
            onPointerUp={() => {
              dragging.current = false;
            }}
            ref={imgRef}
            src={preview.url}
          />
          {box ? (
            <div aria-hidden className="pointer-events-none absolute border-2 border-primary bg-primary/10" style={box} />
          ) : null}
        </div>
      ) : (
        <div className="flex min-h-[200px] items-center justify-center text-sm text-app-muted">
          {loading ? <Loader2 className="size-5 animate-spin" /> : "Choose a page."}
        </div>
      )}
    </div>
  );
}
