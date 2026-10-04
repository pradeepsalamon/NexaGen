"use client";

import { useState } from "react";
import {
  Calendar,
  Clock,
  Copy,
  Link2,
  Mail,
  Phone,
  Repeat,
  Send,
  Trash2,
  User,
  Users
} from "lucide-react";
import {
  DEMO_CLASS_ACCESS_MODE_LABELS,
  type DemoClassRegistrationItem
} from "@nexa-chess/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime, formatTime } from "@/lib/datetime";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { removeDemoInvitee } from "../api/adminApi";
import {
  demoQueryKeys,
  useAddDemoInviteesMutation,
  useDemoClassDetailsQuery
} from "../hooks/useAdminDemoClasses";
import { demoAbsoluteUrl, demoShareText } from "../lib/demoLinks";
import {
  DemoInviteePicker,
  EMPTY_PENDING_INVITEES,
  pendingInviteeCount,
  type PendingInvitees
} from "./demo-classes/DemoInviteePicker";

interface DemoClassDetailsDialogProps {
  classId: string | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const SOURCE_LABELS: Record<DemoClassRegistrationItem["source"], string> = {
  SELF: "Self-registered",
  LEAD: "Lead",
  INVITE: "Invited"
};

export function DemoClassDetailsDialog({
  classId,
  isOpen,
  onOpenChange,
}: DemoClassDetailsDialogProps) {
  const timeZone = useUserTimeZone();
  const toast = useToast();
  const { data, isLoading, isError } = useDemoClassDetailsQuery(
    classId as string,
    !!classId && isOpen
  );
  const addInvitees = useAddDemoInviteesMutation(classId ?? "");
  const [pending, setPending] = useState<PendingInvitees>(EMPTY_PENDING_INVITEES);
  const [notify, setNotify] = useState(true);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  const demoClass = data?.class;
  const canInvite = demoClass?.status === "SCHEDULED" || demoClass?.status === "LIVE";
  const registrations = (demoClass?.registrations ?? []).filter((r) => !hiddenIds.includes(r.id));

  const { run: runRemove } = useUndoableMutation({
    strategy: "defer",
    mutationFn: (r: DemoClassRegistrationItem) => removeDemoInvitee(classId as string, r.id),
    undo: async () => undefined,
    toast: (r) => ({ title: "Guest removed", message: `${r.name} can no longer use their invite.` }),
    invalidates: [
      [...demoQueryKeys.classes],
      [...demoQueryKeys.classDetails(classId ?? "")],
      [...queryKeys.leads.all]
    ],
    onSchedule: (r) => setHiddenIds((ids) => [...ids, r.id]),
    onCancel: (r) => setHiddenIds((ids) => ids.filter((id) => id !== r.id))
  });

  const copy = (text: string, title: string) => {
    void navigator.clipboard.writeText(text);
    toast.success({ title });
  };

  const submitInvites = () => {
    addInvitees.mutate(
      { leadIds: pending.leads.map((l) => l.id), invitees: pending.invitees, notify },
      { onSuccess: () => setPending(EMPTY_PENDING_INVITEES) }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Demo Class Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {isError && (
            <div className="text-sm text-app-danger-ink">
              Failed to load class details.
            </div>
          )}

          {demoClass && (
            <>
              <div>
                <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                  {demoClass.topic}
                  {demoClass.schedule && (
                    <Badge variant="info" className="gap-1">
                      <Repeat aria-hidden="true" className="size-3" /> /demo/{demoClass.schedule.slug}
                    </Badge>
                  )}
                </h3>
                <p className="mt-1 text-sm text-app-muted">Coach: {demoClass.coachName}</p>
                {demoClass.description && <p className="mt-3 text-sm">{demoClass.description}</p>}
              </div>

              <div className="space-y-3 rounded-control border border-app-border p-4">
                <DetailRow icon={<Calendar className="size-4 text-app-muted" />} label="Scheduled">
                  {formatDateTime(demoClass.startsAt, timeZone)} – {formatTime(demoClass.endsAt, timeZone)}
                </DetailRow>
                <DetailRow icon={<Clock className="size-4 text-app-muted" />} label="Actual start">
                  {demoClass.actualStartsAt ? formatDateTime(demoClass.actualStartsAt, timeZone) : "N/A"}
                </DetailRow>
                <DetailRow icon={<Clock className="size-4 text-app-muted" />} label="Actual end">
                  {demoClass.actualEndsAt ? formatDateTime(demoClass.actualEndsAt, timeZone) : "N/A"}
                </DetailRow>
                <DetailRow icon={<Link2 className="size-4 text-app-muted" />} label="Access">
                  <span className="flex flex-wrap items-center gap-2">
                    {DEMO_CLASS_ACCESS_MODE_LABELS[demoClass.accessMode]}
                    {demoClass.accessMode === "PASSCODE" && demoClass.passcode && (
                      <code className="rounded bg-app-soft px-1.5 py-0.5 font-mono tracking-widest">
                        {demoClass.passcode}
                      </code>
                    )}
                    {canInvite && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          copy(
                            demoShareText(`/demo/${demoClass.id}`, demoClass.accessMode, demoClass.passcode),
                            "Class link copied"
                          )
                        }
                      >
                        <Copy aria-hidden="true" className="size-3.5" /> Copy class link
                      </Button>
                    )}
                  </span>
                </DetailRow>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="flex items-center gap-2 text-sm font-semibold">
                    <Users className="size-4" /> Guests
                  </h4>
                  <Badge variant="secondary">{registrations.length}</Badge>
                </div>

                {registrations.length > 0 ? (
                  <ul className="max-h-[260px] space-y-2 overflow-y-auto rounded-control border border-app-border p-3">
                    {registrations.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <User className="size-3 shrink-0 text-app-muted" />
                          <span className="flex min-w-0 flex-col">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="truncate font-medium">{r.name}</span>
                              <Badge variant="outline" className="text-[10px]">{SOURCE_LABELS[r.source]}</Badge>
                            </span>
                            <span className="flex items-center gap-1 truncate text-xs text-app-muted">
                              {r.contactMethod === "EMAIL" ? (
                                <Mail className="size-3 shrink-0" />
                              ) : (
                                <Phone className="size-3 shrink-0" />
                              )}
                              {r.contact}
                            </span>
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <GuestStatusBadge registration={r} />
                          {r.invitePath && canInvite && (
                            <SimpleTooltip label={`Copy ${r.name}'s personal link`}>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                aria-label={`Copy ${r.name}'s personal link`}
                                className="size-8 rounded-full border border-primary bg-primary p-0 text-white hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-white"
                                onClick={() => copy(demoAbsoluteUrl(r.invitePath as string), "Personal link copied")}
                              >
                                <Copy aria-hidden="true" className="size-4" strokeWidth={2.5} />
                              </Button>
                            </SimpleTooltip>
                          )}
                          {!r.joined && canInvite && (
                            <SimpleTooltip label={`Remove ${r.name}`}>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                aria-label={`Remove ${r.name}`}
                                className="size-8 rounded-full border border-app-danger bg-app-danger p-0 text-white hover:bg-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:text-white"
                                onClick={() => runRemove(r)}
                              >
                                <Trash2 aria-hidden="true" className="size-4" strokeWidth={2.5} />
                              </Button>
                            </SimpleTooltip>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-control border border-app-border p-4 text-center text-sm text-app-muted">
                    No guests yet.
                  </div>
                )}
              </div>

              {canInvite && (
                <div className="grid gap-3 border-t border-app-border pt-4">
                  <h4 className="text-sm font-semibold">Invite guests</h4>
                  <DemoInviteePicker
                    value={pending}
                    onChange={setPending}
                    classId={demoClass.id}
                    disabled={addInvitees.isPending}
                  />
                  {pendingInviteeCount(pending) > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Switch
                        checked={notify}
                        onCheckedChange={setNotify}
                        label="Send their personal link"
                      />
                      <Button
                        type="button"
                        onClick={submitInvites}
                        isLoading={addInvitees.isPending}
                      >
                        <Send aria-hidden="true" className="size-4" />
                        Invite {pendingInviteeCount(pending)}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="mt-0.5">{icon}</span>
      <span className="min-w-[110px] font-medium">{label}:</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

function GuestStatusBadge({ registration }: { registration: DemoClassRegistrationItem }) {
  if (registration.joined) return <Badge variant="success" className="text-[10px]">Joined</Badge>;
  if (registration.approval === "PENDING") return <Badge variant="warning" className="text-[10px]">Waiting for coach</Badge>;
  if (registration.approval === "DENIED") return <Badge variant="destructive" className="text-[10px]">Not admitted</Badge>;
  return <Badge variant="secondary" className="text-[10px]">Registered</Badge>;
}
