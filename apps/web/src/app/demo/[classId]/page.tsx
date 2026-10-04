"use client";

import "@livekit/components-styles";
import "@livekit/components-styles/prefabs";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { LiveClassProvider } from "@/features/live-class/providers/LiveClassProvider";
import { MeetingRoom } from "@/features/live-class/components/room/MeetingRoom";
import { ClassroomSessionManager } from "@/features/live-class/providers/ClassroomSessionManager";
import { LoadingMeeting } from "@/features/live-class/components/states/LoadingMeeting";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/lib/api";
import {
  API_ROUTES,
  type DemoClassPublicInfo,
  type DemoRegistrationContactMethod,
  type GuestJoinDemoRequest,
  type GuestJoinDemoResponse
} from "@nexa-chess/types";
import { useToast } from "@/providers/ToastProvider";
import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { CalendarClock, CalendarX, Hourglass, KeyRound, Mail, Phone, ShieldCheck } from "lucide-react";

const WAITING_POLL_MS = 20_000;
// The coach is in the room deciding — keep the wait for their click short.
const APPROVAL_POLL_MS = 5_000;

type FormValues = {
  guestName: string;
  contactMethod: DemoRegistrationContactMethod;
  phoneNumber: string;
  email: string;
  passcode: string;
};

type Phase = "loading" | "unavailable" | "form" | "waiting" | "approval" | "in-room";

export default function DemoClassPage() {
  return (
    <Suspense fallback={<LoadingMeeting message="Loading class..." />}>
      <DemoClassJoin />
    </Suspense>
  );
}

function DemoClassJoin() {
  const params = useParams();
  const idOrSlug = params.classId as string;
  const searchParams = useSearchParams();
  const toast = useToast();

  const [info, setInfo] = useState<DemoClassPublicInfo | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(searchParams.get("invite"));
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const [values, setValues] = useState<FormValues>({
    guestName: "",
    contactMethod: "PHONE",
    phoneNumber: "",
    email: "",
    passcode: "",
  });
  const [phase, setPhase] = useState<Phase>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [waitingMessage, setWaitingMessage] = useState<string | null>(null);
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const requestRef = useRef<GuestJoinDemoRequest | null>(null);

  const classId = info?.classId ?? idOrSlug;
  const topic = info?.topic ?? "Demo Class";
  const browserTimeZone =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

  const attemptJoin = useCallback(
    async (request: GuestJoinDemoRequest, targetClassId: string, opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setIsSubmitting(true);
      requestRef.current = request;
      try {
        const response = await apiFetch<GuestJoinDemoResponse>(API_ROUTES.liveClass.demoJoin(targetClassId), {
          method: "POST",
          body: JSON.stringify(request),
        });

        if (response.joined && response.token) {
          setToken(response.token);
          setPhase("in-room");
        } else {
          setWaitingMessage(response.message);
          setPhase(response.awaitingApproval ? "approval" : "waiting");
        }
      } catch (err) {
        const code = err instanceof ApiError ? err.code : undefined;
        const message = err instanceof Error ? err.message : "Failed to join demo class.";
        if (code === "DEMO_INVITE_INVALID") {
          // Fall back to the regular form — the phone/email may still match.
          setInviteToken(null);
          setPhase("form");
          if (!opts.silent) toast.warning({ title: message });
        } else if (code === "DEMO_PASSCODE_INVALID") {
          setPasscodeError(message);
          setPhase("form");
        } else if (code === "JOIN_DENIED") {
          setUnavailableMessage(message);
          setPhase("unavailable");
        } else if (!opts.silent) {
          toast.error({ title: message });
        }
      } finally {
        if (!opts.silent) setIsSubmitting(false);
      }
    },
    [toast]
  );

  // Resolve the link first: a slug becomes this week's session, and a
  // personal invite skips the form entirely.
  useEffect(() => {
    let cancelled = false;
    const invite = searchParams.get("invite");
    apiFetch<DemoClassPublicInfo>(
      API_ROUTES.liveClass.demoInfo(idOrSlug) + (invite ? `?invite=${encodeURIComponent(invite)}` : "")
    )
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        if (data.status === "COMPLETED" || data.status === "CANCELLED") {
          setUnavailableMessage(
            data.status === "CANCELLED" ? "This demo class has been cancelled." : "This demo class has already ended."
          );
          setPhase("unavailable");
        } else if (invite && data.invitee) {
          setValues((v) => ({ ...v, guestName: data.invitee?.name ?? "" }));
          void attemptJoin({ inviteToken: invite }, data.classId);
        } else {
          setInviteToken(null);
          setPhase("form");
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setUnavailableMessage(err instanceof Error ? err.message : "This demo class was not found.");
        setPhase("unavailable");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idOrSlug]);

  // Quietly re-checks while the guest waits — the server reuses the same
  // registration, so a poll never re-registers or re-notifies anyone.
  useEffect(() => {
    if ((phase !== "waiting" && phase !== "approval") || !info) return;
    const interval = setInterval(() => {
      if (requestRef.current) void attemptJoin(requestRef.current, info.classId, { silent: true });
    }, phase === "approval" ? APPROVAL_POLL_MS : WAITING_POLL_MS);
    return () => clearInterval(interval);
  }, [phase, info, attemptJoin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const contactReady =
      values.contactMethod === "EMAIL" ? values.email.trim() : values.phoneNumber.trim();
    if (!info || !values.guestName.trim() || !contactReady) return;
    setPasscodeError(null);

    await attemptJoin(
      {
        guestName: values.guestName.trim(),
        contactMethod: values.contactMethod,
        ...(values.contactMethod === "EMAIL"
          ? { email: values.email.trim() }
          : { phoneNumber: values.phoneNumber.trim() }),
        ...(info.accessMode === "PASSCODE" && values.passcode.trim() ? { passcode: values.passcode.trim() } : {}),
      },
      info.classId
    );
  };

  const headerCenter = (
    <h1 className="max-w-[42vw] truncate text-center text-sm font-extrabold text-app-text sm:max-w-none sm:text-base">
      {topic}
    </h1>
  );

  const shell = (children: React.ReactNode) => (
    <div className="flex h-screen flex-col">
      <Header centerSlot={headerCenter} />
      <div className="flex flex-1 items-center justify-center overflow-auto bg-app-soft p-4 pt-16">{children}</div>
    </div>
  );

  if (phase === "in-room" && token) {
    return (
      <LiveClassProvider topic={topic}>
        <ClassroomSessionManager roomId={classId}>
          <MeetingRoom token={token} classId={classId} />
        </ClassroomSessionManager>
      </LiveClassProvider>
    );
  }

  if (phase === "loading" || phase === "in-room") {
    return shell(<LoadingMeeting message={inviteToken ? "Checking your invitation..." : "Loading class..."} />);
  }

  if (phase === "unavailable") {
    return shell(
      <Card className="w-full max-w-md border-primary/10 shadow-lift">
        <CardHeader className="text-center">
          <CalendarX className="mx-auto mb-2 size-10 text-app-muted" />
          <CardTitle className="text-2xl text-app-text">Can&apos;t join right now</CardTitle>
          <CardDescription>{unavailableMessage ?? "This demo class is not available."}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (phase === "waiting" || phase === "approval") {
    const awaitingCoach = phase === "approval";
    return shell(
      <Card className="w-full max-w-md border-primary/10 shadow-lift">
        <CardHeader className="text-center">
          {awaitingCoach ? (
            <Hourglass className="mx-auto mb-2 size-10 text-primary-ink" />
          ) : (
            <CalendarClock className="mx-auto mb-2 size-10 text-primary-ink" />
          )}
          <CardTitle className="text-2xl text-primary-ink">
            {awaitingCoach ? "Waiting for the coach" : values.guestName ? `You're registered, ${values.guestName}!` : "You're registered!"}
          </CardTitle>
          <CardDescription>
            {waitingMessage ?? "We'll see you when the class goes live."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {info && (
            <p className="text-sm text-app-muted">
              Scheduled for {formatDateTime(info.startsAt, browserTimeZone)} your time
              {info.coachName ? ` with ${info.coachName}` : ""}.
            </p>
          )}
          <p className="text-xs text-app-muted">
            Keep this page open. You&apos;ll be taken in automatically.
          </p>
          <Button
            variant="outline"
            className="h-11 w-full"
            disabled={isSubmitting}
            onClick={() => info && requestRef.current && void attemptJoin(requestRef.current, info.classId)}
          >
            {isSubmitting ? "Checking…" : "Check now"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const accessMode = info?.accessMode ?? "PUBLIC";

  return shell(
    <Card className="w-full max-w-md border-primary/10 shadow-lift">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl text-primary-ink">Join Demo Class</CardTitle>
        <CardDescription>
          {info ? `${formatDateTime(info.startsAt, browserTimeZone)} with ${info.coachName}` : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {accessMode === "INVITE_ONLY" && (
          <p className="mb-4 flex gap-2 rounded-control border border-info/40 bg-info/10 p-3 text-sm text-info-ink">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            This class is for invited guests. Use the phone number or email your invitation was sent to. Otherwise the coach can let you in.
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="text"
            placeholder="Your Full Name"
            aria-label="Your full name"
            value={values.guestName}
            onChange={(e) => setValues((v) => ({ ...v, guestName: e.target.value }))}
            disabled={isSubmitting}
            required
            maxLength={50}
            className="h-12 bg-app-background/50 px-4 text-lg focus:bg-app-background"
          />

          <div className="flex rounded-control border border-app-border bg-app-soft p-1 text-sm font-medium">
            <ContactMethodTab
              label="Mobile Number"
              icon={<Phone className="size-4" />}
              active={values.contactMethod === "PHONE"}
              onClick={() => setValues((v) => ({ ...v, contactMethod: "PHONE" }))}
              disabled={isSubmitting}
            />
            <ContactMethodTab
              label="Email"
              icon={<Mail className="size-4" />}
              active={values.contactMethod === "EMAIL"}
              onClick={() => setValues((v) => ({ ...v, contactMethod: "EMAIL" }))}
              disabled={isSubmitting}
            />
          </div>

          {values.contactMethod === "PHONE" ? (
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="Mobile Number"
              aria-label="Mobile number"
              value={values.phoneNumber}
              onChange={(e) => setValues((v) => ({ ...v, phoneNumber: e.target.value }))}
              disabled={isSubmitting}
              required
              maxLength={20}
              className="h-12 bg-app-background/50 px-4 text-lg focus:bg-app-background"
            />
          ) : (
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Email Address"
              aria-label="Email address"
              value={values.email}
              onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
              disabled={isSubmitting}
              required
              maxLength={200}
              className="h-12 bg-app-background/50 px-4 text-lg focus:bg-app-background"
            />
          )}

          {accessMode === "PASSCODE" && (
            <div className="space-y-1">
              <div className="relative">
                <KeyRound aria-hidden="true" className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-app-muted" />
                <Input
                  type="text"
                  autoComplete="off"
                  placeholder="Class passcode"
                  aria-label="Class passcode"
                  aria-invalid={!!passcodeError}
                  value={values.passcode}
                  onChange={(e) => {
                    setPasscodeError(null);
                    setValues((v) => ({ ...v, passcode: e.target.value }));
                  }}
                  disabled={isSubmitting}
                  maxLength={12}
                  className="h-12 bg-app-background/50 pl-10 pr-4 font-mono text-lg uppercase tracking-widest focus:bg-app-background"
                />
              </div>
              <p className={cn("text-xs", passcodeError ? "text-app-danger-ink" : "text-app-muted")}>
                {passcodeError ?? "Invited guests can leave this empty."}
              </p>
            </div>
          )}

          <Button
            type="submit"
            className="h-12 w-full rounded-control text-lg font-semibold"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Registering…" : accessMode === "INVITE_ONLY" ? "Join or ask to join" : "Register & Join"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ContactMethodTab({
  label,
  icon,
  active,
  onClick,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-control px-3 py-2 transition-colors",
        active
          ? "bg-app-surface text-app-text shadow-soft"
          : "text-app-muted hover:text-app-text"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
