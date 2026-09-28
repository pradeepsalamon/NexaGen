"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { AuthHeader } from "@/features/auth/components/AuthHeader";
import { RegisterForm } from "@/features/auth/components/RegisterForm";
import { CoachRegisterForm } from "@/features/auth/components/CoachRegisterForm";
import { cn } from "@/lib/utils";

type Role = "student" | "coach";

const TRIGGER_CLASS =
  "relative z-10 px-6 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:hover:bg-transparent";

export default function RegisterPage() {
  const [role, setRole] = useState<Role>("student");
  // null until the first switch, so the initial render doesn't animate.
  const [direction, setDirection] = useState<"left" | "right" | null>(null);

  const handleChange = (next: string) => {
    if (next === role) return;
    setDirection(next === "coach" ? "right" : "left");
    setRole(next as Role);
  };

  const contentClass = cn(
    direction === "right" && "motion-safe:data-[state=active]:animate-tab-in-right",
    direction === "left" && "motion-safe:data-[state=active]:animate-tab-in-left"
  );

  return (
    <div className="w-full max-w-[720px] animate-slide-up p-2 sm:p-4 [@media(max-height:700px)]:py-0">
      <Tabs className="gap-4 [@media(max-height:700px)]:gap-2" onValueChange={handleChange} value={role}>
        <div className="border-b border-app-border pb-4 [@media(max-height:700px)]:pb-2">
          <AuthHeader
            actionHref="/login"
            actionLabel="Log in"
            helperText="Already learning with us?"
            title="Create Account"
            rightContent={
              <TabsList aria-label="Register as" className="relative grid grid-cols-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-y-1 left-1 w-[calc(50%-6px)] rounded-full bg-accent shadow-[0_4px_12px_-4px_rgb(var(--rgb-accent)/0.6)] motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]",
                    role === "coach" && "translate-x-[calc(100%+4px)]"
                  )}
                />
                <TabsTrigger className={TRIGGER_CLASS} value="student">Student</TabsTrigger>
                <TabsTrigger className={TRIGGER_CLASS} value="coach">Coach</TabsTrigger>
              </TabsList>
            }
          />
        </div>

        <TabsContent className={contentClass} value="student">
          <RegisterForm />
        </TabsContent>
        <TabsContent className={contentClass} value="coach">
          <CoachRegisterForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
