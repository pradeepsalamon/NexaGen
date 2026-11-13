"use client";

import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/providers/ToastProvider";
import { useEmailPreferences, useUpdateEmailPreferences } from "../hooks/useEmailPreferencesApi";

/** Profile → "Email notifications": the same switch as the unsubscribe link in those emails. */
export function EmailPreferencesSection() {
  const toast = useToast();
  const preferences = useEmailPreferences();
  const update = useUpdateEmailPreferences();

  return (
    <section
      aria-labelledby="email-preferences-heading"
      className="mx-auto mt-5 max-w-4xl rounded-panel border border-app-border bg-app-surface p-5 shadow-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-lg font-bold text-app-text" id="email-preferences-heading">
            Email notifications
          </h2>
          <p className="mt-1 text-sm text-app-muted">
            Reminders and updates by email, such as classes, homework and announcements. Emails about
            your account (password reset, email verification, invoices) are always sent, and you
            still get notifications inside the app.
          </p>
        </div>
        {preferences.isLoading && <Skeleton className="h-6 w-10" />}
        {preferences.data && (
          <Switch
            aria-labelledby="email-preferences-heading"
            checked={preferences.data.notificationEmails}
            disabled={update.isPending}
            onCheckedChange={(checked) =>
              update.mutate(checked, {
                onSuccess: () =>
                  toast.success({
                    title: checked ? "Email notifications turned on" : "Email notifications turned off"
                  })
              })
            }
          />
        )}
      </div>
      {preferences.isError && (
        <Alert className="mt-4" variant="error">
          {getErrorMessage(preferences.error)}
        </Alert>
      )}
    </section>
  );
}
