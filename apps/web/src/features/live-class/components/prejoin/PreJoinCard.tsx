"use client";

import { PreJoin } from "@livekit/components-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { RoomEnded } from "../states/ErrorStates";
import { ClassStatus } from "../../types/live-class";
import { useAuthStore } from "@/stores/authStore";

interface PreJoinCardProps {
  status?: ClassStatus;
  topic?: string | null;
  onJoin: () => void;
}

export function PreJoinCard({ status, topic, onJoin }: PreJoinCardProps) {
  const user = useAuthStore((state) => state.user);
  const displayName = user ? `${user.firstName} ${user.lastName || ""}`.trim() : "Student";

  if (status === "COMPLETED") {
    return <RoomEnded />;
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-6">
      <Card className="w-full max-w-[720px] border-app-border/80 bg-app-surface/95 shadow-soft backdrop-blur">
        <CardHeader className="px-5 pb-4 pt-6 text-center sm:px-8">
          <CardTitle className="text-2xl font-extrabold tracking-normal sm:text-3xl">
            {topic ? `Ready to join "${topic}"?` : "Ready to join the class?"}
          </CardTitle>
          <CardDescription className="mx-auto mt-1 max-w-xl text-sm sm:text-base">
            Configure your camera and microphone before entering the class.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-6 sm:px-8">
          <div className="custom-prejoin [&_.lk-username-container]:hidden [&_input[type='text']]:hidden">
            {/* The LiveKit PreJoin component handles the device selection and preview */}
            <PreJoin
              onSubmit={onJoin}
              onValidate={() => true}
              defaults={{
                audioEnabled: true,
                videoEnabled: true,
                username: displayName,
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
