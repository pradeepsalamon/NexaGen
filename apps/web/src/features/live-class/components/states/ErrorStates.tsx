import { useState, useEffect } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/stores/authStore";
import { getLiveClass, startLiveClass } from "../../api/live-class";

interface ErrorStateProps {
  title: string;
  message: string;
  onRetry?: () => void;
  actionText?: string;
  actionHref?: string;
}

function ErrorState({ title, message, onRetry, actionText, actionHref }: ErrorStateProps) {
  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col items-center justify-center p-4 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10 mb-6">
        <AlertCircle className="h-10 w-10 text-destructive" />
      </div>
      <h2 className="mb-2 text-2xl font-bold tracking-tight">{title}</h2>
      <p className="mb-8 max-w-md text-muted-foreground">{message}</p>

      <div className="flex gap-4">
        {onRetry && (
          <Button onClick={onRetry} variant="outline">
            Try Again
          </Button>
        )}
        {actionHref && (
          <Button asChild>
            <a href={actionHref}>{actionText || "Go Back"}</a>
          </Button>
        )}
      </div>
    </div>
  );
}

export function ConnectionLost({ onRetry }: { onRetry?: () => void }) {
  const user = useAuthStore((state) => state.user);
  const dashboardUrl = user?.role === "COACH" ? "/dashboard/coach" : "/dashboard/student";

  return (
    <ErrorState
      title="Connection Lost"
      message="We lost connection to the class room. Please check your internet connection and try again."
      onRetry={onRetry}
      actionText="Return to Dashboard"
      actionHref={dashboardUrl}
    />
  );
}

export function PermissionDenied() {
  const user = useAuthStore((state) => state.user);
  const dashboardUrl = user?.role === "COACH" ? "/dashboard/coach" : "/dashboard/student";

  return (
    <ErrorState
      title="Access Denied"
      message="You don't have permission to join this class. Please ensure you are logged in with the correct account."
      actionText="Return to Dashboard"
      actionHref={dashboardUrl}
    />
  );
}

export function RoomEnded() {
  const user = useAuthStore((state) => state.user);
  const dashboardUrl = user?.role === "COACH" ? "/dashboard/coach" : "/dashboard/student";

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col items-center justify-center p-4 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
        <span className="text-4xl">👋</span>
      </div>
      <h2 className="mb-2 text-2xl font-bold tracking-tight">Class Ended</h2>
      <p className="mb-8 max-w-md text-muted-foreground">
        This live class has concluded. Thank you for participating.
      </p>
      <Button asChild>
        <a href={dashboardUrl}>Return to Dashboard</a>
      </Button>
    </div>
  );
}

export function ClassNotStarted({ roomId, onRetry }: { roomId?: string; onRetry?: () => void }) {
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH";
  const [isStarting, setIsStarting] = useState(false);

  // For students, silently poll to check if class started
  useEffect(() => {
    if (isCoach || !roomId || !onRetry) return;

    let mounted = true;
    const interval = setInterval(async () => {
      try {
        const classDetails = await getLiveClass(roomId);
        if (classDetails.status === "LIVE" && mounted) {
          onRetry(); // Trigger the main hook to connect
        }
      } catch (err) {
        // Still not started or errored, ignore
      }
    }, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isCoach, roomId, onRetry]);

  const handleStartClass = async () => {
    if (!roomId || !onRetry) return;
    try {
      setIsStarting(true);
      await startLiveClass(roomId);
      onRetry();
    } catch (err) {
      console.error("Failed to start class", err);
      setIsStarting(false);
    }
  };

  if (isCoach) {
    return (
      <div className="flex h-[calc(100vh-4rem)] w-full flex-col items-center justify-center p-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 mb-6">
          <span className="text-4xl">🚀</span>
        </div>
        <h2 className="mb-2 text-2xl font-bold tracking-tight">Ready to begin?</h2>
        <p className="mb-8 max-w-md text-muted-foreground">
          Students are waiting in the waiting room. Start the class when you are ready.
        </p>
        <Button onClick={handleStartClass} disabled={isStarting} size="lg">
          {isStarting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Start Class Now
        </Button>
      </div>
    );
  }

  const dashboardUrl = user?.role === "COACH" ? "/dashboard/coach" : "/dashboard/student";

  // Waiting Room for students
  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col items-center justify-center p-4 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 mb-6 relative">
        <Loader2 className="absolute h-10 w-10 text-primary animate-spin" />
      </div>
      <h2 className="mb-2 text-2xl font-bold tracking-tight">Waiting Room</h2>
      <p className="mb-8 max-w-md text-muted-foreground">
        Waiting for the coach to start the class. You will join automatically once it begins.
      </p>
      <div className="flex gap-4">
        <Button asChild variant="outline">
          <a href={dashboardUrl}>Return to Dashboard</a>
        </Button>
      </div>
    </div>
  );
}
