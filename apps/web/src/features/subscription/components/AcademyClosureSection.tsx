"use client";

import { getErrorMessage } from "@/lib/errors";
import { useState } from "react";
import { Download, ShieldX } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  closureNameMatches,
  DEFAULT_TENANT_ID,
  TENANT_CLOSURE_CHOICE_LABELS,
  TENANT_CLOSURE_STATUS_LABELS,
  type AdminSubscriptionResponse,
  type TenantClosureChoice
} from "@nexa-chess/types";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChoiceTile } from "@/components/ui/ChoiceTile";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { queryKeys } from "@/lib/queryKeys";
import { saveBlob } from "@/lib/saveBlob";
import { useToast } from "@/providers/ToastProvider";
import { useAuthStore } from "@/stores/authStore";
import {
  downloadOwnAcademyExport,
  getAcademyClosure,
  requestAcademyClosure,
  withdrawAcademyClosure
} from "../api/subscriptionApi";

/**
 * The academy's super admin downloads its data and asks to close the academy,
 * keeping or deleting its data (docs/ACADEMY_CLOSURE.md). Nothing changes until
 * the platform approves. Not shown on NexaChess's own academy.
 * undo: intentionally excluded — a request is withdrawn with its own button; nothing changes until approved.
 */
export function AcademyClosureSection({ data }: { data: AdminSubscriptionResponse }) {
  const role = useAuthStore((state) => state.user?.role);
  const enabled = role === "SUPER_ADMIN" && data.tenant.id !== DEFAULT_TENANT_ID;
  const toast = useToast();
  const timeZone = useUserTimeZone();
  const queryClient = useQueryClient();
  const closure = useQuery({ enabled, queryFn: getAcademyClosure, queryKey: queryKeys.academyClosure });
  const [formOpen, setFormOpen] = useState(false);
  const [choice, setChoice] = useState<TenantClosureChoice>("KEEP_DATA");
  const [reason, setReason] = useState("");
  const [name, setName] = useState("");
  const [downloading, setDownloading] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.academyClosure });
  const request = useMutation({
    mutationFn: requestAcademyClosure,
    onSuccess: async () => {
      await refresh();
      setFormOpen(false);
      toast.success({ message: "NexaChess will confirm by email. Nothing changes until then.", title: "Request sent" });
    }
  });
  const withdraw = useMutation({
    mutationFn: withdrawAcademyClosure,
    onSuccess: async () => {
      await refresh();
      toast.success({ title: "Request withdrawn" });
    }
  });

  if (!enabled) return null;

  const download = async () => {
    setDownloading(true);
    try {
      saveBlob(await downloadOwnAcademyExport(), `academy-data-${new Date().toISOString().slice(0, 10)}.ndjson.gz`);
    } catch (error) {
      toast.error({ message: getErrorMessage(error), title: "Download failed" });
    } finally {
      setDownloading(false);
    }
  };

  const current = closure.data?.closure ?? null;
  const waiting = current?.status === "REQUESTED";

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-app-text">Your data and closing the academy</h2>
        <p className="text-sm text-app-muted">
          Download everything the academy holds at any time. If the academy is closing, ask here: you choose whether its data is kept or
          deleted.
        </p>
      </div>
      <Card className="grid gap-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={downloading} isLoading={downloading} onClick={() => void download()} variant="outline">
            <Download aria-hidden className="size-4" strokeWidth={2.5} />
            Download all academy data
          </Button>
          <span className="text-sm text-app-muted">
            One compressed file, one record per line (JSON). Passwords and other secrets are left out.
          </span>
        </div>

        {current && current.status !== "WITHDRAWN" && current.status !== "REOPENED" ? (
          <Alert
            action={
              waiting ? (
                <Button disabled={withdraw.isPending} isLoading={withdraw.isPending} onClick={() => withdraw.mutate()} variant="neutral">
                  Withdraw request
                </Button>
              ) : undefined
            }
            title={TENANT_CLOSURE_STATUS_LABELS[current.status]}
            variant={current.status === "DECLINED" ? "info" : "warning"}
          >
            You asked on {formatDateTime(current.requestedAt, timeZone)} to close the academy:{" "}
            {TENANT_CLOSURE_CHOICE_LABELS[current.choice].toLowerCase()}.
            {current.decisionNote ? ` Note from NexaChess: ${current.decisionNote}` : ""}
          </Alert>
        ) : null}

        {!waiting && !formOpen ? (
          <div>
            <Button onClick={() => setFormOpen(true)} variant="danger-soft">
              <ShieldX aria-hidden className="size-4" strokeWidth={2.5} />
              Close the academy…
            </Button>
          </div>
        ) : null}

        {formOpen && !waiting ? (
          <div className="grid gap-4 border-t border-app-border pt-4">
            <p className="text-sm text-app-text">
              Once NexaChess approves, the academy closes straight away: its address stops working and everyone is signed out. Download
              your data first if you will need it.
            </p>
            <div aria-label="What happens to the academy's data" className="grid gap-2 md:grid-cols-2" role="group">
              {(["KEEP_DATA", "DELETE_DATA"] as const).map((option) => (
                <ChoiceTile key={option} onClick={() => setChoice(option)} selected={choice === option}>
                  <span className="block text-sm font-medium text-app-text">{TENANT_CLOSURE_CHOICE_LABELS[option]}</span>
                  <span className="mt-1 block text-xs text-app-muted">
                    {option === "KEEP_DATA"
                      ? "Everything stays stored, and the academy can be reopened later."
                      : "Everything is erased a week after approval (NexaChess can still stop it in that week). People named on invoices are anonymised."}
                  </span>
                </ChoiceTile>
              ))}
            </div>
            <FormField id="closure-reason" label="Why is the academy closing?" required>
              <Textarea id="closure-reason" maxLength={2000} onChange={(event) => setReason(event.target.value)} rows={3} value={reason} />
            </FormField>
            <FormField hint={`Type "${data.tenant.name}" to confirm.`} id="closure-name" label="Academy name" required>
              <Input autoComplete="off" id="closure-name" onChange={(event) => setName(event.target.value)} value={name} />
            </FormField>
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={() => setFormOpen(false)} variant="neutral">
                Cancel
              </Button>
              <Button
                disabled={!closureNameMatches(name, data.tenant.name) || reason.trim().length === 0}
                isLoading={request.isPending}
                onClick={() => request.mutate({ choice, confirmName: name, reason: reason.trim() })}
                variant="destructive"
              >
                Send the request
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </section>
  );
}
