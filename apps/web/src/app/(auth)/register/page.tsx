"use client";

import { useState } from "react";
import Link from "next/link";
import { RegisterForm } from "@/features/auth/components/RegisterForm";
import { CoachRegisterForm } from "@/features/auth/components/CoachRegisterForm";
import { AuthSplitShell } from "@/features/auth/components/AuthSplitShell";

type Role = "student" | "coach";

export default function RegisterPage() {
  const [role, setRole] = useState<Role>("student");

  return (
    <AuthSplitShell
      variant={role === "student" ? "student-register" : "coach-register"}
      cardMaxWidthClass="max-w-[560px]"
    >
      {/* Compact Header */}
      <div className="mb-2.5">
        <h2
          className="font-display text-xl sm:text-2xl font-bold leading-tight text-nx-ink"
        >
          Create your account
        </h2>
        <p
          className="text-xs mt-0.5 text-nx-body"
        >
          Already learning with us?{" "}
          <Link
            href="/login"
            className="font-bold underline-offset-2 hover:underline text-nx-ink hover:text-nx-gold-ink"
          >
            Log in
          </Link>
        </p>
      </div>

      {/* Role Pill Switcher (Student | Coach) */}
      <div
        role="group"
        aria-label="Register as"
        className="grid grid-cols-2 gap-1.5 mb-3 p-1 rounded-full border bg-nx-field border-nx-line"
      >
        <button
          type="button"
          aria-pressed={role === "student"}
          onClick={() => setRole("student")}
          className={`h-8 sm:h-9 rounded-full text-xs sm:text-[13px] font-bold transition-all duration-200 cursor-pointer ${role === "student"
              ? "nx-cta"
              : "text-nx-body hover:text-nx-ink"
            }`}
        >
          Student
        </button>
        <button
          type="button"
          aria-pressed={role === "coach"}
          onClick={() => setRole("coach")}
          className={`h-8 sm:h-9 rounded-full text-xs sm:text-[13px] font-bold transition-all duration-200 cursor-pointer ${role === "coach"
              ? "nx-cta"
              : "text-nx-body hover:text-nx-ink"
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