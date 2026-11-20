"use client";

import { Fragment, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ArrowUpToLine, CornerUpLeft, GitBranch, Highlighter, Trash2 } from "lucide-react";
import {
  isMainlinePath,
  moveGlyph,
  moveNumberAt,
  MOVE_GLYPH_GROUPS,
  MOVE_GLYPHS,
  nagSymbol,
  type MoveTree,
  type MoveTreeNode,
  type MoveTreePath,
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
import { Button } from "@/components/ui/Button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { Textarea } from "@/components/ui/Textarea";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { glyphDefinition, glyphTextClass, moveToneClass } from "../../lib/moveGlyphs";

export interface MoveTreeViewProps {
  tree: MoveTree;
  /** Path of the position on the board (`[]` = start). */
  cursor: MoveTreePath;
  onSelect: (path: MoveTreePath) => void;
  /** Shows Promote / Delete / Annotate. Pass only for a coach (or admin). */
  editable?: boolean;
  onPromote?: (path: MoveTreePath) => void;
  onDelete?: (path: MoveTreePath) => void;
  onComment?: (path: MoveTreePath, comment: string) => void;
  /** Turns an annotation glyph (`MOVE_GLYPHS`) on or off for the move at `path`. */
  onToggleNag?: (path: MoveTreePath, nag: number) => void;
  className?: string;
  emptyLabel?: string;
  /**
   * `flow` (default): the mainline wraps like a book. `rows`: one mainline
   * move per row — number, move, and its evaluation when `evaluations` has one.
   */
  layout?: "flow" | "rows";
  /** Formatted White-relative evaluation by the FEN after a move (rows layout). */
  evaluations?: Readonly<Record<string, string>>;
}

const samePath = (a: MoveTreePath, b: MoveTreePath) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * The move list as a tree: the mainline flows in bold, each variation sits in
 * an indented block under the move it replaces (nested ones inline in
 * brackets), and the move on the board is highlighted. Purely presentational —
 * the live board (`MoveHistory`) and the Game Library viewer both feed it.
 */
export function MoveTreeView({
  tree,
  cursor,
  onSelect,
  editable = false,
  onPromote,
  onDelete,
  onComment,
  onToggleNag,
  className,
  emptyLabel = "No moves yet",
  layout = "flow",
  evaluations,
}: MoveTreeViewProps) {
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const annotatable = editable && Boolean(onComment || onToggleNag);
  const [annotateOpen, setAnnotateOpen] = useState(false);

  /** Right-click (or a long press, where the browser sends one) on a move: select it and open Annotate. */
  const annotateOnContextMenu = (path: MoveTreePath) =>
    annotatable
      ? (e: MouseEvent) => {
          e.preventDefault();
          onSelect(path);
          setAnnotateOpen(true);
        }
      : undefined;

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const moveButton = (node: MoveTreeNode, path: MoveTreePath, depth: number, showNumber: boolean, main: boolean) => {
    const { number, white } = moveNumberAt(tree.rootFen, depth);
    const active = samePath(path, cursor);
    const label = white ? `${number}.` : showNumber ? `${number}...` : "";
    const tone = active ? undefined : moveToneClass(node.nags);
    return (
      <Fragment key={node.id}>
        {node.preComment && <MoveComment text={node.preComment} />}
        <button
          type="button"
          ref={active ? activeRef : undefined}
          onClick={() => onSelect(path)}
          onContextMenu={annotateOnContextMenu(path)}
          aria-current={active ? "step" : undefined}
          aria-label={`${label} ${node.san}${glyphNames(node.nags)}${main ? "" : " (variation)"}`.trim()}
          className={cn(
            "inline-flex items-baseline gap-0.5 rounded px-1 py-0.5 font-mono transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            main ? "font-semibold text-app-text" : "text-app-muted",
            active ? "bg-primary text-on-primary" : "hover:bg-app-soft hover:text-primary-ink",
            tone,
          )}
        >
          {label && <span className={cn("font-normal", active ? "text-on-primary/80" : "text-app-muted")}>{label}</span>}
          <span>{node.san}</span>
          <Glyphs nags={node.nags} active={active} />
        </button>
        {visibleComment(node.comment) && <MoveComment text={visibleComment(node.comment)} />}
      </Fragment>
    );
  };

  /** One mainline move as a cell of a numbered pair: move, then its evaluation (rows layout). */
  const moveCell = (node: MoveTreeNode, path: MoveTreePath, depth: number) => {
    const { number, white } = moveNumberAt(tree.rootFen, depth);
    const active = samePath(path, cursor);
    const label = white ? `${number}.` : `${number}...`;
    const evaluation = evaluations?.[node.fen];
    return (
      <button
        type="button"
        ref={active ? activeRef : undefined}
        onClick={() => onSelect(path)}
        onContextMenu={annotateOnContextMenu(path)}
        aria-current={active ? "step" : undefined}
        aria-label={`${label} ${node.san}${glyphNames(node.nags)}${evaluation ? `, evaluation ${evaluation}` : ""}`}
        className={cn(
          "flex min-w-0 items-baseline gap-1 px-2 py-1 text-left font-mono transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50",
          active ? "bg-primary text-on-primary" : cn("text-app-text hover:bg-app-soft", moveToneClass(node.nags)),
        )}
      >
        <span className="min-w-0 flex-1 truncate font-semibold">
          {node.san}
          <Glyphs nags={node.nags} active={active} />
        </span>
        {evaluation ? (
          <span className={cn("shrink-0 text-xs tabular-nums", active ? "text-on-primary" : "text-app-muted")}>{evaluation}</span>
        ) : null}
      </button>
    );
  };

  /** A variation's moves inline, with nested variations in brackets. */
  const inlineLine = (level: MoveTreeNode[], prefix: MoveTreePath, depth: number, forceNumber: boolean): ReactNode[] => {
    const out: ReactNode[] = [];
    let current = level;
    let path = prefix;
    let d = depth;
    let force = forceNumber;
    while (current.length > 0) {
      const [mainNode, ...alts] = current;
      out.push(moveButton(mainNode, [...path, 0], d, force, false));
      alts.forEach((alt, i) => {
        const altPath = [...path, i + 1];
        out.push(
          <span key={`${alt.id}-v`} className="text-app-muted/70">
            (
            {moveButton(alt, altPath, d, true, false)}
            {inlineLine(alt.children, altPath, d + 1, Boolean(alt.comment))}
            )
          </span>,
        );
      });
      force = alts.length > 0 || Boolean(mainNode.comment);
      path = [...path, 0];
      current = mainNode.children;
      d += 1;
    }
    return out;
  };

  /** The mainline as rows broken by indented variation blocks. */
  const blocks: ReactNode[] = [];
  let row: ReactNode[] = [];
  // Rows layout: the open move pair. A variation or comment closes it early, Lichess-style ("…" fills the gap).
  let pair: { key: string; number: number; white: ReactNode | null } | null = null;
  const closePair = (black: ReactNode | null) => {
    if (!pair) return;
    blocks.push(
      <div key={`pair-${pair.key}`} className="grid grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)] text-[0.8125rem] leading-5">
        <span className="bg-app-soft/60 py-1 pr-1.5 text-right font-mono text-xs leading-5 text-app-muted">{pair.number}</span>
        {pair.white ?? <Gap />}
        {black ?? (pair.white ? <span /> : <Gap />)}
      </div>,
    );
    pair = null;
  };
  let level = tree.children;
  let path: MoveTreePath = [];
  let depth = 0;
  let force = true;
  while (level.length > 0) {
    const [mainNode, ...alts] = level;
    if (layout === "rows") {
      const { number, white } = moveNumberAt(tree.rootFen, depth);
      if (mainNode.preComment) {
        closePair(null);
        blocks.push(<RowComment key={`pre-${mainNode.id}`} text={mainNode.preComment} />);
      }
      const cell = moveCell(mainNode, [...path, 0], depth);
      if (white) {
        closePair(null);
        pair = { key: mainNode.id, number, white: cell };
      } else {
        pair ??= { key: mainNode.id, number, white: null };
        closePair(cell);
      }
      const comment = visibleComment(mainNode.comment);
      if (comment) {
        closePair(null);
        blocks.push(<RowComment key={`c-${mainNode.id}`} text={comment} />);
      }
      if (alts.length > 0) closePair(null);
    } else {
      row.push(moveButton(mainNode, [...path, 0], depth, force, true));
    }
    if (alts.length > 0) {
      if (row.length > 0) {
        blocks.push(
          <div key={`row-${mainNode.id}`} className="flex flex-wrap items-baseline gap-x-0.5 gap-y-1">
            {row}
          </div>,
        );
      }
      row = [];
      blocks.push(
        <div
          key={`vars-${mainNode.id}`}
          className={cn("my-1 space-y-1 border-l-2 border-primary/30 pl-2 text-xs", layout === "rows" ? "ml-9" : "ml-2")}
          role="group"
          aria-label="Variations"
        >
          {alts.map((alt, i) => {
            const altPath = [...path, i + 1];
            return (
              <div key={alt.id} className="flex flex-wrap items-baseline gap-x-0.5 gap-y-1">
                {moveButton(alt, altPath, depth, true, false)}
                {inlineLine(alt.children, altPath, depth + 1, Boolean(alt.comment))}
              </div>
            );
          })}
        </div>,
      );
    }
    force = alts.length > 0 || Boolean(mainNode.comment);
    path = [...path, 0];
    level = mainNode.children;
    depth += 1;
  }
  closePair(null);
  if (row.length > 0) {
    blocks.push(
      <div key="row-end" className="flex flex-wrap items-baseline gap-x-0.5 gap-y-1">
        {row}
      </div>,
    );
  }

  const inVariation = cursor.length > 0 && !isMainlinePath(cursor);
  const branchDepth = cursor.findIndex((index) => index !== 0);
  // Deepest branch point on the cursor's line — what "Delete variation" removes.
  const deepestBranch = cursor.reduce((acc, index, i) => (index !== 0 ? i : acc), -1);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {(inVariation || (annotatable && cursor.length > 0)) && (
        <VariationBar
          inVariation={inVariation}
          editable={editable}
          onBackToMainline={() => onSelect(cursor.slice(0, Math.max(0, branchDepth)))}
          onPromote={onPromote ? () => onPromote(cursor) : undefined}
          onDelete={onDelete && deepestBranch >= 0 ? () => onDelete(cursor.slice(0, deepestBranch + 1)) : undefined}
          annotate={
            annotatable && cursor.length > 0
              ? {
                  node: currentNode(tree, cursor),
                  open: annotateOpen,
                  onOpenChange: setAnnotateOpen,
                  onComment: onComment ? (text) => onComment(cursor, text) : undefined,
                  onToggleNag: onToggleNag ? (nag) => onToggleNag(cursor, nag) : undefined,
                }
              : undefined
          }
        />
      )}
      <div className={cn("min-h-0 flex-1 overflow-y-auto text-sm", layout === "rows" ? "py-0.5" : "space-y-1 p-2")}>
        {tree.rootComment && (layout === "rows" ? <RowComment text={tree.rootComment} /> : <MoveComment text={tree.rootComment} />)}
        {blocks.length === 0 ? (
          <div className="p-4 text-center text-xs text-app-muted">{emptyLabel}</div>
        ) : (
          blocks
        )}
      </div>
    </div>
  );
}

function currentNode(tree: MoveTree, cursor: MoveTreePath): MoveTreeNode | undefined {
  let level = tree.children;
  let node: MoveTreeNode | undefined;
  for (const index of cursor) {
    node = level[index];
    if (!node) return undefined;
    level = node.children;
  }
  return node;
}

/** ", Brilliant move, White is better" for a screen reader. */
function glyphNames(nags: readonly number[] | undefined): string {
  return (nags ?? []).map((nag) => `, ${moveGlyph(nag)?.name ?? nagSymbol(nag)}`).join("");
}

/** The move's glyphs, coloured, each with its meaning on hover. */
function Glyphs({ nags, active }: { nags: readonly number[] | undefined; active: boolean }) {
  if (!nags?.length) return null;
  return nags.map((nag) => {
    const glyph = moveGlyph(nag);
    return (
      <span
        key={nag}
        title={glyph ? glyphDefinition(glyph) : undefined}
        className={cn(active ? "text-on-primary" : glyphTextClass(nag), glyph?.group !== "move" && "pl-0.5")}
      >
        {nagSymbol(nag)}
      </span>
    );
  });
}

interface AnnotateProps {
  node: MoveTreeNode | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComment?: (text: string) => void;
  onToggleNag?: (nag: number) => void;
}

function Gap() {
  return <span className="px-2 py-1 font-mono text-app-muted">…</span>;
}

function RowComment({ text }: { text: string }) {
  return <p className="px-3 py-1 text-xs italic text-app-muted">{text}</p>;
}

function MoveComment({ text }: { text: string }) {
  return <span className="px-1 text-xs italic text-app-muted">{text}</span>;
}

function VariationBar({
  inVariation,
  editable,
  onBackToMainline,
  onPromote,
  onDelete,
  annotate,
}: {
  inVariation: boolean;
  editable: boolean;
  onBackToMainline: () => void;
  onPromote?: () => void;
  onDelete?: () => void;
  annotate?: AnnotateProps;
}) {
  const [confirm, setConfirm] = useState<"promote" | "delete" | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-app-border bg-app-soft/60 px-2 py-1.5 text-xs">
      {inVariation && (
        <>
          <span className="inline-flex items-center gap-1 font-semibold text-app-text">
            <GitBranch className="size-3.5" strokeWidth={2.5} aria-hidden />
            Variation
          </span>
          <Button variant="neutral" size="sm" className="h-7 min-h-7 px-2 text-xs" onClick={onBackToMainline}>
            <CornerUpLeft className="size-3.5" strokeWidth={2.5} aria-hidden />
            Back to mainline
          </Button>
        </>
      )}
      <div className="ml-auto flex items-center gap-1">
        {editable && annotate && <AnnotateEditor {...annotate} />}
        {editable && inVariation && onPromote && (
          <Button variant="outline" size="sm" className="h-7 min-h-7 px-2 text-xs" onClick={() => setConfirm("promote")}>
            <ArrowUpToLine className="size-3.5" strokeWidth={2.5} aria-hidden />
            Promote to mainline
          </Button>
        )}
        {editable && inVariation && onDelete && (
          <SimpleTooltip label="Delete variation">
            <Button
              variant="neutral"
              size="icon"
              className="size-7 min-h-7 text-app-danger-ink"
              aria-label="Delete variation"
              onClick={() => setConfirm("delete")}
            >
              <Trash2 className="size-3.5" strokeWidth={2.5} />
            </Button>
          </SimpleTooltip>
        )}
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="space-y-2">
              <AlertDialogTitle>
                {confirm === "promote" ? "Promote this variation?" : "Delete this variation?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirm === "promote"
                  ? "This line becomes the mainline. The current mainline is kept as a variation, with all its sub-variations and comments."
                  : "This removes the variation from its branch point onwards, including any sub-variations inside it. The mainline is not affected."}
              </AlertDialogDescription>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant={confirm === "delete" ? "destructive" : "primary"}
                onClick={() => {
                  if (confirm === "promote") onPromote?.();
                  if (confirm === "delete") onDelete?.();
                  setConfirm(null);
                }}
              >
                {confirm === "promote" ? "Promote to mainline" : "Delete variation"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Annotate the move on the board: glyphs in three groups (a click turns one on
 * or off and applies at once; one per group), the meaning of each chosen glyph,
 * and the comment (saved with Save). Opens from its button or by right-clicking
 * a move in the list.
 */
function AnnotateEditor({ node, open, onOpenChange, onComment, onToggleNag }: AnnotateProps) {
  const comment = node?.comment ?? "";
  const [draft, setDraft] = useState(comment);
  useEffect(() => {
    if (open) setDraft(comment);
  }, [open, comment]);
  const nags = node?.nags ?? [];
  const chosen = MOVE_GLYPHS.filter((glyph) => nags.includes(glyph.nag));
  const annotated = chosen.length > 0 || Boolean(comment);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="neutral" size="sm" className="h-7 min-h-7 px-2 text-xs">
          <Highlighter className="size-3.5" strokeWidth={2.5} aria-hidden />
          {annotated ? "Edit annotation" : "Annotate"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))] space-y-3 p-3">
        <p className="text-xs font-semibold text-app-text">
          Annotate <span className="font-mono">{node?.san}</span>
        </p>
        {onToggleNag &&
          MOVE_GLYPH_GROUPS.map(({ group, label }) => (
            <div key={group} role="group" aria-label={label} className="space-y-1">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-app-muted">{label}</p>
              <div className="flex flex-wrap gap-1">
                {MOVE_GLYPHS.filter((glyph) => glyph.group === group).map((glyph) => {
                  const on = nags.includes(glyph.nag);
                  return (
                    <SimpleTooltip key={glyph.nag} label={glyph.name}>
                      <button
                        type="button"
                        aria-label={glyph.name}
                        aria-pressed={on}
                        onClick={() => onToggleNag(glyph.nag)}
                        className={cn(
                          "inline-flex h-8 min-w-8 items-center justify-center rounded-control border px-1.5 font-mono text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                          on
                            ? "border-primary bg-primary text-on-primary"
                            : cn("border-app-border bg-app-surface hover:bg-app-soft", glyphTextClass(glyph.nag)),
                        )}
                      >
                        {glyph.symbol}
                      </button>
                    </SimpleTooltip>
                  );
                })}
              </div>
            </div>
          ))}
        {chosen.length > 0 && (
          <ul className="space-y-0.5 rounded-control bg-app-soft/60 px-2 py-1.5 text-xs text-app-muted" aria-label="Chosen glyphs">
            {chosen.map((glyph) => (
              <li key={glyph.nag}>
                <span className={cn("font-mono font-bold", glyphTextClass(glyph.nag))}>{glyph.symbol}</span>{" "}
                <span className="font-semibold text-app-text">{glyph.name}</span> — {glyph.description}
              </li>
            ))}
          </ul>
        )}
        {onComment && (
          <div className="space-y-2">
            <Textarea
              aria-label="Move comment"
              value={draft}
              maxLength={500}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-[80px] text-xs"
              placeholder="Explain the idea behind this move…"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                {draft.trim() === comment.trim() ? "Done" : "Cancel"}
              </Button>
              <Button
                size="sm"
                disabled={draft.trim() === comment.trim()}
                onClick={() => {
                  onComment(draft);
                  onOpenChange(false);
                }}
              >
                Save comment
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * A comment as a reader sees it: PGN command annotations ([%clk 0:03:00],
 * [%eval 0.3], [%csl …]) are data for tools, kept in the PGN but not shown.
 */
function visibleComment(comment: string | undefined): string {
  return (comment ?? "").replace(/\[%[a-z]+[^\]]*\]/gi, "").replace(/\s+/g, " ").trim();
}
