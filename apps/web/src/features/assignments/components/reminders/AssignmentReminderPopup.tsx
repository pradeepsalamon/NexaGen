"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
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
  const items = data.items
    .filter((i) => i.dueStatus !== "DUE_SOON")
    .slice(0, 5);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-md rounded-2xl border p-6 bg-app-surface border-app-border text-app-text"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-base sm:text-lg font-bold">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border bg-app-danger-soft border-app-danger/30 text-app-danger-ink"
            >
              <AlertTriangle aria-hidden className="size-4.5" strokeWidth={2.2} />
            </span>
            <span>Don&apos;t forget your homework</span>
          </DialogTitle>
          <DialogDescription
            className="text-xs sm:text-sm mt-1 text-app-subtle"
          >
            You have {describeReminderCounts(data.counts)}.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1 my-2">
          {items.map((item) => (
            <ReminderItemRow
              item={item}
              key={item.id}
              onNavigate={() => setOpen(false)}
              timeZone={timeZone}
            />
          ))}
        </ul>

        <DialogFooter className="flex items-center justify-end gap-2.5 pt-2">
          <Button onClick={() => setOpen(false)} variant="neutral">
            Later
          </Button>

          <Button asChild>
            <Link href="/student/practice" onClick={() => setOpen(false)}>
              <span>Go to assignments</span>
              <ArrowRight className="size-3.5" strokeWidth={2.3} />
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}