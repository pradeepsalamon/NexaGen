"use client";

import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";

const SIZES = {
  xs: "size-6 text-xs",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-16 text-xl",
  xl: "size-24 text-3xl",
} as const;

const TONES = {
  // Default: a soft blue fill with blue initials.
  soft: "bg-primary-soft text-primary-ink",
  // Live room (video tiles, people rows): navy with initials, the same in both themes.
  brand: "bg-brand-800 text-on-brand",
} as const;

export type AvatarSize = keyof typeof SIZES;
export type AvatarTone = keyof typeof TONES;

/** Up to two initials: first and last word of the name. */
export function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * The one avatar (Design System v2): a round photo, or initials on a tone
 * fill when there is none. Decorative by default — the name is almost always
 * printed beside it — so the image has empty alt text unless `label` is set.
 */
export const Avatar = memo(function Avatar({
  name,
  imageUrl,
  size = "md",
  tone = "soft",
  label,
  className,
}: {
  name: string;
  imageUrl?: string | null;
  size?: AvatarSize;
  tone?: AvatarTone;
  /** Accessible name when the avatar stands alone (no visible name next to it). */
  label?: string;
  className?: string;
}) {
  const initials = useMemo(() => avatarInitials(name), [name]);

  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={label ?? ""}
        referrerPolicy="no-referrer"
        className={cn("shrink-0 rounded-full border border-app-border object-cover", SIZES[size], className)}
      />
    );
  }

  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        TONES[tone],
        SIZES[size],
        className,
      )}
    >
      {initials}
    </span>
  );
});
