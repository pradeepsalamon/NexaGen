"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { AuthHeader } from "./AuthHeader";
import { AuthSplitShell } from "./AuthSplitShell";
import { CoachRegisterForm } from "./CoachRegisterForm";
import { RegisterForm } from "./RegisterForm";

type Role = "student" | "coach";

export function RegisterPageClient() {
  const [role, setRole] = useState<Role>("student");
  // Coach is the right-hand tab: its form slides in from the right, Student's from the left.
  const slide = role === "coach" ? "motion-safe:data-[state=active]:animate-tab-in-right" : "motion-safe:data-[state=active]:animate-tab-in-left";

  return (
    <AuthSplitShell variant={role === "student" ? "student-register" : "coach-register"} wide>
      {/* "Already have an account?" sits under each form, as on the login page. */}
      <AuthHeader title="Create your account" />

      <Tabs onValueChange={(value) => setRole(value as Role)} value={role}>
        <TabsList aria-label="Register as" className="grid w-full grid-cols-2">
          <TabsTrigger value="student">Student</TabsTrigger>
          <TabsTrigger value="coach">Coach</TabsTrigger>
        </TabsList>
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
