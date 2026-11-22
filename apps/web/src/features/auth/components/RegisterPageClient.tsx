"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { AuthSplitShell } from "./AuthSplitShell";
import { CoachRegisterForm } from "./CoachRegisterForm";
import { RegisterForm } from "./RegisterForm";
import { LoginPrompt } from "./RegistrationConsent";

type Role = "student" | "coach";

export function RegisterPageClient() {
  const [role, setRole] = useState<Role>("student");
  // Coach is the right-hand tab: its form slides in from the right, Student's from the left.
  const slide = role === "coach" ? "motion-safe:data-[state=active]:animate-tab-in-right" : "motion-safe:data-[state=active]:animate-tab-in-left";

  return (
    <AuthSplitShell variant={role === "student" ? "student-register" : "coach-register"} wide>
      <Tabs onValueChange={(value) => setRole(value as Role)} value={role}>
        {/* Phones: heading, then the tabs, and "Already have an account?" under each form.
            From `lg` the heading (with that prompt) and the tabs share one row, so the whole
            form fits a laptop screen without scrolling. Same type as `AuthHeader`. */}
        <div className="grid gap-6 lg:flex lg:items-center lg:justify-between lg:gap-6">
          <div className="grid gap-1">
            <h1 className="login-v2-serif text-3xl font-bold leading-tight tracking-tight text-app-text sm:text-4xl lg:text-[1.625rem] 2xl:text-3xl">
              Create your account
            </h1>
            <LoginPrompt className="hidden text-left lg:block" />
          </div>
          <TabsList aria-label="Register as" className="grid w-full grid-cols-2 lg:w-48 lg:shrink-0 2xl:w-60">
            <TabsTrigger value="student">Student</TabsTrigger>
            <TabsTrigger value="coach">Coach</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent className={slide} value="student">
          <RegisterForm />
        </TabsContent>
        <TabsContent className={slide} value="coach">
          <CoachRegisterForm />
        </TabsContent>
      </Tabs>
    </AuthSplitShell>
  );
}
