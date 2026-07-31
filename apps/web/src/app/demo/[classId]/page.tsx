"use client";

import "@livekit/components-styles";
import "@livekit/components-styles/prefabs";

import { useState } from "react";
import { useParams } from "next/navigation";
import { LiveClassProvider } from "@/features/live-class/providers/LiveClassProvider";
import { MeetingRoom } from "@/features/live-class/components/room/MeetingRoom";
import { LoadingMeeting } from "@/features/live-class/components/states/LoadingMeeting";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import { API_ROUTES } from "@nexa-gen/types";
import { useToast } from "@/providers/ToastProvider";

export default function DemoClassPage() {
  const params = useParams();
  const classId = params.classId as string;

  const [guestName, setGuestName] = useState("");
  const [hasJoined, setHasJoined] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [topic, setTopic] = useState("Demo Class");
  const [isJoining, setIsJoining] = useState(false);
  const toast = useToast();

  const headerCenter = (
    <h1 className="max-w-[42vw] truncate text-center text-sm font-extrabold text-app-text sm:max-w-none sm:text-base">
      {topic}
    </h1>
  );

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) return;

    setIsJoining(true);

    try {
      const response = await apiFetch<{ token: string; topic: string }>(
        API_ROUTES.liveClass.demoJoin(classId),
        {
          method: "POST",
          body: JSON.stringify({ guestName: guestName.trim() }),
        }
      );

      setToken(response.token);
      setTopic(response.topic);
      setHasJoined(true);
    } catch (err: any) {
      toast.error({ title: err.message || "Failed to join demo class. Ensure the class is live." });
    } finally {
      setIsJoining(false);
    }
  };

  if (!hasJoined) {
    return (
      <div className="flex flex-col h-screen">
        <Header centerSlot={headerCenter} />
        <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 pt-16 flex items-center justify-center p-4">
          <Card className="w-full max-w-md shadow-lg border-primary/10">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl text-primary">Join Demo Class</CardTitle>
              <CardDescription>Enter your name to join the live session</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleJoin} className="space-y-4">

                
                <div className="space-y-2">
                  <Input
                    type="text"
                    placeholder="Your Full Name"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    disabled={isJoining}
                    required
                    className="h-12 text-lg px-4 bg-background/50 focus:bg-background"
                  />
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full h-12 text-lg font-semibold rounded-xl"
                  disabled={!guestName.trim() || isJoining}
                >
                  {isJoining ? "Connecting..." : "Join Class"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex flex-col h-screen">
        <Header centerSlot={headerCenter} />
        <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 pt-16 flex items-center justify-center">
          <LoadingMeeting message="Connecting to room..." />
        </div>
      </div>
    );
  }

  return (
    <LiveClassProvider topic={topic}>
      <MeetingRoom token={token} />
    </LiveClassProvider>
  );
}
