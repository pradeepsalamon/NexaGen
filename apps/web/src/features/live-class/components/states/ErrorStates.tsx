import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";

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
  return (
    <ErrorState
      title="Connection Lost"
      message="We lost connection to the class room. Please check your internet connection and try again."
      onRetry={onRetry}
      actionText="Return to Dashboard"
      actionHref="/dashboard/student" // We could make this dynamic later
    />
  );
}

export function PermissionDenied() {
  return (
    <ErrorState
      title="Access Denied"
      message="You don't have permission to join this class. Please ensure you are logged in with the correct account."
      actionText="Return to Dashboard"
      actionHref="/dashboard/student"
    />
  );
}

export function RoomEnded() {
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
        <a href="/dashboard/student">Return to Dashboard</a>
      </Button>
    </div>
  );
}

export function ClassNotStarted({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorState
      title="Class Not Started"
      message="The coach has not started this live class yet. Please wait a moment and try again."
      onRetry={onRetry}
      actionText="Return to Dashboard"
      actionHref="/dashboard/student"
    />
  );
}
