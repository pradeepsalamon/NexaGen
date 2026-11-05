"use client";

import { useBrandName } from "@/features/branding/context/TenantBrandProvider";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  LayoutDashboard,
  User as UserIcon,
  LogOut,
  ChevronDown,
  Palette
} from "lucide-react";
import type { AuthUser } from "@nexa-chess/types";
import { getRoleDashboardHref, useAuthStore } from "@/stores/authStore";
import { logout } from "@/features/auth/api/authApi";
import { useToast } from "@/providers/ToastProvider";
import { getErrorMessage } from "@/lib/errors";
import { Badge } from "@/components/ui/Badge";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/DropdownMenu";
import { Avatar } from "@/components/ui/Avatar";

type UserWithAvatar = AuthUser & {
  avatarUrl?: string | null;
};

type UserNavMenuProps = {
  user: UserWithAvatar;
  openLinksInNewTab?: boolean;
};

function getRoleLabel(role?: string) {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super Admin";
    case "ADMIN":
      return "Admin";
    case "COACH":
      return "Coach / Teacher";
    case "STUDENT":
      return "Student";
    case "SALES":
      return "Sales";
    default:
      return "Member";
  }
}


export function UserNavMenu({
  user,
  openLinksInNewTab = false
}: UserNavMenuProps) {
  const brandName = useBrandName();
  const router = useRouter();
  const toast = useToast();

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const clearSession = useAuthStore((state) => state.clearSession);

  const logoutMutation = useMutation({
    mutationFn: logout,
    onError: (error) => {
      toast.error({
        message: getErrorMessage(error),
        title: "Logout request failed"
      });
    },
    onSuccess: () => {
      toast.success({
        message: "You have been signed out.",
        title: "Logout successful"
      });
    },
    onSettled: () => {
      setIsConfirmOpen(false);
      clearSession();
      router.replace("/login");
      router.refresh();
    }
  });

  const dashboardHref = getRoleDashboardHref(user.role);
  const newTabProps = openLinksInNewTab
    ? { target: "_blank" as const, rel: "noopener noreferrer" }
    : {};

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="User navigation menu"
            className="group inline-flex min-h-[var(--control-h)] cursor-pointer items-center gap-2 rounded-control px-1.5 text-sm font-medium text-app-text transition-colors hover:bg-app-soft"
          >
            <Avatar name={[user.firstName, user.lastName].filter(Boolean).join(" ")} imageUrl={user.avatarUrl} className="size-7 text-xs" />
            <span className="hidden max-w-[110px] truncate sm:inline-block">
              {user.firstName}
            </span>
            <ChevronDown
              className="size-3.5 transition group-data-[state=open]:rotate-180 text-app-muted"
            />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56 p-1.5 shadow-lift">
          <DropdownMenuLabel className="font-normal p-2">
            <div className="flex flex-col space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-extrabold leading-none text-app-text truncate">
                  {user.firstName} {user.lastName || ""}
                </p>
                <Badge
                  variant="secondary" className="shrink-0"
                >
                  {getRoleLabel(user.role)}
                </Badge>
              </div>
              <p className="text-xs leading-none text-app-muted truncate">
                {user.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link
                href={dashboardHref}
                className="flex cursor-pointer items-center gap-2.5 py-2 font-medium text-app-text"
                {...newTabProps}
              >
                <LayoutDashboard className="size-4 text-app-muted" />
                <span>Dashboard</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href="/profile"
                className="flex cursor-pointer items-center gap-2.5 py-2 font-medium text-app-text"
                {...newTabProps}
              >
                <UserIcon className="size-4 text-app-muted" />
                <span>Profile &amp; settings</span>
              </Link>
            </DropdownMenuItem>
            {user.role === "SALES" ? null : (
            <DropdownMenuItem asChild>
              <Link
                href="/chess-board"
                className="flex cursor-pointer items-center gap-2.5 py-2 font-medium text-app-text"
                {...newTabProps}
              >
                <Palette className="size-4 text-app-muted" />
                <span>Chess board</span>
              </Link>
            </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setIsConfirmOpen(true)}
            className="flex cursor-pointer items-center gap-2.5 py-2 font-medium text-app-danger-ink focus:bg-app-danger/10"
          >
            <LogOut className="size-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmationModal
        cancelLabel="Stay logged in"
        confirmLabel="Logout"
        icon={LogOut}
        isConfirming={logoutMutation.isPending}
        isOpen={isConfirmOpen}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() => logoutMutation.mutate()}
        title="Logout?"
      >
        Are you sure you want to sign out of {brandName}?
      </ConfirmationModal>
    </>
  );
}