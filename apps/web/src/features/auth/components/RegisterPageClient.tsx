"use client";

import { useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { AuthHeader } from "./AuthHeader";
import { AuthSplitShell } from "./AuthSplitShell";
import { CoachRegisterForm } from "./CoachRegisterForm";
import { RegisterForm } from "./RegisterForm";

type Role = "student" | "coach";

export function RegisterPageClient() {
  const [role, setRole] = useState<Role>("student");

  return (
    <AuthSplitShell variant={role === "student" ? "student-register" : "coach-register"} wide>
      <AuthHeader
        description={
          <>
            Already learning with us?{" "}
            <Link className="font-medium text-primary-ink hover:underline" href="/login">
              Log in
            </Link>
          </>
        }
        title="Create your account"
      />

      <Tabs onValueChange={(value) => setRole(value as Role)} value={role}>
        <TabsList aria-label="Register as" className="grid w-full grid-cols-2">
          <TabsTrigger value="student">Student</TabsTrigger>
          <TabsTrigger value="coach">Coach</TabsTrigger>
        </TabsList>
        <TabsContent value="student">
          <RegisterForm />
        </TabsContent>
        <TabsContent value="coach">
          <CoachRegisterForm />
        </TabsContent>
      </Tabs>
    </AuthSplitShell>
  );
}
