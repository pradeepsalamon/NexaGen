"use client";

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
import { useTheme } from "@/providers/ThemeProvider";
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
    default:
      return "Member";
  }
}

function getRoleVariant(role?: string) {
  switch (role) {
    case "SUPER_ADMIN":
    case "ADMIN":
      return "destructive" as const;
    case "COACH":
      return "warning" as const;
    case "STUDENT":
      return "success" as const;
    default:
      return "default" as const;
  }
}

function getInitials(user?: Pick<UserWithAvatar, "firstName" | "lastName">) {
  const firstInitial = user?.firstName?.trim().charAt(0) ?? "";
  const lastInitial = user?.lastName?.trim().charAt(0) ?? "";
  const initials = `${firstInitial}${lastInitial}`.toUpperCase();
  if (initials.length === 1 && user?.firstName && user.firstName.length >= 2) {
    return (
      user.firstName.charAt(0) + user.firstName.charAt(user.firstName.length - 1)
    ).toUpperCase();
  }
  return initials || "TS";
}

export function UserNavMenu({
  user,
  openLinksInNewTab = false
}: UserNavMenuProps) {
  const router = useRouter();
  const toast = useToast();
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";

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
  const initials = getInitials(user);
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
            className={`group inline-flex items-center gap-2 rounded-full border p-1 pr-2.5 text-xs font-bold transition cursor-pointer ${isDark
                ? "bg-[#0B1B38] border-white/12 text-white hover:border-[#E2B355]/50"
                : "bg-[#F8FAFC] border-[#E2E8F0] text-[#071B41] hover:border-[#CBD5E1]"
              }`}
          >
            <div
              className={`flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-extrabold ${isDark
                  ? "bg-[#1A2E56] text-[#E2B355]"
                  : "bg-[#FCE8D8] text-[#C85A28]"
                }`}
            >
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt=""
                  className="size-full object-cover"
                  referrerPolicy="no-referrer"
                  src={user.avatarUrl}
                />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <span className="hidden max-w-[110px] truncate text-xs font-bold sm:inline-block">
              {user.firstName}
            </span>
            <ChevronDown
              className={`size-3.5 transition group-data-[state=open]:rotate-180 ${isDark ? "text-[#94A3B8]" : "text-[#64748B]"
                }`}
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
                  variant={getRoleVariant(user.role)}
                  className="shrink-0 text-[10px] px-1.5 py-0.5"
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
                className="flex cursor-pointer items-center gap-2.5 py-2 font-semibold"
                {...newTabProps}
              >
                <LayoutDashboard className="size-4 text-primary-ink" />
                <span>Dashboard</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href="/profile"
                className="flex cursor-pointer items-center gap-2.5 py-2 font-semibold"
                {...newTabProps}
              >
                <UserIcon className="size-4 text-app-muted" />
                <span>Profile &amp; settings</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href="/chess-board"
                className="flex cursor-pointer items-center gap-2.5 py-2 font-semibold"
                {...newTabProps}
              >
                <Palette className="size-4 text-app-muted" />
                <span>Chess board</span>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setIsConfirmOpen(true)}
            className="flex cursor-pointer items-center gap-2.5 py-2 font-semibold text-app-danger-ink focus:bg-app-danger/10"
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
        Are you sure you want to sign out of Nexa Chess?
      </ConfirmationModal>
    </>
  );
}