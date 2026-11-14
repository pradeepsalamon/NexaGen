"use client";

import Link from "next/link";
import type { AuthUser } from "@nexa-chess/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/Tooltip";

type UserWithAvatar = AuthUser & {
  avatarUrl?: string | null;
};

type UserAvatarProps = {
  href?: string;
  user?: UserWithAvatar;
};

export function UserAvatar({ href = "/profile", user }: UserAvatarProps) {
  const initials = getInitials(user);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          aria-label="Show profile"
          className="inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-app-border bg-[color-mix(in_srgb,var(--color-primary)_14%,var(--color-surface))] text-sm font-extrabold text-primary-ink shadow-card transition hover:border-[color-mix(in_srgb,var(--color-primary)_45%,var(--color-border))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
          href={href}
        >
          {user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="size-full object-cover"
              referrerPolicy="no-referrer"
              src={user.avatarUrl}
            />
          ) : (
            <span aria-hidden="true">{initials}</span>
          )}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom">Show profile</TooltipContent>
    </Tooltip>
  );
}

function getInitials(user?: Pick<UserWithAvatar, "firstName" | "lastName">) {
  const firstInitial = user?.firstName?.trim().charAt(0) ?? "";
  const lastInitial = user?.lastName?.trim().charAt(0) ?? "";
  const initials = `${firstInitial}${lastInitial}`.toUpperCase();

  return initials || "NC";
}
