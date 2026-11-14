"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { useMyAssignmentReminders } from "../../hooks/useAssignmentsApi";
import { describeReminderCounts } from "./reminderText";
import { ReminderItemRow } from "./ReminderItemRow";

/** Per browser tab session: once shown (or dismissed), it stays away until the next sign-in/tab. */
const SESSION_KEY = "nexa-assignment-reminder-shown";

function alreadyShown(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markShown() {
  try {
    window.sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // Storage blocked: the popup may show again next visit, which is harmless.
  }
}

/**
 * Opens once per session when something is overdue or due today — "due soon"
 * alone only gets the banner, so the popup stays an interruption worth having.
 */
export function AssignmentReminderPopup() {
  const timeZone = useUserTimeZone();
  const { data } = useMyAssignmentReminders();
  const [open, setOpen] = useState(false);

  const pressing = data ? data.counts.overdue + data.counts.dueToday : 0;

  useEffect(() => {
    if (pressing > 0 && !alreadyShown()) {
      markShown();
      setOpen(true);
    }
  }, [pressing]);

  if (!data) return null;
  const items = data.items.filter((i) => i.dueStatus !== "DUE_SOON").slice(0, 5);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle aria-hidden className="size-5 text-app-danger-ink" />
            Don&apos;t forget your homework
          </DialogTitle>
          <DialogDescription>You have {describeReminderCounts(data.counts)}.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-0.5">
          {items.map((item) => (
            <ReminderItemRow item={item} key={item.id} onNavigate={() => setOpen(false)} timeZone={timeZone} />
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={() => setOpen(false)} variant="outline">
            Later
          </Button>
          <Button asChild onClick={() => setOpen(false)}>
            <Link href="/student/practice">Go to assignments</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
