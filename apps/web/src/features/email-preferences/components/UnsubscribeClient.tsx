"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { AuthSplitShell } from "@/features/auth/components/AuthSplitShell";
import { AuthStatus } from "@/features/auth/components/AuthStatus";
import { getErrorMessage } from "@/lib/errors";
import { useSetEmailPreferencesByLink } from "../hooks/useEmailPreferencesApi";

/**
 * `/unsubscribe?token=…`, opened from the footer of a notification email. Nothing changes until
 * the button is pressed: mail scanners open links, and they must not unsubscribe anyone.
 */
export function UnsubscribeClient() {
  const token = useSearchParams().get("token");
  const change = useSetEmailPreferencesByLink();
  const home = (
    <Button asChild variant="neutral">
      <Link href="/">Go to the home page</Link>
    </Button>
  );

  if (!token) {
    return (
      <AuthSplitShell variant="forgot-password">
        <AuthStatus actions={home} title="This link is incomplete" tone="error">
          Open the unsubscribe link from a recent email again, or change the setting on your profile
          page.
        </AuthStatus>
      </AuthSplitShell>
    );
  }

  if (change.isError) {
    return (
      <AuthSplitShell variant="forgot-password">
        <AuthStatus actions={home} title="We couldn't change your emails" tone="error">
          {getErrorMessage(change.error)}
        </AuthStatus>
      </AuthSplitShell>
    );
  }

  if (change.data) {
    const on = change.data.notificationEmails;
    return (
      <AuthSplitShell variant="forgot-password">
        <AuthStatus
          actions={
            <Button
              disabled={change.isPending}
              onClick={() => change.mutate({ notificationEmails: !on, token })}
              variant="neutral"
            >
              {on ? "Unsubscribe again" : "Turn them back on"}
            </Button>
          }
          title={on ? "Email notifications are on" : "You're unsubscribed"}
          tone="success"
        >
          {on
            ? "You'll get reminders and updates by email again."
            : "We won't email you reminders and updates any more. Emails about your account, such as a password reset or an invoice, are still sent."}
        </AuthStatus>
      </AuthSplitShell>
    );
  }

  return (
    <AuthSplitShell variant="forgot-password">
      <AuthStatus
        actions={
          <Button
            disabled={change.isPending}
            onClick={() => change.mutate({ notificationEmails: false, token })}
          >
            {change.isPending ? "Unsubscribing…" : "Unsubscribe"}
          </Button>
        }
        title="Stop email notifications?"
        tone="info"
      >
        You&apos;ll stop getting reminders and updates by email, such as classes, homework and
        announcements. Emails about your account are still sent.
      </AuthStatus>
    </AuthSplitShell>
  );
}
