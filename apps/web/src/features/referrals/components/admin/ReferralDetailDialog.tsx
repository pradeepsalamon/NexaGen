"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Link2, Trash2, Unlink } from "lucide-react";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import type { ReferralStageItem } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime, formatFullDate } from "@/lib/datetime";
import { formatReferralReward, REFERRER_ROLE_LABELS } from "@nexa-chess/types";
import { referralAdminApi } from "../../api/referralAdminApi";
import { useAdminReferral, useReferralAdminMutation } from "../../hooks/useReferralAdmin";
import { REWARD_STATUS_LABEL, REWARD_STATUS_VARIANT } from "../../lib/referralFormat";
import { StageBadge } from "../StageBadge";

type Props = {
  referralId: string | null;
  stages: ReferralStageItem[];
  onClose: () => void;
};

/** One referral: who, where it is, move it, its history and rewards. */
export function ReferralDetailDialog({ onClose, referralId, stages }: Props) {
  const timeZone = useUserTimeZone();
  const { data, isLoading } = useAdminReferral(referralId);
  const [stageId, setStageId] = useState("");
  const [note, setNote] = useState("");
  const move = useReferralAdminMutation(
    (args: { id: string; stageId: string; note?: string }) =>
      referralAdminApi.moveStage(args.id, { note: args.note, stageId: args.stageId }),
    { failure: "Could not move the referral", success: "Referral moved" }
  );

  const [linkEmail, setLinkEmail] = useState("");
  const link = useReferralAdminMutation(
    (args: { id: string; email: string | null }) => referralAdminApi.linkUser(args.id, { email: args.email }),
    { failure: "Could not update the account link", success: "Account link updated" }
  );

  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useReferralAdminMutation((id: string) => referralAdminApi.deleteReferral(id), {
    failure: "Could not delete the referral",
    success: "Referral deleted"
  });

  useEffect(() => {
    if (data) setStageId(data.stageId);
    setNote("");
    setLinkEmail("");
  }, [data]);

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : onClose())} open={!!referralId}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{data?.prospectName ?? "Visitor"}</DialogTitle>
          <DialogDescription>
            {data
              ? `Referred by ${data.referrerName} (${REFERRER_ROLE_LABELS[data.referrerRole]}) · code ${data.code}`
              : <Skeleton as="span" className="h-3.5 w-64" />}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <Skeleton className="h-64 rounded-app" />
        ) : (
          <div className="grid max-h-[70dvh] gap-5 overflow-y-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-app-muted">Stage</p>
                <div className="mt-1">
                  <StageBadge name={data.stageName} tone={data.stageTone} />
                </div>
              </div>
              <div>
                <p className="text-xs text-app-muted">First visit</p>
                <p className="mt-1 text-sm text-app-text">{formatFullDate(data.createdAt, timeZone)}</p>
              </div>
              <div>
                <p className="text-xs text-app-muted">Link visits</p>
                <p className="mt-1 text-sm tabular-nums text-app-text">{data.visits}</p>
              </div>
            </div>

            {data.contact ? (
              <div className="rounded-control border border-app-border bg-app-soft p-3 text-sm">
                <p className="font-bold text-app-text">{data.contact.parentName ?? "Contact"}</p>
                {data.contact.phone ? <p className="text-app-muted">{data.contact.phone}</p> : null}
                {data.contact.email ? <p className="break-all text-app-muted">{data.contact.email}</p> : null}
                {data.leadId ? (
                  <Link className="mt-2 inline-flex items-center gap-1 font-bold text-primary-ink hover:underline" href="/admin/leads">
                    Open in leads <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                  </Link>
                ) : null}
              </div>
            ) : null}

            <section className="grid gap-3 rounded-app border border-app-border p-3">
              <h3 className="text-sm font-bold text-app-text">New member&rsquo;s account</h3>
              {data.referredUser ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 text-sm">
                    <p className="font-bold text-app-text">{data.referredUser.name}</p>
                    <p className="break-all text-app-muted">{data.referredUser.email}</p>
                  </div>
                  <Button
                    className="shrink-0 self-end sm:self-auto"
                    isLoading={link.isPending}
                    onClick={() => link.mutate({ email: null, id: data.id })}
                    variant="neutral"
                  >
                    <Unlink aria-hidden="true" className="size-4" strokeWidth={2.5} />
                    Unlink
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-app-muted">
                    Linked automatically when they sign up from the referral link or with the lead&rsquo;s email. Link it here if
                    they used another email — their welcome benefits are given straight away.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      aria-label="Account email"
                      inputMode="email"
                      onChange={(event) => setLinkEmail(event.target.value)}
                      placeholder="Their account email"
                      value={linkEmail}
                    />
                    <Button
                      className="shrink-0"
                      disabled={!linkEmail.trim()}
                      isLoading={link.isPending}
                      onClick={() => link.mutate({ email: linkEmail.trim(), id: data.id })}
                    >
                      <Link2 aria-hidden="true" className="size-4" strokeWidth={2.5} />
                      Link account
                    </Button>
                  </div>
                </>
              )}
            </section>

            <section className="grid gap-3 rounded-app border border-app-border p-3">
              <h3 className="text-sm font-bold text-app-text">Move to another stage</h3>
              <FormField id="referral-stage" label="Stage">
                <Select
                  id="referral-stage"
                  onChange={(event) => setStageId(event.target.value)}
                  options={stages.map((stage) => ({ label: stage.name, value: stage.id }))}
                  value={stageId}
                />
              </FormField>
              <FormField hint="Optional. Shown in the history." id="referral-note" label="Note">
                <Textarea id="referral-note" maxLength={500} onChange={(event) => setNote(event.target.value)} rows={2} value={note} />
              </FormField>
              <div className="flex justify-end">
                <Button
                  disabled={stageId === data.stageId}
                  isLoading={move.isPending}
                  onClick={() => move.mutate({ id: data.id, note: note.trim() || undefined, stageId })}
                >
                  Move referral
                </Button>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-bold text-app-text">Rewards</h3>
              {data.rewards.length ? (
                <ul className="grid gap-2">
                  {data.rewards.map((reward) => (
                    <li className="flex items-center justify-between gap-3 rounded-control border border-app-border p-2 text-sm" key={reward.id}>
                      <span className="min-w-0 truncate text-app-text">
                        {reward.sourceName}
                        <span className="block text-xs text-app-muted">
                          {reward.beneficiary === "REFERRED" ? `New member · ${reward.referrerName}` : "Referrer"}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge variant={REWARD_STATUS_VARIANT[reward.status]}>{REWARD_STATUS_LABEL[reward.status]}</Badge>
                        <span className="font-bold tabular-nums">
                          {formatReferralReward(reward.amountMinor, reward.unit, reward.currency)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-app-muted">No rewards from this referral yet.</p>
              )}
            </section>

            <section className="flex flex-col gap-2 rounded-app border border-app-danger/30 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-app-muted">Spam, a duplicate or a test? Delete it. One with rewards keeps them: cancel those first.</p>
              <Button className="shrink-0 self-end sm:self-auto" onClick={() => setConfirmDelete(true)} variant="danger-soft">
                <Trash2 aria-hidden="true" className="size-4" strokeWidth={2.5} />
                Delete referral
              </Button>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-bold text-app-text">History</h3>
              <ol className="grid gap-3 border-l border-app-border pl-4">
                {data.events.map((event) => (
                  <li className="text-sm" key={event.id}>
                    {event.fromStageName || event.toStageName ? (
                      <p className="text-app-text">
                        {event.fromStageName ? `${event.fromStageName} → ` : ""}
                        <span className="font-bold">{event.toStageName ?? "Deleted stage"}</span>
                      </p>
                    ) : null}
                    <p className="text-xs text-app-muted">
                      {formatDateTime(event.createdAt, timeZone)} · {event.actorName ?? "Automatic"}
                    </p>
                    {event.note ? <p className="mt-1 text-app-muted">{event.note}</p> : null}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </DialogContent>
      <ConfirmationModal
        confirmLabel="Delete referral"
        isConfirming={remove.isPending}
        isOpen={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          data &&
          remove.mutate(data.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              onClose();
            }
          })
        }
        title="Delete this referral?"
      >
        Its history goes with it. The lead in Leads is not touched.
      </ConfirmationModal>
    </Dialog>
  );
}
