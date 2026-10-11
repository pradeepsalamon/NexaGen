"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { StaffClassDetailsClient } from "@/features/coach/components/StaffClassDetailsClient";
import { StudentClassDetailsClient } from "@/features/student-live-classes/components/StudentClassDetailsClient";
import { useAuthStore } from "@/stores/authStore";

/**
 * One class, by role: a student gets their own view (`GET /student/classes/:id`
 * — enrolled students only), the coach and admins the teaching view. Each view
 * only calls the API its role may use, so a student never hits the coach-only
 * route and lands on a blank page.
 */
export default function ClassDetailsPage() {
  const { id } = useParams() as { id: string };
  const user = useAuthStore((state) => state.user);

  let body;
  if (!user) {
    body = (
      <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  } else if (user.role === "STUDENT") {
    body = <StudentClassDetailsClient classId={id} />;
  } else {
    body = <StaffClassDetailsClient classId={id} isCoach={user.role === "COACH"} />;
  }

  return <AppShell>{body}</AppShell>;
}
