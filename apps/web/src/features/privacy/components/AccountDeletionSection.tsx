"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  ACCOUNT_DELETION_STATUS_LABELS,
  createAccountDeletionRequestSchema,
  type CreateAccountDeletionRequest
} from "@nexa-chess/types";
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
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatRelativeDay } from "@/lib/datetime";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/providers/ToastProvider";
import {
  useMyDeletionRequest,
  useRequestAccountDeletion,
  useWithdrawAccountDeletion
} from "../hooks/usePrivacyApi";

/** Profile → "Delete account": the user asks, an admin completes it. */
export function AccountDeletionSection() {
  const tz = useUserTimeZone();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useMyDeletionRequest();
  const withdraw = useWithdrawAccountDeletion();
  const request = data?.request ?? null;
  const pending = request?.status === "PENDING";

  return (
    <section
      aria-labelledby="account-deletion-heading"
      className="mx-auto mt-5 max-w-4xl rounded-panel border border-app-border bg-app-surface p-5 shadow-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-lg font-bold text-app-text" id="account-deletion-heading">
            Delete account
          </h2>
          <p className="mt-1 text-sm text-app-muted">
            Ask the academy to delete your account. An admin reviews it, and once it is done you
            are signed out everywhere. Invoices and payment records are kept, as the law requires.
          </p>
        </div>
        {isLoading ? (
          <Skeleton className="h-10 w-40" />
        ) : pending ? (
          <Button
            disabled={withdraw.isPending}
            onClick={() =>
              withdraw.mutate(undefined, {
                onError: (error) => toast.error({ message: getErrorMessage(error), title: "Couldn't withdraw" }),
                onSuccess: () => toast.success({ title: "Deletion request withdrawn" })
              })
            }
            variant="outline"
          >
            Withdraw request
          </Button>
        ) : (
          <Button onClick={() => setOpen(true)} variant="destructive">
            Delete my account
          </Button>
        )}
      </div>

      {request ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-app-muted">
          <Badge variant={pending ? "warning" : "secondary"}>{ACCOUNT_DELETION_STATUS_LABELS[request.status]}</Badge>
          <span>Asked {formatRelativeDay(request.createdAt, tz).toLowerCase()}</span>
          {request.reviewNote ? <span>· {request.reviewNote}</span> : null}
        </div>
      ) : null}

      <DeletionDialog onOpenChange={setOpen} open={open} />
    </section>
  );
}

function DeletionDialog({ onOpenChange, open }: { onOpenChange: (open: boolean) => void; open: boolean }) {
  const toast = useToast();
  const submit = useRequestAccountDeletion();
  const form = useForm<CreateAccountDeletionRequest>({
    defaultValues: { currentPassword: "", reason: "" },
    resolver: zodResolver(createAccountDeletionRequestSchema)
  });

  const close = (next: boolean) => {
    if (!next) {
      form.reset();
      submit.reset();
    }
    onOpenChange(next);
  };

  const onSubmit = form.handleSubmit((values) =>
    submit.mutate(
      { currentPassword: values.currentPassword, reason: values.reason?.trim() || undefined },
      {
        onSuccess: () => {
          toast.success({ message: "An admin will review it.", title: "Deletion requested" });
          close(false);
        }
      }
    )
  );

  return (
    <Dialog onOpenChange={close} open={open}>
      <DialogContent>
        <form noValidate onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              An admin will review your request. You can withdraw it until then.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            {submit.error ? <Alert variant="error">{getErrorMessage(submit.error)}</Alert> : null}
            <FormField
              error={form.formState.errors.currentPassword?.message}
              id="deletion-password"
              label="Your password"
              required
            >
              <PasswordInput
                autoComplete="current-password"
                hasError={!!form.formState.errors.currentPassword}
                id="deletion-password"
                {...form.register("currentPassword")}
              />
            </FormField>
            <FormField hint="Optional. It helps us improve." id="deletion-reason" label="Why are you leaving?">
              <Textarea id="deletion-reason" maxLength={1000} rows={3} {...form.register("reason")} />
            </FormField>
          </div>
          <DialogFooter className="mt-6">
            <Button onClick={() => close(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={submit.isPending} type="submit" variant="destructive">
              {submit.isPending ? "Sending…" : "Request deletion"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
