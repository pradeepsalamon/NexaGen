import { useEffect, useRef, useState } from "react";
import { CircleAlert, DoorClosed, Loader2, LockKeyhole, PlugZap, Rocket, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { getRoleDashboardHref, isStaffRole, useAuthStore } from "@/stores/authStore";
import { getLiveClass, requestWaitingRoomAdmission, startLiveClass } from "../../api/live-class";
import { EndClassButton } from "../EndClassButton";

const COACH_JOIN_POLL_INTERVAL_MS = 5000;
const WAITING_FOR_ADMIT_POLL_INTERVAL_MS = 5000;

interface StateLayoutProps {
  icon: React.ReactNode;
  tone?: "neutral" | "danger";
  title: string;
  message: string;
  children?: React.ReactNode;
}

/** Bare content block — the surrounding full-height chrome comes from
 *  `ClassroomStateShell`, so this only lays out the icon / copy / actions. */
function StateLayout({ icon, tone = "neutral", title, message, children }: StateLayoutProps) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center py-12 text-center">
      <div
        className={
          "mb-6 flex size-16 items-center justify-center rounded-app " +
          (tone === "danger" ? "bg-app-danger/10 text-app-danger" : "bg-primary/10 text-primary-ink")
        }
      >
        {icon}
      </div>
      <h2 className="mb-2 text-xl font-bold tracking-tight text-app-text">{title}</h2>
      <p className="mb-7 text-sm leading-relaxed text-app-muted">{message}</p>
      {children && <div className="flex flex-wrap items-center justify-center gap-3">{children}</div>}
    </div>
  );
}

function useDashboardHref() {
  const user = useAuthStore((state) => state.user);
  return getRoleDashboardHref(user?.role);
}

export function ConnectionLost({
  classId,
  onEnded,
  onRetry,
  title = "Connection lost",
  message = "We lost the connection to the classroom. Check your internet and try again.",
  detail,
}: {
  /** Lets a coach/admin end the class from here when they can't get back in. */
  classId?: string;
  onEnded?: () => void;
  onRetry?: () => void;
  title?: string;
  message?: string;
  /** The raw reason, small print — what support needs to diagnose a report. */
  detail?: string | null;
}) {
  const dashboardUrl = useDashboardHref();
  const role = useAuthStore((state) => state.user?.role);
  const canEnd = Boolean(classId) && (role === "COACH" || isStaffRole(role));
  return (
    <StateLayout
      icon={<WifiOff className="size-8" />}
      tone="danger"
      title={title}
      message={message}
    >
      {onRetry && (
        <Button onClick={onRetry} variant="outline">
          Try again
        </Button>
      )}
      <Button asChild>
        <a href={dashboardUrl}>Return to dashboard</a>
      </Button>
      {canEnd && classId && (
        <div className="basis-full pt-2">
          <EndClassButton classId={classId} onEnded={onEnded ?? (() => window.location.reload())} />
        </div>
      )}
      {detail ? <p className="basis-full pt-2 text-center text-xs text-app-muted">{detail}</p> : null}
    </StateLayout>
  );
}

export function RemovedFromClass() {
  const dashboardUrl = useDashboardHref();
  return (
    <StateLayout
      icon={<DoorClosed className="size-8" />}
      tone="danger"
      title="Removed from class"
      message="Your coach removed you from this class. If you think this was a mistake, ask them to bring you back in."
    >
      <Button asChild>
        <a href={dashboardUrl}>Return to dashboard</a>
      </Button>
    </StateLayout>
  );
}

export function PermissionDenied() {
  const dashboardUrl = useDashboardHref();
  return (
    <StateLayout
      icon={<LockKeyhole className="size-8" />}
      tone="danger"
      title="Access denied"
      message="You don't have permission to join this class. Make sure you're signed in with the right account."
    >
      <Button asChild>
        <a href={dashboardUrl}>Return to dashboard</a>
      </Button>
    </StateLayout>
  );
}

export function RoomEnded() {
  const dashboardUrl = useDashboardHref();
  return (
    <StateLayout
      icon={<CircleAlert className="size-8" />}
      title="Class ended"
      message="This live class has concluded. Thank you for participating."
    >
      <Button asChild>
        <a href={dashboardUrl}>Return to dashboard</a>
      </Button>
    </StateLayout>
  );
}

export function ClassNotStarted({ roomId, onRetry }: { roomId?: string; onRetry?: () => void }) {
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const [isStarting, setIsStarting] = useState(false);
  const dashboardUrl = getRoleDashboardHref(user?.role);

  // Students silently poll for the class to go live.
  useEffect(() => {
    if (isCoach || !roomId || !onRetry) return;

    let mounted = true;
    const interval = setInterval(async () => {
      try {
        const classDetails = await getLiveClass(roomId);
        if (classDetails.status === "LIVE" && mounted) {
          onRetry();
        }
      } catch {
        // still not started
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
      toast.error(err instanceof Error ? err.message : "Failed to start class");
      setIsStarting(false);
    }
  };

  if (isCoach) {
    return (
      <StateLayout
        icon={<Rocket className="size-8" />}
        title="Ready to begin?"
        message="Students are waiting in the waiting room. Start the class when you're ready."
      >
        <Button onClick={handleStartClass} disabled={isStarting} size="lg">
          {isStarting && <Loader2 className="mr-2 size-4 animate-spin" />}
          Start class now
        </Button>
      </StateLayout>
    );
  }

  return (
    <StateLayout
      icon={<Loader2 className="size-8 animate-spin" />}
      title="Waiting room"
      message="Waiting for the coach to start the class. You'll join automatically once it begins."
    >
      <Button asChild variant="outline">
        <a href={dashboardUrl}>Return to dashboard</a>
      </Button>
    </StateLayout>
  );
}

/**
 * AUDIT H14: the coach's LiveKit token comes up before the student's; a student
 * polling in that gap hits `COACH_NOT_JOINED`. This is the dedicated,
 * self-retrying screen for that (common, non-terminal) condition.
 */
export function WaitingForCoach({
  onRetry,
}: {
  onRetry: (options?: { silent?: boolean }) => void;
}) {
  const dashboardUrl = useDashboardHref();
  const onRetryRef = useRef(onRetry);
  onRetryRef.current = onRetry;

  useEffect(() => {
    const interval = setInterval(() => {
      onRetryRef.current({ silent: true });
    }, COACH_JOIN_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <StateLayout
      icon={<PlugZap className="size-8" />}
      title="Waiting for your coach"
      message="The class is live, but your coach hasn't joined the room yet. You'll be connected automatically the moment they do — no need to refresh."
    >
      <Button asChild variant="outline">
        <a href={dashboardUrl}>Return to dashboard</a>
      </Button>
    </StateLayout>
  );
}

/**
 * This class's waiting-room policy requires the coach to let each student in
 * individually. The request was already recorded by the API on the first
 * failed token call — this screen just self-retries until it's resolved,
 * same silent-poll pattern as `WaitingForCoach`.
 */
export function WaitingForAdmit({
  onRetry,
}: {
  onRetry: (options?: { silent?: boolean }) => void;
}) {
  const dashboardUrl = useDashboardHref();
  const onRetryRef = useRef(onRetry);
  onRetryRef.current = onRetry;

  useEffect(() => {
    const interval = setInterval(() => {
      onRetryRef.current({ silent: true });
    }, WAITING_FOR_ADMIT_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <StateLayout
      icon={<Loader2 className="size-8 animate-spin" />}
      title="Waiting to be let in"
      message="Your coach needs to admit you before you can join. You'll be connected automatically as soon as they do."
    >
      <Button asChild variant="outline">
        <a href={dashboardUrl}>Return to dashboard</a>
      </Button>
    </StateLayout>
  );
}

/** The coach denied this student's request to join. */
export function JoinDenied({ roomId, onRequested }: { roomId: string; onRequested: () => void }) {
  const dashboardUrl = useDashboardHref();
  const [isRequesting, setIsRequesting] = useState(false);

  const handleRequestAgain = async () => {
    setIsRequesting(true);
    try {
      await requestWaitingRoomAdmission(roomId);
      onRequested();
    } catch (err) {
      console.error("Failed to request admission again", err);
      toast.error(err instanceof Error ? err.message : "Failed to request admission");
      setIsRequesting(false);
    }
  };

  return (
    <StateLayout
      icon={<DoorClosed className="size-8" />}
      tone="danger"
      title="Not admitted"
      message="Your coach didn't let you into this class. You can ask again, or check with them directly."
    >
      <Button onClick={handleRequestAgain} disabled={isRequesting}>
        {isRequesting && <Loader2 className="mr-2 size-4 animate-spin" />}
        Request again
      </Button>
      <Button asChild variant="outline">
        <a href={dashboardUrl}>Return to dashboard</a>
      </Button>
    </StateLayout>
  );
}
