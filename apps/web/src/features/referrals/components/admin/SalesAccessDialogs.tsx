"use client";

import { useState } from "react";
import { Mail, MessageCircle } from "lucide-react";
import type { ReferrerStatsItem, SendReferrerAccessLinkResponse } from "@nexa-chess/types";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { createUser } from "@/features/users/api/userApi";
import { referralAdminApi } from "../../api/referralAdminApi";
import { useReferralAdminMutation } from "../../hooks/useReferralAdmin";

type Channel = "EMAIL" | "WHATSAPP";

/** A throwaway password nobody sees: the sales person sets their own from the link. */
function placeholderPassword(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return `Nx${Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("")}9`;
}

function ChannelPicker({ channels, onChange }: { channels: Channel[]; onChange: (next: Channel[]) => void }) {
  const toggle = (channel: Channel, on: boolean) =>
    onChange(on ? [...channels.filter((c) => c !== channel), channel] : channels.filter((c) => c !== channel));
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-semibold text-app-text">Send the sign-in link by</legend>
      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-sm text-app-text" htmlFor="access-email">
          <Checkbox checked={channels.includes("EMAIL")} id="access-email" onCheckedChange={(c) => toggle("EMAIL", c === true)} />
          <Mail aria-hidden="true" className="size-4 text-app-muted" strokeWidth={2.5} />
          Email
        </label>
        <label className="flex items-center gap-2 text-sm text-app-text" htmlFor="access-whatsapp">
          <Checkbox
            checked={channels.includes("WHATSAPP")}
            id="access-whatsapp"
            onCheckedChange={(c) => toggle("WHATSAPP", c === true)}
          />
          <MessageCircle aria-hidden="true" className="size-4 text-app-muted" strokeWidth={2.5} />
          WhatsApp
        </label>
      </div>
    </fieldset>
  );
}

function ResultNotice({ result }: { result: SendReferrerAccessLinkResponse }) {
  const parts: string[] = [];
  if (result.email === "SENT") parts.push("Email sent.");
  if (result.email === "FAILED") parts.push("The email could not be sent (check the mail settings).");
  if (result.whatsapp === "SENT") parts.push("WhatsApp sent.");
  if (result.whatsapp === "FAILED") parts.push(`WhatsApp failed: ${result.whatsappError ?? "unknown error"}.`);
  const failed = result.email === "FAILED" || result.whatsapp === "FAILED";
  return (
    <Alert title={failed ? "Partly sent" : "Sign-in link sent"} variant={failed ? "warning" : "success"}>
      {parts.join(" ")} The link works once and expires in 24 hours.
    </Alert>
  );
}

/** Admin: send a sales account its one-use set-password link by email and/or WhatsApp. */
export function SendAccessLinkDialog({ onClose, referrer }: { referrer: ReferrerStatsItem; onClose: () => void }) {
  const [channels, setChannels] = useState<Channel[]>(["EMAIL"]);
  const [phone, setPhone] = useState(referrer.phoneNumber ?? "");
  const [result, setResult] = useState<SendReferrerAccessLinkResponse | null>(null);
  const send = useReferralAdminMutation(
    () => referralAdminApi.sendAccessLink(referrer.userId, { channels, phoneNumber: phone.trim() || undefined }),
    { failure: "Could not send the link", success: "Sign-in link sent" }
  );

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : onClose())} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send sign-in link</DialogTitle>
          <DialogDescription>
            {referrer.name} ({referrer.email}) gets a one-use link to set their own password and open their referral board.
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <ResultNotice result={result} />
        ) : (
          <div className="grid gap-4">
            <ChannelPicker channels={channels} onChange={setChannels} />
            {channels.includes("WHATSAPP") ? (
              <FormField hint="With country code, e.g. +91 98765 43210. Saved on the account." id="access-phone" label="WhatsApp number" required>
                <Input id="access-phone" inputMode="tel" onChange={(event) => setPhone(event.target.value)} value={phone} />
              </FormField>
            ) : null}
          </div>
        )}
        <DialogFooter>
          {result ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button onClick={onClose} variant="neutral">
                Cancel
              </Button>
              <Button
                disabled={channels.length === 0}
                isLoading={send.isPending}
                onClick={() => send.mutate(undefined, { onSuccess: setResult })}
              >
                Send link
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Admin: create a SALES account and send its sign-in link in one step. */
export function NewSalesAccountDialog({ onClose }: { onClose: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [channels, setChannels] = useState<Channel[]>(["EMAIL"]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendReferrerAccessLinkResponse | null>(null);

  const create = useReferralAdminMutation(
    async () => {
      const { user } = await createUser({
        email: email.trim().toLowerCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        password: placeholderPassword(),
        role: "SALES",
        status: "ACTIVE"
      });
      if (channels.length === 0) return null;
      return referralAdminApi.sendAccessLink(user.id, { channels, phoneNumber: phone.trim() || undefined });
    },
    { failure: "Could not create the account", success: "Sales account created" }
  );

  const submit = () => {
    if (!firstName.trim()) return setError("Enter a first name.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address.");
    if (channels.includes("WHATSAPP") && phone.replace(/\D/g, "").length < 10) return setError("Enter a WhatsApp number.");
    setError(null);
    create.mutate(undefined, {
      onSuccess: (sent) => (sent ? setResult(sent) : onClose())
    });
  };

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : onClose())} open>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New sales account</DialogTitle>
          <DialogDescription>
            Sales accounts only see their referral board. They set their own password from the link you send.
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <ResultNotice result={result} />
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="sales-first" label="First name" required>
                <Input id="sales-first" maxLength={120} onChange={(event) => setFirstName(event.target.value)} value={firstName} />
              </FormField>
              <FormField id="sales-last" label="Last name">
                <Input id="sales-last" maxLength={120} onChange={(event) => setLastName(event.target.value)} value={lastName} />
              </FormField>
            </div>
            <FormField id="sales-email" label="Email" required>
              <Input id="sales-email" inputMode="email" onChange={(event) => setEmail(event.target.value)} type="email" value={email} />
            </FormField>
            <FormField hint="Needed to send the link by WhatsApp." id="sales-phone" label="Phone (WhatsApp)">
              <Input id="sales-phone" inputMode="tel" onChange={(event) => setPhone(event.target.value)} value={phone} />
            </FormField>
            <ChannelPicker channels={channels} onChange={setChannels} />
            {error ? <Alert variant="error">{error}</Alert> : null}
          </div>
        )}
        <DialogFooter>
          {result ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button onClick={onClose} variant="neutral">
                Cancel
              </Button>
              <Button isLoading={create.isPending} onClick={submit}>
                {channels.length ? "Create and send link" : "Create account"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
