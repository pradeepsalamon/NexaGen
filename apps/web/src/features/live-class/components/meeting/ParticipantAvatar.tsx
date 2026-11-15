"use client";

import { Avatar, type AvatarSize } from "@/components/ui/Avatar";

/** The room's avatar sizes, on the shared `Avatar` (navy room variant). */
const ROOM_SIZES: Record<"xs" | "sm" | "md" | "lg", AvatarSize> = {
  xs: "xs",
  sm: "sm",
  md: "lg",
  lg: "xl",
};

export function ParticipantAvatar({
  name,
  imageUrl,
  size = "lg",
  className,
}: {
  name: string;
  imageUrl?: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  return <Avatar name={name} imageUrl={imageUrl} size={ROOM_SIZES[size]} tone="brand" label={imageUrl ? name : undefined} className={className} />;
}
