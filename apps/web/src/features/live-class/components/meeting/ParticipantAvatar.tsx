"use client";

import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";

interface ParticipantAvatarProps {
  name: string;
  imageUrl?: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-16 text-xl",
  lg: "size-24 text-3xl",
} as const;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export const ParticipantAvatar = memo(function ParticipantAvatar({
  name,
  imageUrl,
  size = "lg",
  className = "",
}: ParticipantAvatarProps) {
  const initials = useMemo(() => getInitials(name), [name]);

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className={cn(
          "rounded-full object-cover shadow-lift border border-app-border",
          sizeMap[size],
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full border border-app-border bg-[color-mix(in_srgb,var(--color-primary)_14%,var(--color-surface))] font-extrabold text-primary-ink shadow-card",
        sizeMap[size],
        className
      )}
    >
      {initials}
    </div>
  );
});
