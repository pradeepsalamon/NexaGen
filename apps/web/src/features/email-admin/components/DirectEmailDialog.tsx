"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Search, X } from "lucide-react";
import {
  DIRECT_EMAIL_BODY_MAX,
  DIRECT_EMAIL_MAX_RECIPIENTS,
  DIRECT_EMAIL_SUBJECT_MAX,
  sendDirectEmailRequestSchema,
  type SendDirectEmailRequest
} from "@nexa-chess/types";
import { BulkResultDialog } from "@/components/common/BulkResultDialog";
import { Form } from "@/components/forms/Form";
import { FormInput } from "@/components/forms/FormInput";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { TextEditor } from "@/components/ui/TextEditor";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useBulkAction } from "@/hooks/useBulkAction";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { queryKeys } from "@/lib/queryKeys";
import { useUsersQuery } from "@/features/users/hooks/useUsersApi";
import { sendDirectEmail } from "../api/emailAdminApi";
import { useEmailOverview } from "../hooks/useEmailAdmin";
import { VerificationControls } from "./VerificationControls";

export type EmailRecipient = {
  email: string;
  id: string;
  isEmailVerified?: boolean;
  name: string;
};

/** One email per person, one at a time. Whoever could not be reached stays listed, with the draft, to retry. */
export function DirectEmailDialog({
  initialRecipients = [],
  onClose,
  pickRecipients = false,
  verification
}: {
  initialRecipients?: EmailRecipient[];
  onClose: () => void;
  pickRecipients?: boolean;
  /** Shows verification controls for this one person above the message. */
  verification?: EmailRecipient;
}) {
  const [recipients, setRecipients] = useState(initialRecipients);
  const overview = useEmailOverview();
  const smtpMissing = overview.data?.smtpConfigured === false;
  const bulk = useBulkAction<EmailRecipient>({
    invalidates: [queryKeys.emailAdmin.all],
    labelOf: (recipient) => recipient.name
  });
  const form = useForm<SendDirectEmailRequest>({
    defaultValues: { body: "", subject: "" },
    resolver: zodResolver(sendDirectEmailRequestSchema)
  });
  const tooMany = recipients.length > DIRECT_EMAIL_MAX_RECIPIENTS;

  // undo: intentionally excluded — an email cannot be unsent.
  const onSubmit = (values: SendDirectEmailRequest) => {
    let turn: Promise<unknown> = Promise.resolve();
    void bulk.run("Send email", recipients, (recipient) => {
      const send = turn.then(() => sendDirectEmail(recipient.id, values));
      turn = send.catch(() => undefined);
      return send.then(() => setRecipients((current) => current.filter((r) => r.id !== recipient.id)));
    });
  };

  const bodyError = form.formState.errors.body?.message;

  return (
    <>
      <Dialog
        onOpenChange={(open) => {
          if (!open && !bulk.isPending) onClose();
        }}
        open={!bulk.result}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Send an email</DialogTitle>
            <DialogDescription>
              Each person gets their own copy, so no one sees who else received it. Replies go to the academy&apos;s mail address.
            </DialogDescription>
          </DialogHeader>

          {verification && <VerificationControls recipient={verification} smtpMissing={smtpMissing} />}

          <Form className="grid gap-4 py-2" form={form} onSubmit={onSubmit}>
            {smtpMissing && <Alert variant="warning">Email is not set up on this server (SMTP settings), so nothing can be sent.</Alert>}

            <div className="grid gap-2">
              <p className="text-sm font-semibold text-app-text">To</p>
              {recipients.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {recipients.map((recipient) => (
                    <Badge className="max-w-full gap-1" key={recipient.id} variant="outline">
                      <span className="truncate">{recipient.name}</span>
                      {(pickRecipients || recipients.length > 1) && (
                        <SimpleTooltip label={`Remove ${recipient.name}`}>
                          <Button
                            aria-label={`Remove ${recipient.name}`}
                            className="size-5 p-0"
                            onClick={() => setRecipients((current) => current.filter((r) => r.id !== recipient.id))}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <X aria-hidden="true" className="size-3" strokeWidth={2.5} />
                          </Button>
                        </SimpleTooltip>
                      )}
                    </Badge>
                  ))}
                </div>
              ) : !pickRecipients ? (
                <p className="text-sm text-app-muted">No one left to send to.</p>
              ) : null}
              {recipients.length === 1 && <p className="break-all text-xs text-app-muted">{recipients[0].email}</p>}
              {pickRecipients && (
                <RecipientPicker
                  onPick={(recipient) =>
                    setRecipients((current) =>
                      current.some((r) => r.id === recipient.id) ? current : [...current, recipient]
                    )
                  }
                  pickedIds={recipients.map((r) => r.id)}
                />
              )}
              {tooMany && (
                <Alert variant="warning">
                  You can send to {DIRECT_EMAIL_MAX_RECIPIENTS} people at a time. Remove {recipients.length - DIRECT_EMAIL_MAX_RECIPIENTS}.
                </Alert>
              )}
            </div>

            <FormInput label="Subject" maxLength={DIRECT_EMAIL_SUBJECT_MAX} name="subject" />
            <FormField error={bodyError} id="direct-email-body" label="Message">
              <Controller
                control={form.control}
                name="body"
                render={({ field }) => (
                  <TextEditor
                    hasError={!!bodyError}
                    id="direct-email-body"
                    maxLength={DIRECT_EMAIL_BODY_MAX}
                    name={field.name}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                    previewable
                    ref={field.ref}
                    rows={8}
                    value={field.value}
                  />
                )}
              />
            </FormField>

            <DialogFooter>
              <Button disabled={bulk.isPending} onClick={onClose} type="button" variant="outline">
                Cancel
              </Button>
              <Button disabled={bulk.isPending || recipients.length === 0 || tooMany || smtpMissing} type="submit">
                {bulk.isPending
                  ? "Sending..."
                  : recipients.length > 1
                    ? `Send to ${recipients.length} people`
                    : "Send"}
              </Button>
            </DialogFooter>
          </Form>
        </DialogContent>
      </Dialog>

      <BulkResultDialog
        onClose={() => {
          const anyFailed = (bulk.result?.failed.length ?? 0) > 0;
          bulk.clearResult();
          if (!anyFailed) onClose();
        }}
        result={bulk.result}
      />
    </>
  );
}

function RecipientPicker({
  onPick,
  pickedIds
}: {
  onPick: (recipient: EmailRecipient) => void;
  pickedIds: string[];
}) {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim());
  const results = useUsersQuery({ pageSize: 6, search: debounced || undefined });
  const matches = debounced ? (results.data?.users ?? []).filter((user) => !pickedIds.includes(user.id)) : [];

  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search aria-hidden="true" className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-app-muted" />
        <Input
          aria-label="Find a person by name or email"
          className="pl-10"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find a person by name or email"
          value={search}
        />
      </div>
      {debounced && !results.isFetching && matches.length === 0 && (
        <p className="text-sm text-app-muted">No one found.</p>
      )}
      {matches.length > 0 && (
        <ul className="grid gap-1">
          {matches.map((user) => {
            const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
            return (
              <li key={user.id}>
                <Button
                  className="h-auto w-full justify-start px-3 py-2 text-left"
                  onClick={() => {
                    onPick({ email: user.email, id: user.id, isEmailVerified: user.isEmailVerified, name });
                    setSearch("");
                  }}
                  type="button"
                  variant="ghost"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-app-text">{name}</span>
                    <span className="block truncate text-xs font-normal text-app-muted">{user.email}</span>
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
