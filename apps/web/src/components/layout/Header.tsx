"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "../Logo";
import { UserAvatar } from "../common/UserAvatar";
import { useAuthStore } from "../../stores/authStore";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/super-admin": "Super Admin Dashboard",
  "/profile": "Profile"
};

function formatPageTitle(pathname: string) {
  if (pageTitles[pathname]) {
    return pageTitles[pathname];
  }

  const currentSegment = pathname.split("/").filter(Boolean).at(-1);

  if (!currentSegment) {
    return "Dashboard";
  }

  return currentSegment
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function Header() {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const pageTitle = formatPageTitle(pathname);

  return (
    <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-app-border bg-app-surface/95 shadow-[0_1px_0_rgba(16,24,40,0.02)] backdrop-blur supports-[backdrop-filter]:bg-app-surface/88">
      <div className="mx-auto grid h-full w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          aria-label="Go to Dashboard"
          className="min-w-0 justify-self-start rounded-control transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
          href="/dashboard"
        >
          <Logo compact />
        </Link>
        <h1 className="max-w-[42vw] truncate text-center text-sm font-extrabold text-app-text sm:max-w-none sm:text-base">
          {pageTitle}
        </h1>
        <div className="justify-self-end">
          <UserAvatar user={user} />
        </div>
      </div>
    </header>
  );
}
