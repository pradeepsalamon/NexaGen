"use client";

import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useReducedMotion } from "../../lib/meetingUi";

export function EmptyMeetingState() {
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex h-full w-full flex-col items-center justify-center gap-5 px-4 text-center"
    >
      <div className="relative flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Users className="size-7" />
        {!reducedMotion && (
          <span className="absolute inset-0 rounded-2xl border border-primary/30 motion-safe:animate-ping" />
        )}
      </div>

      <div>
        <h3 className="text-lg font-semibold text-app-text">
          {isCoach ? "Waiting for students to join" : "Waiting for the class to fill up"}
        </h3>
        <p className="mt-1 text-sm text-app-muted">
          {isCoach
            ? "Students will appear here as they arrive."
            : "Your coach and classmates will appear here as they join."}
        </p>
      </div>
    </motion.div>
  );
}
