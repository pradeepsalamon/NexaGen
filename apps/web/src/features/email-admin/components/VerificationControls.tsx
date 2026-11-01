"use client";

import { MailCheck, MailX, Send } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/providers/ToastProvider";
import { useSendVerificationLink, useSetEmailVerified } from "../hooks/useEmailAdmin";
import type { EmailRecipient } from "./DirectEmailDialog";

/** One person's verification state, with the actions that change it. */
export function VerificationControls({
  recipient,
  smtpMissing
}: {
  recipient: EmailRecipient;
  smtpMissing: boolean;
}) {
  const toast = useToast();
  const setVerified = useSetEmailVerified();
  const sendLink = useSendVerificationLink();
  const verified = recipient.isEmailVerified === true;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-app-soft p-3">
      <Badge variant={verified ? "success" : "warning"}>{verified ? "Email verified" : "Email not verified"}</Badge>
      <div className="flex flex-wrap gap-2">
        {!verified && (
          <Button
            disabled={sendLink.isPending || smtpMissing}
            onClick={() =>
              sendLink.mutate(recipient.id, {
                onError: (error) => toast.error({ message: getErrorMessage(error), title: "Could not send the link" }),
                onSuccess: () => toast.success({ title: "Verification link sent" })
              })
            }
            size="sm"
            type="button"
            variant="outline"
          >
            <Send aria-hidden="true" className="size-4" strokeWidth={2.5} />
            Send verification link
          </Button>
        )}
        <Button
          disabled={setVerified.isPending}
          onClick={() => setVerified.run({ userId: recipient.id, verified: !verified })}
          size="sm"
          type="button"
          variant="outline"
        >
          {verified ? (
            <MailX aria-hidden="true" className="size-4" strokeWidth={2.5} />
          ) : (
            <MailCheck aria-hidden="true" className="size-4" strokeWidth={2.5} />
          )}
          {verified ? "Mark as not verified" : "Mark as verified"}
        </Button>
      </div>
    </div>
  );
}
