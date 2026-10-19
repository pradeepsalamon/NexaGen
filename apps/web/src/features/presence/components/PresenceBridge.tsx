"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import {
  PRESENCE_HEARTBEAT_MS,
  type PresenceLiveClass,
  type PresencePull
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { useAuthStore } from "@/stores/authStore";
import { sendPresenceHeartbeat } from "../api/presenceApi";
import { LiveClassFab } from "./LiveClassFab";

/** Browser-level alert for a backgrounded tab; silently skipped without permission. */
function notifySystem(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (!document.hidden || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag: "nexa-live-class" });
  } catch {
    // Some browsers only allow notifications from a service worker.
  }
}

/**
 * App-wide presence heartbeat (every signed-in tab, every page). It is what
 * shows a coach that someone is online, and for a student it carries back the
 * class live right now and any coach pull — so a pull reaches a student who is
 * already in the app within one beat, and one who logs in later on their very
 * first beat.
 */
export function PresenceBridge() {
  const user = useAuthStore((state) => state.user);
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const enabled = !!user && isSessionChecked;

  const { data } = useQuery({
    queryKey: [...queryKeys.presence.heartbeat, user?.id ?? "anon"],
    queryFn: sendPresenceHeartbeat,
    enabled,
    refetchInterval: PRESENCE_HEARTBEAT_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: false
  });

  if (!enabled) return null;

  // A coach only gets the pill back into their own running class.
  if (user?.role === "COACH") {
    return <LiveClassFab liveClass={data?.liveClass ?? null} variant="coach" />;
  }

  if (user?.role !== "STUDENT") return null;

  return (
    <>
      <PullHandler pull={data?.pull ?? null} />
      <LiveAlert liveClass={data?.liveClass ?? null} />
      <LiveClassFab liveClass={data?.liveClass ?? null} />
    </>
  );
}

/** Takes the student straight into the class their coach pulled them into. */
function PullHandler({ pull }: { pull: PresencePull | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  // One redirect per pull request; a coach re-pulling stamps a new requestedAt.
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!pull) return;
    const key = `${pull.id}:${pull.requestedAt}`;
    if (handled.current === key) return;
    handled.current = key;

    const target = `/live-class/${pull.classId}`;
    if (pathname?.startsWith(target)) return;

    const title = `${pull.coachName} is bringing you into class`;
    notifySystem(title, pull.topic);

    // Never yank a student out of a different class they are sitting in.
    if (pathname?.startsWith("/live-class/")) {
      toast.info({
        title,
        message: pull.topic,
        durationMs: 15_000,
        action: { label: "Join", onClick: () => router.push(`${target}?pulled=1`) }
      });
      return;
    }

    toast.info({ title, message: `Joining ${pull.topic}…`, durationMs: 5000 });
    router.push(`${target}?pulled=1`);
  }, [pull, pathname, router, toast]);

  return null;
}

/** One alert per class when it goes live, unless the student is already in it. */
function LiveAlert({ liveClass }: { liveClass: PresenceLiveClass | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const alerted = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!liveClass || alerted.current.has(liveClass.classId)) return;
    if (pathname?.startsWith("/live-class/")) {
      // Already in this class: nothing to say. In another one: say it once they leave.
      if (pathname.startsWith(`/live-class/${liveClass.classId}`)) alerted.current.add(liveClass.classId);
      return;
    }
    alerted.current.add(liveClass.classId);

    const title = "Your class is live";
    const message = `${liveClass.topic} with ${liveClass.coachName}`;
    notifySystem(title, message);
    toast.info({
      title,
      message,
      durationMs: 10_000,
      action: { label: "Join", onClick: () => router.push(`/live-class/${liveClass.classId}`) }
    });
  }, [liveClass, pathname, router, toast]);

  return null;
}
