"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  EMAIL_CATEGORY_DEFINITIONS,
  emailCategorySchema,
  type EmailCategory,
  type EmailPreferencesDto
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { AuthSplitShell } from "@/features/auth/components/AuthSplitShell";
import { AuthStatus } from "@/features/auth/components/AuthStatus";
import { getErrorMessage } from "@/lib/errors";
import { useSetEmailPreferencesByLink } from "../hooks/useEmailPreferencesApi";

/** What the last press changed: one kind, or everything. */
type Scope = { category: EmailCategory } | { category: null };

/**
 * `/unsubscribe?token=…[&category=…]`, opened from the footer of an email. With a category it
 * offers to stop just that kind, or everything. Nothing changes until a button is pressed: mail
 * scanners open links, and they must not unsubscribe anyone.
 */
export function UnsubscribeClient() {
  const params = useSearchParams();
  const token = params.get("token");
  const parsedCategory = emailCategorySchema.safeParse(params.get("category"));
  const category = parsedCategory.success ? parsedCategory.data : null;
  const change = useSetEmailPreferencesByLink();
  const scope: Scope = change.variables?.category ? { category: change.variables.category } : { category: null };

  const home = (
    <Button asChild variant="neutral">
      <Link href="/">Go to the home page</Link>
    </Button>
  );

  if (!token) {
    return (
      <AuthSplitShell>
        <AuthStatus actions={home} title="This link is incomplete" tone="error">
          Open the unsubscribe link from a recent email again, or change the setting on your profile
          page.
        </AuthStatus>
      </AuthSplitShell>
    );
  }

  if (change.isError) {
    return (
      <AuthSplitShell>
        <AuthStatus actions={home} title="We couldn't change your emails" tone="error">
          {getErrorMessage(change.error)}
        </AuthStatus>
      </AuthSplitShell>
    );
  }

  if (change.data) {
    const on = isOn(change.data, scope);
    const label = scope.category ? EMAIL_CATEGORY_DEFINITIONS[scope.category].label : null;
    return (
      <AuthSplitShell>
        <AuthStatus
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={change.isPending}
                onClick={() =>
                  change.mutate({
                    ...(scope.category ? { category: scope.category } : {}),
                    notificationEmails: !on,
                    token
                  })
                }
                variant="neutral"
              >
                {on ? "Unsubscribe again" : "Turn them back on"}
              </Button>
              {scope.category && change.data.notificationEmails && (
                <Button
                  disabled={change.isPending}
                  onClick={() => change.mutate({ notificationEmails: false, token })}
                  variant="outline"
                >
                  Unsubscribe from all
                </Button>
              )}
            </div>
          }
          title={on ? `${label ?? "Email notifications"}: back on` : "You're unsubscribed"}
          tone="success"
        >
          {on
            ? `You'll get ${label ? `"${label}"` : "reminders and updates"} by email again.`
            : `We won't email you ${label ? `"${label}"` : "reminders, updates or messages from the academy team"} any more. Emails about your account, such as a password reset or an invoice, are still sent. You can change this on your profile page.`}
        </AuthStatus>
      </AuthSplitShell>
    );
  }

  if (category) {
    const definition = EMAIL_CATEGORY_DEFINITIONS[category];
    return (
      <AuthSplitShell>
        <AuthStatus
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={change.isPending}
                onClick={() => change.mutate({ category, notificationEmails: false, token })}
              >
                {change.isPending ? "Saving…" : "Stop these emails"}
              </Button>
              <Button
                disabled={change.isPending}
                onClick={() => change.mutate({ notificationEmails: false, token })}
                variant="outline"
              >
                Unsubscribe from all
              </Button>
            </div>
          }
          title={`Stop "${definition.label}" emails?`}
          tone="info"
        >
          {definition.description} Other emails keep coming unless you unsubscribe from all. Emails
          about your account are always sent.
        </AuthStatus>
      </AuthSplitShell>
    );
  }

  return (
    <AuthSplitShell>
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
        announcements, and messages from the academy team. Emails about your account are still sent.
      </AuthStatus>
    </AuthSplitShell>
  );
}

function isOn(preferences: EmailPreferencesDto, scope: Scope): boolean {
  if (!preferences.notificationEmails) return false;
  return scope.category ? !preferences.disabledCategories.includes(scope.category) : true;
}
