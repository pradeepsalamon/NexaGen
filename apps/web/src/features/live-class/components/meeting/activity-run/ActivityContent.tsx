"use client";

import { cn } from "@/lib/utils";
import { PuzzleBoardTile } from "../PuzzleBoardTile";

type Content = {
  text?: string | null;
  imageUrl?: string | null;
  fen?: string | null;
  orientation?: "white" | "black" | null;
};

const orientationOf = (content: Content): "white" | "black" =>
  content.orientation ?? (content.fen?.split(" ")[1] === "b" ? "black" : "white");

/** A question or an answer: text, an uploaded image, a board from a FEN, or any mix of them. */
export function ActivityContent({
  content,
  imageAlt,
  boardClassName,
  textClassName
}: {
  content: Content;
  imageAlt: string;
  boardClassName?: string;
  textClassName?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {content.text ? <p className={cn("whitespace-pre-wrap break-words", textClassName)}>{content.text}</p> : null}
      {content.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- uploaded CDN images of unknown size
        <img
          src={content.imageUrl}
          alt={imageAlt}
          loading="lazy"
          className="max-h-[50dvh] w-full rounded-control border border-app-border bg-app-soft object-contain"
        />
      ) : null}
      {content.fen ? (
        <div className={cn("w-full max-w-[min(360px,50dvh)]", boardClassName)}>
          <PuzzleBoardTile fen={content.fen} orientation={orientationOf(content)} />
        </div>
      ) : null}
    </div>
  );
}
