"use client";

import { Card } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { AuthHeader } from "@/features/auth/components/AuthHeader";
import { RegisterForm } from "@/features/auth/components/RegisterForm";
import { CoachRegisterForm } from "@/features/auth/components/CoachRegisterForm";

export default function RegisterPage() {
  return (
    <Card className="w-full max-w-[610px] animate-slide-up p-4 sm:p-5">
      <Tabs defaultValue="student">
        <AuthHeader
          actionHref="/login"
          actionLabel="Log in"
          helperText="Already learning with us?"
          title="Register"
          rightContent={
            <TabsList>
              <TabsTrigger value="student">Student</TabsTrigger>
              <TabsTrigger value="coach">Coach</TabsTrigger>
            </TabsList>
          }
        />

        <TabsContent value="student">
          <RegisterForm />
        </TabsContent>
        <TabsContent value="coach">
          <CoachRegisterForm />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
