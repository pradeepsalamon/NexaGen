"use client";

import { useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { REACTION_EMOJIS } from "../../lib/reactions";
import { useReactions } from "../../providers/ReactionProvider";

/** Emoji tray; `children` is the trigger button. Renders nothing outside a ReactionProvider. */
export function ReactionPicker({
  children,
  side = "top",
}: {
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  const reactions = useReactions();
  const [open, setOpen] = useState(false);
  if (!reactions) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side={side} sideOffset={12} className="w-auto p-1.5">
        <div className="grid grid-cols-4 gap-1">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`React ${emoji}`}
              className="flex size-11 items-center justify-center rounded-xl text-2xl transition-transform hover:scale-110 hover:bg-app-soft active:scale-95"
              onClick={() => reactions.sendReaction(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
