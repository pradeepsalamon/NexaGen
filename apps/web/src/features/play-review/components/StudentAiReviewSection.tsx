"use client";

import { useAuthStore } from "@/stores/authStore";
import { AiReviewConsentCard } from "./AiReviewConsentCard";

/** Profile → the student's own outside-AI switch (students only). */
export function StudentAiReviewSection() {
  const role = useAuthStore((state) => state.user?.role);
  return role === "STUDENT" ? <AiReviewConsentCard studentId={null} /> : null;
}
