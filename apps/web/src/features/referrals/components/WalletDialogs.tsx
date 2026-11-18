"use client";

import { useState } from "react";
import { requestReferralWithdrawalRequestSchema } from "@nexa-chess/types";
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
  // A message goes under the field it is about (UI_RULES § "Form errors").
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const errorFor = (field: string) => (error?.field === field ? error.message : undefined);

  const submit = async () => {
    const amountMinor = parseMajorAmount(amount, currency);
    if (amountMinor === null) return setError({ field: "amount", message: "Enter an amount" });
    if (amountMinor < minWithdrawalMinor) return setError({ field: "amount", message: `The minimum withdrawal is ${money(minWithdrawalMinor, currency)}` });
    if (amountMinor > balanceMinor) return setError({ field: "amount", message: "That is more than your balance" });
    const parsed = requestReferralWithdrawalRequestSchema.safeParse({ amountMinor, payoutDetails });
    if (!parsed.success) return setError({
      field: parsed.error.issues[0]?.path[0] === "payoutDetails" ? "details" : "amount",
      message: parsed.error.issues[0]?.message ?? "Check the amount"
    });
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
          <FormField error={errorFor("amount")} hint={`Minimum ${money(minWithdrawalMinor, currency)}`} id="withdraw-amount" label={`Amount (${currency})`} required>
            <Input hasError={Boolean(errorFor("amount"))} id="withdraw-amount" inputMode="decimal" onChange={(event) => setAmount(event.target.value)} value={amount} />
          </FormField>
          <FormField error={errorFor("details")} hint="UPI id, or bank account number, IFSC and name" id="withdraw-details" label="Pay to" required>
            <Textarea hasError={Boolean(errorFor("details"))} id="withdraw-details" onChange={(event) => setPayoutDetails(event.target.value)} rows={3} value={payoutDetails} />
          </FormField>
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
