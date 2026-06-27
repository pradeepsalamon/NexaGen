import { Suspense } from "react";

import { MeetingRoom } from "@/components/meeting-room";

type MeetingPageProps = {
  params: Promise<{
    roomId: string;
  }>;
  searchParams: Promise<{
    user?: string | string[];
  }>;
};

export default async function MeetingPage({
  params,
  searchParams,
}: MeetingPageProps) {
  const { roomId } = await params;
  const { user } = await searchParams;
  const userName = Array.isArray(user) ? user[0] : user;

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-muted-foreground">
          Preparing your meeting room...
        </div>
      }
    >
      <MeetingRoom roomId={decodeURIComponent(roomId)} userName={userName} />
    </Suspense>
  );
}
