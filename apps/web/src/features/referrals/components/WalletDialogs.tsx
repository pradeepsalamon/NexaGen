"use client";

import { useState } from "react";
import { requestReferralWithdrawalRequestSchema } from "@nexa-chess/types";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useRequestWithdrawal } from "../hooks/useReferrals";
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
