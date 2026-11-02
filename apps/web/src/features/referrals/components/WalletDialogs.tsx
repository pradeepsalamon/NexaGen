"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import {
  formatReferralPoints,
  referralPointsValueMinor,
  requestReferralWithdrawalRequestSchema,
  transferReferralPointsRequestSchema,
  type MyReferralSummary,
  type ReferralWallet
} from "@nexa-chess/types";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useConvertPoints, useCreatePaymentCode, useRequestWithdrawal, useTransferPoints } from "../hooks/useReferrals";
import { money, parseMajorAmount } from "../lib/referralFormat";

type WalletDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  balanceMinor: number;
  currency: string;
};

export function WithdrawDialog({
  balanceMinor,
  currency,
  minWithdrawalMinor,
  onOpenChange,
  open
}: WalletDialogProps & { minWithdrawalMinor: number }) {
  const withdraw = useRequestWithdrawal();
  const [amount, setAmount] = useState("");
  const [payoutDetails, setPayoutDetails] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const amountMinor = parseMajorAmount(amount, currency);
    if (amountMinor === null) return setError("Enter an amount.");
    if (amountMinor < minWithdrawalMinor) return setError(`The minimum withdrawal is ${money(minWithdrawalMinor, currency)}.`);
    if (amountMinor > balanceMinor) return setError("That is more than your balance.");
    const parsed = requestReferralWithdrawalRequestSchema.safeParse({ amountMinor, payoutDetails });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the form.");
    setError(null);
    await withdraw.mutateAsync(parsed.data);
    setAmount("");
    setPayoutDetails("");
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw money</DialogTitle>
          <DialogDescription>
            Available: {money(balanceMinor, currency)}. The amount is held while the academy pays it out.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FormField hint={`Minimum ${money(minWithdrawalMinor, currency)}`} id="withdraw-amount" label={`Amount (${currency})`} required>
            <Input id="withdraw-amount" inputMode="decimal" onChange={(event) => setAmount(event.target.value)} value={amount} />
          </FormField>
          <FormField hint="UPI id, or bank account number, IFSC and name" id="withdraw-details" label="Pay to" required>
            <Textarea id="withdraw-details" onChange={(event) => setPayoutDetails(event.target.value)} rows={3} value={payoutDetails} />
          </FormField>
          {error ? <Alert variant="error">{error}</Alert> : null}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="neutral">
            Cancel
          </Button>
          <Button isLoading={withdraw.isPending} onClick={() => void submit().catch(() => undefined)}>
            Request withdrawal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PointsRate = { conversionPoints: number; conversionValueMinor: number };

/** "120" → 120, or null if not a whole number above zero. */
function parsePoints(input: string): number | null {
  const value = Number(input.replace(/,/g, "").trim());
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function PaymentCodeDialog({
  balanceMinor,
  currency,
  onOpenChange,
  open,
  points
}: WalletDialogProps & { points: (PointsRate & { balance: number }) | null }) {
  const create = useCreatePaymentCode();
  const [wallet, setWallet] = useState<ReferralWallet>("CASH");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const usePoints = wallet === "POINTS" && points !== null;

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setAmount("");
      setError(null);
      setCreatedCode(null);
    }
  };

  const pointsValue = usePoints ? referralPointsValueMinor(parsePoints(amount) ?? 0, points) : 0;

  const submit = async () => {
    if (usePoints) {
      const count = parsePoints(amount);
      if (count === null) return setError("Enter a whole number of points.");
      if (count > points.balance) return setError("That is more than your points.");
      if (referralPointsValueMinor(count, points) < 1) return setError("That many points is not worth anything yet.");
      setError(null);
      const code = await create.mutateAsync({ amount: count, wallet: "POINTS" });
      return setCreatedCode(code.code);
    }
    const amountMinor = parseMajorAmount(amount, currency);
    if (amountMinor === null) return setError("Enter an amount.");
    if (amountMinor > balanceMinor) return setError("That is more than your balance.");
    setError(null);
    const code = await create.mutateAsync({ amount: amountMinor, wallet: "CASH" });
    setCreatedCode(code.code);
  };

  return (
    <Dialog onOpenChange={close} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay fees from your wallet</DialogTitle>
          <DialogDescription>
            Turn money or points into a one-time discount code for your next payment. Only your account can use it.
          </DialogDescription>
        </DialogHeader>
        {createdCode ? (
          <div className="grid gap-3">
            <Alert variant="success" title="Your code is ready">
              Enter it in the discount field at checkout.
            </Alert>
            <div className="flex items-center gap-2">
              <Input aria-label="Payment code" className="font-mono text-lg font-bold" readOnly value={createdCode} />
              <Button onClick={() => void navigator.clipboard.writeText(createdCode)} variant="neutral">
                <Copy aria-hidden="true" className="size-4" strokeWidth={2.5} />
                Copy
              </Button>
            </div>
            <p className="text-xs text-app-muted">
              A code worth more than the fee makes that payment free; the rest is not kept. Cancel an unused code to get the
              balance back.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {points ? (
              <FormField id="code-wallet" label="Pay from">
                <Select
                  id="code-wallet"
                  onChange={(event) => {
                    setWallet(event.target.value as ReferralWallet);
                    setAmount("");
                    setError(null);
                  }}
                  options={[
                    { label: `Money (${money(balanceMinor, currency)})`, value: "CASH" },
                    { label: `Points (${formatReferralPoints(points.balance)})`, value: "POINTS" }
                  ]}
                  value={wallet}
                />
              </FormField>
            ) : null}
            {usePoints ? (
              <FormField
                hint={`Available: ${formatReferralPoints(points.balance)} · worth ${money(pointsValue, currency)}`}
                id="code-points"
                label="Points to use"
                required
              >
                <Input id="code-points" inputMode="numeric" onChange={(event) => setAmount(event.target.value)} value={amount} />
              </FormField>
            ) : (
              <FormField hint={`Available: ${money(balanceMinor, currency)}`} id="code-amount" label={`Amount (${currency})`} required>
                <Input id="code-amount" inputMode="decimal" onChange={(event) => setAmount(event.target.value)} value={amount} />
              </FormField>
            )}
            {error ? <Alert variant="error">{error}</Alert> : null}
          </div>
        )}
        <DialogFooter>
          {createdCode ? (
            <Button onClick={() => close(false)}>Done</Button>
          ) : (
            <>
              <Button onClick={() => close(false)} variant="neutral">
                Cancel
              </Button>
              <Button isLoading={create.isPending} onClick={() => void submit().catch(() => undefined)}>
                Create code
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PointsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  points: MyReferralSummary["points"];
  currency: string;
};

/** Send points to another member by the email they sign in with. Money can never be sent. */
export function TransferPointsDialog({ onOpenChange, open, points }: PointsDialogProps) {
  const transfer = useTransferPoints();
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const dailyLeft =
    points.maxTransferPointsPerDay > 0 ? Math.max(0, points.maxTransferPointsPerDay - points.sentLast24h) : null;

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setEmail("");
      setAmount("");
      setNote("");
      setError(null);
    }
  };

  const submit = async () => {
    const count = parsePoints(amount);
    if (count === null) return setError("Enter a whole number of points.");
    if (count < points.minTransferPoints) return setError(`Send at least ${formatReferralPoints(points.minTransferPoints)}.`);
    if (count > points.balance) return setError("That is more than your points.");
    if (dailyLeft !== null && count > dailyLeft) {
      return setError(`You can send ${formatReferralPoints(dailyLeft)} more in the next 24 hours.`);
    }
    const parsed = transferReferralPointsRequestSchema.safeParse({ email, note: note || undefined, points: count });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the form.");
    setError(null);
    await transfer.mutateAsync(parsed.data);
    close(false);
  };

  return (
    <Dialog onOpenChange={close} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send points</DialogTitle>
          <DialogDescription>
            Points can be shared with another academy member. Money in your wallet stays yours and cannot be sent.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FormField hint="The email they sign in with" id="send-email" label="Send to" required>
            <Input autoComplete="off" id="send-email" inputMode="email" onChange={(event) => setEmail(event.target.value)} value={email} />
          </FormField>
          <FormField
            hint={`You have ${formatReferralPoints(points.balance)}${
              dailyLeft !== null ? ` · ${formatReferralPoints(dailyLeft)} left to send today` : ""
            }`}
            id="send-points"
            label="Points"
            required
          >
            <Input id="send-points" inputMode="numeric" onChange={(event) => setAmount(event.target.value)} value={amount} />
          </FormField>
          <FormField id="send-note" label="Message (optional)">
            <Input id="send-note" maxLength={200} onChange={(event) => setNote(event.target.value)} value={note} />
          </FormField>
          {error ? <Alert variant="error">{error}</Alert> : null}
        </div>
        <DialogFooter>
          <Button onClick={() => close(false)} variant="neutral">
            Cancel
          </Button>
          <Button isLoading={transfer.isPending} onClick={() => void submit().catch(() => undefined)}>
            Send points
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Points → money at the academy's rate. One way: money never turns back into points. */
export function ConvertPointsDialog({ currency, onOpenChange, open, points }: PointsDialogProps) {
  const convert = useConvertPoints();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const count = parsePoints(amount) ?? 0;
  const value = referralPointsValueMinor(count, points);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setAmount("");
      setError(null);
    }
  };

  const submit = async () => {
    if (count <= 0) return setError("Enter a whole number of points.");
    if (count < points.minConversionPoints) return setError(`Convert at least ${formatReferralPoints(points.minConversionPoints)}.`);
    if (count > points.balance) return setError("That is more than your points.");
    if (value < 1) return setError("That many points is not worth anything yet.");
    setError(null);
    await convert.mutateAsync({ points: count });
    close(false);
  };

  return (
    <Dialog onOpenChange={close} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convert points to money</DialogTitle>
          <DialogDescription>
            {formatReferralPoints(points.conversionPoints)} = {money(points.conversionValueMinor, currency)}. This cannot be undone:
            money never turns back into points.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FormField
            hint={`You have ${formatReferralPoints(points.balance)} · minimum ${formatReferralPoints(points.minConversionPoints)}`}
            id="convert-points"
            label="Points to convert"
            required
          >
            <Input id="convert-points" inputMode="numeric" onChange={(event) => setAmount(event.target.value)} value={amount} />
          </FormField>
          <p className="text-sm text-app-muted">
            You get <span className="font-bold text-app-text tabular-nums">{money(value, currency)}</span>
          </p>
          {error ? <Alert variant="error">{error}</Alert> : null}
        </div>
        <DialogFooter>
          <Button onClick={() => close(false)} variant="neutral">
            Cancel
          </Button>
          <Button isLoading={convert.isPending} onClick={() => void submit().catch(() => undefined)}>
            Convert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
