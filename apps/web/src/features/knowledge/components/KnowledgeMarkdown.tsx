"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Repeat2 } from "lucide-react";
import { lineThroughPath, parsePgnToMoveTree, readSetupFen, type MoveTreeNode } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { PracticeBoard } from "@/features/chessboard/components/board/PracticeBoard";
import { canAccessPath } from "@/lib/routeAccess";
import { createMoveTreeChess } from "@/lib/moveTreeChess";
import { cn } from "@/lib/utils";
import { classifyHref, parseInline, parseMarkdown, type MdInline } from "../lib/markdown";

/**
 * Renders a help article body. `role` decides which internal links stay
 * links: a page the reader's role can't open is shown as plain text, so a
 * student is never sent to an admin page.
 */
export function KnowledgeMarkdown({ source, role }: { source: string; role: string | undefined }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <div className="space-y-4 text-[0.95rem] leading-relaxed text-app-text">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading": {
            const cls = block.level === 1 ? "text-xl font-extrabold" : block.level === 2 ? "text-lg font-bold" : "text-base font-bold";
            const Tag = (`h${block.level + 1}` as "h2" | "h3" | "h4");
            return (
              <Tag className={cn("pt-2", cls)} key={i}>
                <Inline nodes={parseInline(block.text)} role={role} />
              </Tag>
            );
          }
          case "paragraph":
            return (
              <p key={i}>
                <Inline nodes={parseInline(block.text)} role={role} />
              </p>
            );
          case "quote":
            return (
              <blockquote className="border-l-4 border-primary/40 bg-primary/5 px-4 py-2 text-app-text" key={i}>
                <Inline nodes={parseInline(block.text)} role={role} />
              </blockquote>
            );
          case "list": {
            const ListTag = block.ordered ? "ol" : "ul";
            return (
              <ListTag className={cn("space-y-1 pl-6", block.ordered ? "list-decimal" : "list-disc")} key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>
                    <Inline nodes={parseInline(item)} role={role} />
                  </li>
                ))}
              </ListTag>
            );
          }
          case "code":
            if (block.lang === "fen") return <FenDiagram fen={block.text} key={i} />;
            if (block.lang === "pgn") return <PgnViewer key={i} pgn={block.text} />;
            return (
              <pre className="overflow-x-auto rounded-control border border-app-border bg-app-soft p-3 text-sm" key={i}>
                <code>{block.text}</code>
              </pre>
            );
        }
      })}
    </div>
  );
}

function Inline({ nodes, role }: { nodes: MdInline[]; role: string | undefined }): ReactNode {
  return nodes.map((node, i) => {
    switch (node.type) {
      case "text":
        return <Fragment key={i}>{node.text}</Fragment>;
      case "strong":
        return (
          <strong className="font-bold" key={i}>
            <Inline nodes={node.children} role={role} />
          </strong>
        );
      case "em":
        return (
          <em key={i}>
            <Inline nodes={node.children} role={role} />
          </em>
        );
      case "code":
        return (
          <code className="rounded bg-app-soft px-1.5 py-0.5 text-[0.85em]" key={i}>
            {node.text}
          </code>
        );
      case "link": {
        const kind = classifyHref(node.href);
        const children = <Inline nodes={node.children} role={role} />;
        if (kind === "external") {
          return (
            <a className="font-semibold text-primary-ink underline underline-offset-2" href={node.href} key={i} rel="noopener noreferrer nofollow" target="_blank">
              {children}
            </a>
          );
        }
        if (kind === "internal" && canAccessPath(node.href.split(/[?#]/)[0], role)) {
          return (
            <Link className="font-semibold text-primary-ink underline underline-offset-2" href={node.href} key={i}>
              {children}
            </Link>
          );
        }
        return <span key={i}>{children}</span>;
      }
    }
  });
}

/** A static board for a ```fen block; unreadable notation shows as text. */
export function FenDiagram({ fen }: { fen: string }) {
  const read = readSetupFen(fen.trim());
  if (!read.ok) {
    return (
      <p className="rounded-control border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-ink">
        Diagram could not be shown: {read.error}.
      </p>
    );
  }
  return (
    <figure className="mx-auto w-full max-w-[360px]">
      <PracticeBoard fen={read.fen} interactive={false} orientation={read.fen.split(" ")[1] === "b" ? "black" : "white"} />
      <figcaption className="mt-1 text-center text-xs text-app-muted">
        {read.fen.split(" ")[1] === "b" ? "Black" : "White"} to move
      </figcaption>
    </figure>
  );
}

/** A replayable game for a ```pgn block (and GAME articles): mainline with comments. */
export function PgnViewer({ pgn }: { pgn: string }) {
  const parsed = useMemo(() => {
    try {
      return { game: parsePgnToMoveTree(pgn, createMoveTreeChess), error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unreadable PGN", game: null };
    }
  }, [pgn]);
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<"white" | "black">("white");

  if (!parsed.game) {
    return (
      <p className="rounded-control border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-ink">
        Game could not be shown: {parsed.error}
      </p>
    );
  }
  const { tree, headers } = parsed.game;
  const nodes: MoveTreeNode[] = lineThroughPath(tree, []).nodes;
  const current = ply > 0 ? nodes[ply - 1] : null;
  const fen = current ? current.fen : tree.rootFen;
  const lastMove: [string, string] | null = current ? [current.uci.slice(0, 2), current.uci.slice(2, 4)] : null;
  const title = [headers.White, headers.Black].filter(Boolean).join(" – ");

  const nav = (label: string, onClick: () => void, disabled: boolean, icon: ReactNode) => (
    <SimpleTooltip label={label}>
      <Button aria-label={label} className="rounded-full" disabled={disabled} onClick={onClick} size="icon" type="button" variant="outline">
        {icon}
      </Button>
    </SimpleTooltip>
  );

  return (
    <figure className="grid gap-4 rounded-panel border border-app-border bg-app-surface p-3 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <div className="space-y-2">
        <PracticeBoard fen={fen} interactive={false} lastMove={lastMove} orientation={orientation} />
        <div aria-label="Move navigation" className="flex items-center justify-center gap-1.5" role="toolbar">
          {nav("First move", () => setPly(0), ply === 0, <ChevronsLeft className="size-4" strokeWidth={2.5} />)}
          {nav("Previous move", () => setPly((p) => Math.max(0, p - 1)), ply === 0, <ChevronLeft className="size-4" strokeWidth={2.5} />)}
          {nav("Next move", () => setPly((p) => Math.min(nodes.length, p + 1)), ply >= nodes.length, <ChevronRight className="size-4" strokeWidth={2.5} />)}
          {nav("Last move", () => setPly(nodes.length), ply >= nodes.length, <ChevronsRight className="size-4" strokeWidth={2.5} />)}
          {nav("Flip board", () => setOrientation((o) => (o === "white" ? "black" : "white")), false, <Repeat2 className="size-4" strokeWidth={2.5} />)}
        </div>
      </div>
      <div className="min-w-0 space-y-2">
        {title && <figcaption className="font-bold">{title}{headers.Result ? ` · ${headers.Result}` : ""}</figcaption>}
        <ol className="flex max-h-72 flex-wrap gap-x-1 gap-y-1 overflow-y-auto text-sm">
          {nodes.map((node, idx) => (
            <li key={node.id}>
              <button
                className={cn(
                  "rounded px-1.5 py-0.5 hover:bg-primary/10",
                  idx + 1 === ply ? "bg-primary text-white hover:bg-primary" : "text-app-text",
                )}
                onClick={() => setPly(idx + 1)}
                type="button"
              >
                {idx % 2 === 0 ? `${Math.floor(idx / 2) + 1}. ` : ""}
                {node.san}
              </button>
            </li>
          ))}
        </ol>
        {current?.comment && <p className="rounded-control bg-app-soft px-3 py-2 text-sm">{current.comment}</p>}
      </div>
    </figure>
  );
}
