"use client";

import { useState } from "react";
import Link from "next/link";
import { RegisterForm } from "@/features/auth/components/RegisterForm";
import { CoachRegisterForm } from "@/features/auth/components/CoachRegisterForm";
import { AuthSplitShell } from "@/features/auth/components/AuthSplitShell";
import { useTheme } from "@/providers/ThemeProvider";

type Role = "student" | "coach";

export default function RegisterPage() {
  const [role, setRole] = useState<Role>("student");
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";

  return (
    <AuthSplitShell
      variant={role === "student" ? "student-register" : "coach-register"}
      cardMaxWidthClass="max-w-[560px]"
    >
      {/* Compact Header */}
      <div className="mb-2.5">
        <h2
          className={`font-[family-name:var(--font-playfair)] text-xl sm:text-2xl font-bold leading-tight ${isDark ? "text-white" : "text-[#071B41]"
            }`}
        >
          Create your account
        </h2>
        <p
          className={`text-xs mt-0.5 ${isDark ? "text-[#C1C4CC]" : "text-[#555C68]"
            }`}
        >
          Already learning with us?{" "}
          <Link
            href="/login"
            className={`font-bold underline-offset-2 hover:underline ${isDark
                ? "text-white hover:text-[#E2B355]"
                : "text-[#071B41] hover:text-[#C58927]"
              }`}
          >
            Log in
          </Link>
        </p>
      </div>

      {/* Role Pill Switcher (Student | Coach) */}
      <div
        role="tablist"
        aria-label="Register as"
        className={`grid grid-cols-2 gap-1.5 mb-3 p-1 rounded-full border ${isDark
            ? "bg-[#0B1D3F] border-white/10"
            : "bg-[#F1F5F9] border-[#E2E8F0]"
          }`}
      >
        <button
          type="button"
          role="tab"
          aria-selected={role === "student"}
          onClick={() => setRole("student")}
          className={`h-8 sm:h-9 rounded-full text-xs sm:text-[13px] font-bold transition-all duration-200 cursor-pointer ${role === "student"
              ? isDark
                ? "bg-gradient-to-r from-[#E5B85B] to-[#CE942E] text-[#071B41] shadow-xs"
                : "bg-[#071B41] text-white shadow-xs"
              : isDark
                ? "text-[#C1C4CC] hover:text-white"
                : "text-[#555C68] hover:text-[#071B41]"
            }`}
        >
          Student
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={role === "coach"}
          onClick={() => setRole("coach")}
          className={`h-8 sm:h-9 rounded-full text-xs sm:text-[13px] font-bold transition-all duration-200 cursor-pointer ${role === "coach"
              ? isDark
                ? "bg-gradient-to-r from-[#E5B85B] to-[#CE942E] text-[#071B41] shadow-xs"
                : "bg-[#071B41] text-white shadow-xs"
              : isDark
                ? "text-[#C1C4CC] hover:text-white"
                : "text-[#555C68] hover:text-[#071B41]"
            }`}
        >
          Coach
        </button>
      </div>

      {/* Active Registration Form */}
      {role === "student" ? <RegisterForm /> : <CoachRegisterForm />}
    </AuthSplitShell>
  );
}