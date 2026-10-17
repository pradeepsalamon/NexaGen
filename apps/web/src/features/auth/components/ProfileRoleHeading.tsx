"use client";

import { Badge } from "@/components/ui/Badge";
import { pageTitle } from "@/lib/pageTitles";
import { useAuthStore } from "../../../stores/authStore";

const roleLabels: Record<string, string> = {
  ADMIN: "Admin",
  COACH: "Coach",
  STUDENT: "Student",
  SUPER_ADMIN: "Super admin"
};

export function ProfileRoleHeading() {
  const role = useAuthStore((state) => state.user?.role);
  const label = role ? roleLabels[role] ?? role : null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">
        {pageTitle("/profile")}
      </h1>
      {label ? <Badge variant="secondary">{label}</Badge> : null}
    </div>
  );
}
