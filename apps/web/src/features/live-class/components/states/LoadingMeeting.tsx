import { Loader2 } from "lucide-react";

export function LoadingMeeting({ message = "Loading class..." }: { message?: string }) {
  return (
    <div className="flex h-[calc(100dvh-4rem)] w-full flex-col items-center justify-center space-y-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-lg font-medium text-muted-foreground">{message}</p>
    </div>
  );
}

export function JoiningRoom() {
  return <LoadingMeeting message="Connecting to Live Class..." />;
}
