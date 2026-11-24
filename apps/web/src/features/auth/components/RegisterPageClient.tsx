"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { cn } from "@/lib/utils";
import { AuthCard } from "../frame/AuthFrame";
import { CoachRegisterForm } from "./CoachRegisterForm";
import { RegisterForm } from "./RegisterForm";

type Role = "student" | "coach";

/**
 * Both forms share one grid cell, so the card keeps the taller form's size. A tab change
 * cross-fades them: the old form fades and slides out toward its own tab while the new one
 * fades and slides in (one eased transition, no keyframes, so a quick double switch
 * reverses smoothly). The hidden form turns `invisible` once it has faded, which keeps it
 * out of tab order and screen readers. Reduced motion: an instant switch.
 */
const PANEL = cn(
  "[grid-area:1/1] transition-[opacity,transform,visibility] duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
  // The Tabs default fade-up would run on top of the cross-fade.
  "data-[state=active]:animate-none motion-safe:data-[state=active]:animate-none",
  "data-[state=inactive]:pointer-events-none data-[state=inactive]:invisible data-[state=inactive]:opacity-0"
);

export function RegisterPageClient() {
  const [role, setRole] = useState<Role>("student");

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
        {/* Both forms stay mounted (PANEL), so typed values survive a switch too. Student is
            the left tab: hidden, it waits to the left; Coach waits to the right. */}
        <div className="grid">
          <TabsContent className={cn(PANEL, "data-[state=inactive]:-translate-x-4")} forceMount value="student">
            <RegisterForm />
          </TabsContent>
          <TabsContent className={cn(PANEL, "data-[state=inactive]:translate-x-4")} forceMount value="coach">
            <CoachRegisterForm />
          </TabsContent>
        </div>
      </Tabs>
    </AuthCard>
  );
}
