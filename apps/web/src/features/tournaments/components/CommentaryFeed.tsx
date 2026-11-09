"use client";

import { useState } from "react";
import { EyeOff, Megaphone, Pin, PinOff } from "lucide-react";
import { TOURNAMENT_COMMENTARY_TYPE_LABELS, type TournamentCommentaryType, type TournamentHighlight } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkedText } from "@/components/ui/FormattedText";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { PracticeBoard } from "@/features/chessboard/components/board/PracticeBoard";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";

export type FeedItem = {
  id: string;
  type: TournamentCommentaryType;
  body: string;
  author: { name: string } | null;
  game: { id: string; label: string } | null;
  player: { name: string } | null;
  ply: number | null;
  fen: string | null;
  highlight: TournamentHighlight | null;
  pinned: boolean;
  hidden?: boolean;
  released: boolean;
  createdAt: string;
};

type Brush = "green" | "red" | "blue" | "yellow";
const BRUSH: Record<TournamentHighlight["squares"][number]["tone"], Brush> = { accent: "yellow", danger: "red", primary: "blue", success: "green" };

export function highlightShapes(highlight: TournamentHighlight | null | undefined) {
  if (!highlight) return [];
  return [
    ...highlight.squares.map((s) => ({ brush: BRUSH[s.tone], orig: s.square })),
    ...highlight.arrows.map((a) => ({ brush: BRUSH[a.tone], dest: a.to, orig: a.from }))
  ];
}

function typeVariant(type: TournamentCommentaryType) {
  if (type === "EMERGENCY") return "destructive" as const;
  if (type === "ANNOUNCEMENT") return "accent" as const;
  if (type === "FEATURED") return "info" as const;
  return "secondary" as const;
}

function moveLabel(ply: number): string {
  if (ply === 0) return "Start";
  const move = Math.ceil(ply / 2);
  return ply % 2 === 1 ? `${move}.` : `${move}…`;
}

function FeedEntry({
  item,
  onPin,
  onHide,
  onOpenGame
}: {
  item: FeedItem;
  onPin?: (item: FeedItem) => void;
  onHide?: (item: FeedItem) => void;
  onOpenGame?: (gameId: string) => void;
}) {
  const timeZone = useUserTimeZone();
  const [showBoard, setShowBoard] = useState(false);
  const loud = item.type === "EMERGENCY" || item.type === "ANNOUNCEMENT";
  return (
    <li
      className={cn(
        "rounded-control border border-app-border bg-app-surface p-3",
        item.type === "EMERGENCY" && "border-app-danger bg-app-danger-soft",
        item.type === "ANNOUNCEMENT" && "border-accent bg-accent-soft",
        item.hidden && "opacity-60"
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-app-muted">
        {loud ? <Megaphone aria-hidden className="size-3.5" /> : null}
        <Badge variant={typeVariant(item.type)}>{TOURNAMENT_COMMENTARY_TYPE_LABELS[item.type]}</Badge>
        {item.pinned ? <Badge variant="outline">Pinned</Badge> : null}
        {item.hidden ? <Badge variant="destructive">Hidden</Badge> : null}
        {!item.released ? <Badge variant="warning">Delayed for spectators</Badge> : null}
        {item.game ? (
          onOpenGame ? (
            <button className="font-medium text-primary-ink hover:underline" onClick={() => onOpenGame(item.game!.id)} type="button">
              {item.game.label}
              {item.ply !== null ? ` · ${moveLabel(item.ply)}` : ""}
            </button>
          ) : (
            <span className="font-medium">
              {item.game.label}
              {item.ply !== null ? ` · ${moveLabel(item.ply)}` : ""}
            </span>
          )
        ) : null}
        {item.player ? <span className="font-medium">{item.player.name}</span> : null}
        <span className="ml-auto">{formatTime(item.createdAt, timeZone)}</span>
      </div>
      <div className={cn("mt-2 whitespace-pre-wrap break-words text-sm text-app-text", loud && "font-medium")}>
        <LinkedText text={item.body} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {item.author ? <span className="text-xs text-app-muted">— {item.author.name}</span> : null}
        {item.fen ? (
          <Button onClick={() => setShowBoard((v) => !v)} size="sm" variant="ghost">
            {showBoard ? "Hide position" : "Show position"}
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          {onPin ? (
            <SimpleTooltip label={item.pinned ? "Unpin" : "Pin to the top"}>
              <Button aria-label={item.pinned ? "Unpin" : "Pin"} className="size-8 p-0" onClick={() => onPin(item)} variant="neutral">
                {item.pinned ? <PinOff className="size-4" strokeWidth={2.5} /> : <Pin className="size-4" strokeWidth={2.5} />}
              </Button>
            </SimpleTooltip>
          ) : null}
          {onHide && !item.hidden ? (
            <SimpleTooltip label="Hide from everyone">
              <Button aria-label="Hide" className="size-8 p-0" onClick={() => onHide(item)} variant="neutral">
                <EyeOff className="size-4" strokeWidth={2.5} />
              </Button>
            </SimpleTooltip>
          ) : null}
        </div>
      </div>
      {showBoard && item.fen ? (
        <div className="mt-3 w-full max-w-[280px]">
          <PracticeBoard className="max-w-[280px]" fen={item.fen} interactive={false} orientation="white" shapes={highlightShapes(item.highlight)} />
        </div>
      ) : null}
    </li>
  );
}

export function CommentaryFeed({
  items,
  pinned,
  onPin,
  onHide,
  onOpenGame,
  footer
}: {
  items: FeedItem[];
  pinned: FeedItem[];
  onPin?: (item: FeedItem) => void;
  onHide?: (item: FeedItem) => void;
  onOpenGame?: (gameId: string) => void;
  footer?: React.ReactNode;
}) {
  if (items.length === 0 && pinned.length === 0) {
    return <EmptyState description="The hosts' commentary and announcements appear here." title="No commentary yet" variant="inline" />;
  }
  const pinnedIds = new Set(pinned.map((p) => p.id));
  return (
    <div className="flex flex-col gap-3">
      {pinned.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {pinned.map((item) => (
            <FeedEntry item={item} key={`pin-${item.id}`} onHide={onHide} onOpenGame={onOpenGame} onPin={onPin} />
          ))}
        </ul>
      ) : null}
      <ul aria-live="polite" className="flex flex-col gap-2">
        {items
          .filter((item) => !pinnedIds.has(item.id))
          .map((item) => (
            <FeedEntry item={item} key={item.id} onHide={onHide} onOpenGame={onOpenGame} onPin={onPin} />
          ))}
      </ul>
      {footer}
    </div>
  );
}
