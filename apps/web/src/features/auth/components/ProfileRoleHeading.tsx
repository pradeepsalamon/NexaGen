"use client";

import { useAuthStore } from "../../../stores/authStore";

const roleLabels: Record<string, string> = {
  ADMIN: "Admin",
  COACH: "Coach",
  STUDENT: "Student",
  SUPER_ADMIN: "Super Admin"
};

export function ProfileRoleHeading() {
  const role = useAuthStore((state) => state.user?.role);
  const label = role ? roleLabels[role] ?? role : "Profile";

  return (
    <h1 className="text-2xl font-extrabold leading-tight tracking-tight mt-3 text-app-text">{label}</h1>
  );
}
