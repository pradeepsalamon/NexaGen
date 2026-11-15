"use client";

import { EMAIL_CATEGORIES, EMAIL_CATEGORY_DEFINITIONS, type EmailCategory } from "@nexa-chess/types";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/providers/ToastProvider";
import { useEmailPreferences, useUpdateEmailPreferences } from "../hooks/useEmailPreferencesApi";

/**
 * Profile → "Email notifications": the master switch and one per kind, the same settings as the
 * unsubscribe links in those emails.
 */
export function EmailPreferencesSection() {
  const toast = useToast();
  const preferences = useEmailPreferences();
  const update = useUpdateEmailPreferences();
  const data = preferences.data;

  const setCategory = (category: EmailCategory, on: boolean) => {
    if (!data) return;
    const disabled = new Set(data.disabledCategories);
    if (on) disabled.delete(category);
    else disabled.add(category);
    update.mutate(
      { disabledCategories: [...disabled] },
      {
        onError: (error) => toast.error({ message: getErrorMessage(error), title: "Could not save" }),
        onSuccess: () =>
          toast.success({
            title: `${EMAIL_CATEGORY_DEFINITIONS[category].label}: ${on ? "on" : "off"}`
          })
      }
    );
  };

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
            Reminders and updates by email. Emails about your account (password reset, email
            verification, invoices) are always sent, and you still get notifications inside the app.
          </p>
        </div>
        {preferences.isLoading && <Skeleton className="h-6 w-10" />}
        {data && (
          <Switch
            aria-labelledby="email-preferences-heading"
            checked={data.notificationEmails}
            disabled={update.isPending}
            onCheckedChange={(checked) =>
              update.mutate(
                { notificationEmails: checked },
                {
                  onError: (error) => toast.error({ message: getErrorMessage(error), title: "Could not save" }),
                  onSuccess: () =>
                    toast.success({
                      title: checked ? "Email notifications turned on" : "Email notifications turned off"
                    })
                }
              )
            }
          />
        )}
      </div>
      {data && (
        <ul
          aria-label="Kinds of email"
          className="mt-4 grid gap-3 border-t border-app-border pt-4"
        >
          {EMAIL_CATEGORIES.map((category) => {
            const definition = EMAIL_CATEGORY_DEFINITIONS[category];
            const id = `email-category-${category.toLowerCase()}`;
            return (
              <li className="flex items-start justify-between gap-4" key={category}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-app-text" id={id}>
                    {definition.label}
                  </p>
                  <p className="text-sm text-app-muted">{definition.description}</p>
                </div>
                <Switch
                  aria-labelledby={id}
                  checked={data.notificationEmails && !data.disabledCategories.includes(category)}
                  disabled={!data.notificationEmails || update.isPending}
                  onCheckedChange={(checked) => setCategory(category, checked)}
                />
              </li>
            );
          })}
          {!data.notificationEmails && (
            <li className="text-sm text-app-muted">Turn email notifications on above to choose kinds.</li>
          )}
        </ul>
      )}
      {preferences.isError && (
        <Alert className="mt-4" variant="error">
          {getErrorMessage(preferences.error)}
        </Alert>
      )}
    </section>
  );
}
