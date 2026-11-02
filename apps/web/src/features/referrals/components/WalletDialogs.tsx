"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { requestReferralWithdrawalRequestSchema } from "@nexa-chess/types";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useCreatePaymentCode, useRequestWithdrawal } from "../hooks/useReferrals";
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
          <DialogTitle>Withdraw credits</DialogTitle>
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

export function PaymentCodeDialog({ balanceMinor, currency, onOpenChange, open }: WalletDialogProps) {
  const create = useCreatePaymentCode();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setAmount("");
      setError(null);
      setCreatedCode(null);
    }
  };

  const submit = async () => {
    const amountMinor = parseMajorAmount(amount, currency);
    if (amountMinor === null) return setError("Enter an amount.");
    if (amountMinor > balanceMinor) return setError("That is more than your balance.");
    setError(null);
    const code = await create.mutateAsync({ amountMinor });
    setCreatedCode(code.code);
  };

  return (
    <Dialog onOpenChange={close} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay fees with credits</DialogTitle>
          <DialogDescription>
            Turn credits into a one-time discount code for your next payment. Only your account can use it.
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
              credits back.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            <FormField hint={`Available: ${money(balanceMinor, currency)}`} id="code-amount" label={`Amount (${currency})`} required>
              <Input id="code-amount" inputMode="decimal" onChange={(event) => setAmount(event.target.value)} value={amount} />
            </FormField>
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
