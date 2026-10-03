"use client";

import { useQuery } from "@tanstack/react-query";
import { GraduationCap, UserRoundCheck } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { getPendingCoaches, getPendingStudents } from "@/features/admin/api/adminApi";
import { queryKeys } from "@/lib/queryKeys";
import { useAuthStore } from "@/stores/authStore";
import { PendingCoachesPanel } from "./PendingCoachesPanel";
import { PendingStudentsPanel } from "./PendingStudentsPanel";

type Tab = "students" | "coaches";

function CountBadge({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <span className="min-w-5 rounded-full bg-primary px-1.5 text-center text-xs font-bold leading-5 text-white">
      {count}
    </span>
  );
}

export function ApprovalsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Coach applications are super-admin only on the API.
  const canReviewCoaches = useAuthStore((state) => state.user?.role === "SUPER_ADMIN");

  const tab: Tab = canReviewCoaches && searchParams.get("tab") === "coaches" ? "coaches" : "students";

  const students = useQuery({ queryKey: queryKeys.admin.pendingStudents, queryFn: getPendingStudents });
  const coaches = useQuery({
    enabled: canReviewCoaches,
    queryKey: queryKeys.admin.pendingCoaches,
    queryFn: getPendingCoaches
  });

  const setTab = (next: string) => router.replace(`${pathname}?tab=${next}`, { scroll: false });

  return (
    <div className="grid gap-6 pb-10">
      <PageHeader
        description="Review self-registered students and coach applications. Nobody can sign in until approved."
        title="Approvals"
      />

      <Tabs onValueChange={setTab} value={tab}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit sm:justify-self-end">
          <TabsTrigger value="students">
            <UserRoundCheck aria-hidden="true" className="size-4" />
            Students
            <CountBadge count={students.data?.students.length} />
          </TabsTrigger>
          {canReviewCoaches ? (
            <TabsTrigger value="coaches">
              <GraduationCap aria-hidden="true" className="size-4" />
              Coaches
              <CountBadge count={coaches.data?.coaches.length} />
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent className="mt-2" value="students">
          <PendingStudentsPanel data={students.data} isLoading={students.isLoading} />
        </TabsContent>
        {canReviewCoaches ? (
          <TabsContent className="mt-2" value="coaches">
            <PendingCoachesPanel data={coaches.data} isLoading={coaches.isLoading} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
