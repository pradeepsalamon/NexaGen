"use client";

import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { CoachSidebar } from "@/components/layout/CoachSidebar";
import { SalesSidebar } from "@/components/layout/SalesSidebar";
import { StudentSidebar } from "@/components/layout/StudentSidebar";
import { useAuthStore } from "@/stores/authStore";

/** Mounts the nav drawer for the signed-in user's role. */
export function RoleSidebar() {
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const role = useAuthStore((state) => state.user?.role);

  if (!isHydrated) return null;

  switch (role) {
    case "ADMIN":
    case "SUPER_ADMIN":
      return <AdminSidebar />;
    case "COACH":
      return <CoachSidebar />;
    case "STUDENT":
      return <StudentSidebar />;
    case "SALES":
      return <SalesSidebar />;
    default:
      return null;
  }
}
