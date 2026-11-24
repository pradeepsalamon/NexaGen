"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { AuthCard } from "../login-v2/AuthFrame";
import { CoachRegisterForm } from "./CoachRegisterForm";
import { RegisterForm } from "./RegisterForm";

type Role = "student" | "coach";

const STACKED = "[grid-area:1/1] data-[state=inactive]:invisible";

export function RegisterPageClient() {
  const [role, setRole] = useState<Role>("student");
  // Coach is the right-hand tab: its form slides in from the right, Student's from the left.
  const slide = role === "coach" ? "motion-safe:data-[state=active]:animate-tab-in-right" : "motion-safe:data-[state=active]:animate-tab-in-left";

  return (
    <AuthCard wide>
      <Tabs onValueChange={(value) => setRole(value as Role)} value={role}>
        {/* Phones: heading, then the tabs. From `lg` they share one row, so the whole form
            fits a laptop screen without scrolling. Same type as `AuthHeader`.
            "Already have an account?" sits at the foot of each form. */}
        <div className="grid gap-6 lg:flex lg:items-center lg:justify-between lg:gap-6">
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">
            Create your account
          </h1>
          <TabsList aria-label="Register as" className="grid w-full grid-cols-2 lg:w-48 lg:shrink-0 2xl:w-60">
            <TabsTrigger value="student">Student</TabsTrigger>
            <TabsTrigger value="coach">Coach</TabsTrigger>
          </TabsList>
        </div>
        {/* Both forms stay mounted in one grid cell, the hidden one invisible, so the card
            keeps the taller form's size and nothing moves when the tab changes (typed
            values survive a switch too). */}
        <div className="grid">
          <TabsContent className={`${slide} ${STACKED}`} forceMount value="student">
            <RegisterForm />
          </TabsContent>
          <TabsContent className={`${slide} ${STACKED}`} forceMount value="coach">
            <CoachRegisterForm />
          </TabsContent>
        </div>
      </Tabs>
    </AuthCard>
  );
}
