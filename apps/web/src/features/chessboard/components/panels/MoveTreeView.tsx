"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpToLine, CornerUpLeft, GitBranch, MessageSquareText, Trash2 } from "lucide-react";
import {
  isMainlinePath,
  moveNumberAt,
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

export interface MoveTreeViewProps {
  tree: MoveTree;
  /** Path of the position on the board (`[]` = start). */
  cursor: MoveTreePath;
  onSelect: (path: MoveTreePath) => void;
  /** Shows Promote / Delete / Comment. Pass only for a coach (or admin). */
  editable?: boolean;
  onPromote?: (path: MoveTreePath) => void;
  onDelete?: (path: MoveTreePath) => void;
  onComment?: (path: MoveTreePath, comment: string) => void;
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
  className,
  emptyLabel = "No moves yet",
  layout = "flow",
  evaluations,
}: MoveTreeViewProps) {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const moveButton = (node: MoveTreeNode, path: MoveTreePath, depth: number, showNumber: boolean, main: boolean) => {
    const { number, white } = moveNumberAt(tree.rootFen, depth);
    const active = samePath(path, cursor);
    const label = white ? `${number}.` : showNumber ? `${number}...` : "";
    return (
      <Fragment key={node.id}>
        {node.preComment && <MoveComment text={node.preComment} />}
        <button
          type="button"
          ref={active ? activeRef : undefined}
          onClick={() => onSelect(path)}
          aria-current={active ? "step" : undefined}
          aria-label={`${label} ${node.san}${main ? "" : " (variation)"}`.trim()}
          className={cn(
            "inline-flex items-baseline gap-0.5 rounded px-1 py-0.5 font-mono transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            main ? "font-semibold text-app-text" : "text-app-muted",
            active ? "bg-primary text-white" : "hover:bg-app-soft hover:text-primary-ink",
          )}
        >
          {label && <span className={cn("font-normal", active ? "text-white/80" : "text-app-muted")}>{label}</span>}
          <span>{node.san}</span>
          {node.nags?.map((nag) => (
            <span key={nag} className={active ? "text-white" : "text-primary-ink"}>
              {nagSymbol(nag)}
            </span>
          ))}
        </button>
        {visibleComment(node.comment) && <MoveComment text={visibleComment(node.comment)} />}
      </Fragment>
    );
  };

  /** One mainline move as a full-width row: number, move, evaluation (rows layout). */
  const moveRow = (node: MoveTreeNode, path: MoveTreePath, depth: number) => {
    const { number, white } = moveNumberAt(tree.rootFen, depth);
    const active = samePath(path, cursor);
    const label = white ? `${number}.` : `${number}...`;
    const evaluation = evaluations?.[node.fen];
    return (
      <Fragment key={node.id}>
        {node.preComment && <MoveComment text={node.preComment} />}
        <button
          type="button"
          ref={active ? activeRef : undefined}
          onClick={() => onSelect(path)}
          aria-current={active ? "step" : undefined}
          aria-label={`${label} ${node.san}${evaluation ? `, evaluation ${evaluation}` : ""}`}
          className={cn(
            "flex w-full items-baseline gap-2 rounded px-2 py-1 text-left font-mono transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            active ? "bg-primary text-white" : "text-app-text hover:bg-app-soft",
          )}
        >
          <span className={cn("w-10 shrink-0 text-right text-xs", active ? "text-white/80" : "text-app-muted")}>{label}</span>
          <span className="min-w-0 flex-1 font-semibold">
            {node.san}
            {node.nags?.map((nag) => (
              <span key={nag} className={active ? "text-white" : "text-primary-ink"}>
                {nagSymbol(nag)}
              </span>
            ))}
          </span>
          {evaluation ? (
            <span className={cn("shrink-0 text-xs font-medium tabular-nums", active ? "text-white" : "text-app-text")}>{evaluation}</span>
          ) : null}
        </button>
        {visibleComment(node.comment) && (
          <div className="pl-12">
            <MoveComment text={visibleComment(node.comment)} />
          </div>
        )}
      </Fragment>
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
  let level = tree.children;
  let path: MoveTreePath = [];
  let depth = 0;
  let force = true;
  while (level.length > 0) {
    const [mainNode, ...alts] = level;
    if (layout === "rows") {
      blocks.push(moveRow(mainNode, [...path, 0], depth));
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
          className={cn("my-1 space-y-1 border-l-2 border-primary/30 pl-2 text-xs", layout === "rows" ? "ml-12" : "ml-2")}
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
      {(inVariation || (editable && cursor.length > 0)) && (
        <VariationBar
          inVariation={inVariation}
          editable={editable}
          onBackToMainline={() => onSelect(cursor.slice(0, Math.max(0, branchDepth)))}
          onPromote={onPromote ? () => onPromote(cursor) : undefined}
          onDelete={onDelete && deepestBranch >= 0 ? () => onDelete(cursor.slice(0, deepestBranch + 1)) : undefined}
          comment={editable && onComment ? currentComment(tree, cursor) : undefined}
          onComment={onComment ? (text) => onComment(cursor, text) : undefined}
        />
      )}
      <div className={cn("min-h-0 flex-1 overflow-y-auto p-2 text-sm", layout === "rows" ? "space-y-0.5" : "space-y-1")}>
        {tree.rootComment && <MoveComment text={tree.rootComment} />}
        {blocks.length === 0 ? (
          <div className="p-4 text-center text-xs text-app-muted">{emptyLabel}</div>
        ) : (
          blocks
        )}
      </div>
    </div>
  );
}

function currentComment(tree: MoveTree, cursor: MoveTreePath): string {
  let level = tree.children;
  let node: MoveTreeNode | undefined;
  for (const index of cursor) {
    node = level[index];
    if (!node) return "";
    level = node.children;
  }
  return node?.comment ?? "";
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
  comment,
  onComment,
}: {
  inVariation: boolean;
  editable: boolean;
  onBackToMainline: () => void;
  onPromote?: () => void;
  onDelete?: () => void;
  comment?: string;
  onComment?: (text: string) => void;
}) {
  const [confirm, setConfirm] = useState<"promote" | "delete" | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-app-border bg-app-soft/60 px-2 py-1.5 text-xs">
      {inVariation && (
        <>
          <span className="inline-flex items-center gap-1 font-semibold text-primary-ink">
            <GitBranch className="size-3.5" strokeWidth={2.5} aria-hidden />
            Variation
          </span>
          <Button variant="ghost" size="sm" className="h-7 min-h-7 px-2 text-xs" onClick={onBackToMainline}>
            <CornerUpLeft className="mr-1 size-3.5" aria-hidden />
            Back to mainline
          </Button>
        </>
      )}
      <div className="ml-auto flex items-center gap-1">
        {editable && onComment && comment !== undefined && (
          <CommentEditor comment={comment} onSave={onComment} />
        )}
        {editable && inVariation && onPromote && (
          <Button variant="outline" size="sm" className="h-7 min-h-7 px-2 text-xs" onClick={() => setConfirm("promote")}>
            <ArrowUpToLine className="mr-1 size-3.5" aria-hidden />
            Promote to mainline
          </Button>
        )}
        {editable && inVariation && onDelete && (
          <SimpleTooltip label="Delete variation">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 min-h-7 rounded-full text-danger-ink"
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

function CommentEditor({ comment, onSave }: { comment: string; onSave: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(comment);
  useEffect(() => {
    if (open) setDraft(comment);
  }, [open, comment]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 min-h-7 px-2 text-xs" aria-label="Comment on this move">
          <MessageSquareText className="mr-1 size-3.5" aria-hidden />
          {comment ? "Edit comment" : "Comment"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2 p-3">
        <Textarea
          aria-label="Move comment"
          value={draft}
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[80px] text-xs"
          placeholder="Explain the idea behind this move…"
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onSave(draft);
              setOpen(false);
            }}
          >
            Save
          </Button>
        </div>
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
