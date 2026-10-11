"use client";

import { useEffect, useState } from "react";
import { Loader2, CalendarX } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { API_ROUTES, type CoachTeachingResponse } from "@nexa-chess/types";
import { CoachAttendanceView } from "@/features/attendance/components/CoachAttendanceView";

export default function CoachAttendancePage() {
  const [data, setData] = useState<CoachTeachingResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const result = await apiFetch<CoachTeachingResponse>(API_ROUTES.attendance.coach);
        setData(result);
      } catch (error) {
        console.error("Failed to load teaching stats", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadStats();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-ink" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-[50dvh] text-center">
        <div className="p-4 bg-app-soft rounded-full mb-4">
          <CalendarX className="h-10 w-10 text-app-muted" />
        </div>
        <h2 className="text-xl font-semibold mb-2">No Teaching Data</h2>
        <p className="text-app-muted max-w-md">
          There are no teaching records to display yet.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      <CoachAttendanceView data={data} />
    </div>
  );
}
