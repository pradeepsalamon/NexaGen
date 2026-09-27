"use client";

import "@livekit/components-styles";
import "@livekit/components-styles/prefabs";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { LiveClassProvider } from "@/features/live-class/providers/LiveClassProvider";
import { MeetingRoom } from "@/features/live-class/components/room/MeetingRoom";
import { ClassroomSessionManager } from "@/features/live-class/providers/ClassroomSessionManager";
import { LoadingMeeting } from "@/features/live-class/components/states/LoadingMeeting";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import { API_ROUTES, type DemoRegistrationContactMethod, type GuestJoinDemoResponse } from "@nexa-chess/types";
import { useToast } from "@/providers/ToastProvider";
import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { CalendarClock, Mail, Phone } from "lucide-react";

const WAITING_POLL_MS = 20_000;

type FormValues = {
  guestName: string;
  contactMethod: DemoRegistrationContactMethod;
  phoneNumber: string;
  email: string;
};

export default function DemoClassPage() {
  const params = useParams();
  const classId = params.classId as string;
  const toast = useToast();

  const [values, setValues] = useState<FormValues>({
    guestName: "",
    contactMethod: "PHONE",
    phoneNumber: "",
    email: "",
  });
  const [phase, setPhase] = useState<"form" | "waiting" | "connecting" | "in-room">("form");
  const [token, setToken] = useState<string | null>(null);
  const [topic, setTopic] = useState("Demo Class");
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [waitingMessage, setWaitingMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const headerCenter = (
    <h1 className="max-w-[42vw] truncate text-center text-sm font-extrabold text-app-text sm:max-w-none sm:text-base">
      {topic}
    </h1>
  );

  const attemptJoin = async (input: FormValues, opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setIsSubmitting(true);
    try {
      const response = await apiFetch<GuestJoinDemoResponse>(
        API_ROUTES.liveClass.demoJoin(classId),
        {
          method: "POST",
          body: JSON.stringify({
            guestName: input.guestName.trim(),
            contactMethod: input.contactMethod,
            ...(input.contactMethod === "EMAIL"
              ? { email: input.email.trim() }
              : { phoneNumber: input.phoneNumber.trim() }),
          }),
        }
      );

      setTopic(response.topic);

      if (response.joined && response.token) {
        setToken(response.token);
        setPhase("connecting");
      } else {
        setStartsAt(response.startsAt);
        setWaitingMessage(response.message);
        setPhase("waiting");
      }
    } catch (err: any) {
      if (!opts.silent) {
        toast.error({ title: err.message || "Failed to join demo class." });
      }
    } finally {
      if (!opts.silent) setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const contactReady =
      values.contactMethod === "EMAIL" ? values.email.trim() : values.phoneNumber.trim();
    if (!values.guestName.trim() || !contactReady) return;

    await attemptJoin(values);
  };

  // Quietly re-checks whether the class has gone live while the visitor waits
  // on the "you're registered" screen — reuses the same registration row and
  // never re-sends the confirmation (see LiveClassService#registerDemoGuest).
  useEffect(() => {
    if (phase !== "waiting") return;

    const interval = setInterval(() => {
      void attemptJoin(valuesRef.current, { silent: true });
    }, WAITING_POLL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (phase === "connecting" && token) {
      setPhase("in-room");
    }
  }, [phase, token]);

  const browserTimeZone =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

  if (phase === "form") {
    return (
      <div className="flex flex-col h-screen">
        <Header centerSlot={headerCenter} />
        <div className="flex-1 overflow-auto bg-app-soft pt-16 flex items-center justify-center p-4">
          <Card className="w-full max-w-md shadow-lift border-primary/10">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl text-primary-ink">Join Demo Class</CardTitle>
              <CardDescription>
                Register with your name and a mobile number or email — no account needed
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  type="text"
                  placeholder="Your Full Name"
                  value={values.guestName}
                  onChange={(e) => setValues((v) => ({ ...v, guestName: e.target.value }))}
                  disabled={isSubmitting}
                  required
                  className="h-12 text-lg px-4 bg-app-background/50 focus:bg-app-background"
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
                    value={values.phoneNumber}
                    onChange={(e) => setValues((v) => ({ ...v, phoneNumber: e.target.value }))}
                    disabled={isSubmitting}
                    required
                    maxLength={20}
                    className="h-12 text-lg px-4 bg-app-background/50 focus:bg-app-background"
                  />
                ) : (
                  <Input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="Email Address"
                    value={values.email}
                    onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
                    disabled={isSubmitting}
                    required
                    maxLength={200}
                    className="h-12 text-lg px-4 bg-app-background/50 focus:bg-app-background"
                  />
                )}

                <Button
                  type="submit"
                  className="w-full h-12 text-lg font-semibold rounded-control"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Registering…" : "Register & Join"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (phase === "waiting") {
    return (
      <div className="flex flex-col h-screen">
        <Header centerSlot={headerCenter} />
        <div className="flex-1 overflow-auto bg-app-soft pt-16 flex items-center justify-center p-4">
          <Card className="w-full max-w-md shadow-lift border-primary/10">
            <CardHeader className="text-center">
              <CalendarClock className="mx-auto mb-2 size-10 text-primary-ink" />
              <CardTitle className="text-2xl text-primary-ink">You&apos;re registered!</CardTitle>
              <CardDescription>
                {waitingMessage ?? "We'll see you when the class goes live."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              {startsAt && (
                <p className="text-sm text-app-muted">
                  Scheduled for {formatDateTime(startsAt, browserTimeZone)} your time.
                </p>
              )}
              <Button
                variant="outline"
                className="w-full h-11"
                disabled={isSubmitting}
                onClick={() => void attemptJoin(values)}
              >
                {isSubmitting ? "Checking…" : "Check if it's live"}
              </Button>
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
        <div className="flex-1 overflow-auto bg-app-soft pt-16 flex items-center justify-center">
          <LoadingMeeting message="Connecting to room..." />
        </div>
      </div>
    );
  }

  return (
    <LiveClassProvider topic={topic}>
      <ClassroomSessionManager roomId={classId}>
        <MeetingRoom token={token} classId={classId} />
      </ClassroomSessionManager>
    </LiveClassProvider>
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
