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
    <h1 className="mt-3 text-3xl font-extrabold text-app-text">{label}</h1>
  );
}
