"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { useAuthStore } from "@/stores/authStore";
import { usePendingFeedbackQuery } from "../hooks/useFeedbackApi";
import { FeedbackItemCard } from "./FeedbackItemCard";

/**
 * "Class-ended screen" placement: the feedback forms an admin placed there,
 * for the class that just ended. Students only; renders nothing otherwise.
 */
export function ClassEndFeedback({ classId }: { classId: string }) {
  const role = useAuthStore((state) => state.user?.role);
  const isStudent = role === "STUDENT";
  const [answered, setAnswered] = useState(0);

  // The screen can load a moment before the server marks the class COMPLETED,
  // so an empty answer is re-checked a few times.
  const { data } = usePendingFeedbackQuery(
    { classId, placement: "CLASS_END" },
    isStudent,
    { retryWhileEmpty: answered === 0 }
  );

  if (!isStudent) return null;

  const items = data?.items ?? [];
  if (items.length === 0) {
    return answered > 0 ? (
      <Card className="border-success/30 bg-app-surface">
        <CardContent className="flex items-center gap-3 p-5">
          <CheckCircle2 aria-hidden="true" className="size-5 text-success-ink" strokeWidth={2.5} />
          <p className="text-sm font-semibold text-app-text">Thanks — your feedback helps your coach.</p>
        </CardContent>
      </Card>
    ) : null;
  }

  return (
    <div className="grid gap-4">
      {items.map((item) => (
        <FeedbackItemCard
          item={item}
          key={`${item.formId}|${item.coachId}|${item.contextKey}`}
          onDone={() => setAnswered((n) => n + 1)}
        />
      ))}
    </div>
  );
}
