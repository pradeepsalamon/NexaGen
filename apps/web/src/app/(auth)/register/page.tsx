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
        className="grid grid-cols-2 gap-1 mb-3 p-1 rounded-control bg-app-soft"
      >
        <button
          type="button"
          aria-pressed={role === "student"}
          onClick={() => setRole("student")}
          className={`min-h-[var(--control-h-sm)] rounded-md text-sm font-medium transition-colors cursor-pointer ${role === "student"
              ? "bg-primary text-on-primary"
              : "text-app-muted hover:text-app-text"
            }`}
        >
          Student
        </button>
        <button
          type="button"
          aria-pressed={role === "coach"}
          onClick={() => setRole("coach")}
          className={`min-h-[var(--control-h-sm)] rounded-md text-sm font-medium transition-colors cursor-pointer ${role === "coach"
              ? "bg-primary text-on-primary"
              : "text-app-muted hover:text-app-text"
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