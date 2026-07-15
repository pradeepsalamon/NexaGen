"use client";

import { motion } from "framer-motion";
import { Users } from "lucide-react";

export function EmptyMeetingState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex h-full w-full flex-col items-center justify-center gap-6 px-4"
    >
      {/* Animated rings */}
      <div className="relative flex items-center justify-center">
        <motion.div
          animate={{ scale: [1, 1.25, 1], opacity: [0.15, 0.05, 0.15] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="absolute size-32 rounded-full border border-blue-500/20 bg-blue-500/5"
        />
        <motion.div
          animate={{ scale: [1, 1.18, 1], opacity: [0.2, 0.08, 0.2] }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.4,
          }}
          className="absolute size-24 rounded-full border border-blue-500/25 bg-blue-500/8"
        />
        <div className="relative flex size-16 items-center justify-center rounded-full bg-[#2563EB]/15 text-[#2563EB]">
          <Users className="size-7" />
        </div>
      </div>

      {/* Text */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-app-text">
          Waiting for participants...
        </h3>
        <p className="mt-1.5 text-sm text-app-muted">
          Share the meeting link to invite others.
        </p>
      </div>

      {/* Subtle loading dots */}
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            animate={{ opacity: [0.2, 0.8, 0.2] }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.3,
            }}
            className="size-1.5 rounded-full bg-[#2563EB]"
          />
        ))}
      </div>
    </motion.div>
  );
}
