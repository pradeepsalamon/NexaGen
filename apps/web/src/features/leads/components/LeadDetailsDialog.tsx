"use client";

import { useEffect, useMemo, useState } from "react";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import {
  Calendar,
  CalendarClock,
  Globe,
  Mail,
  MessageSquare,
  Monitor,
  Phone,
  Smartphone,
  User
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { Select, type SelectOption } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@nexa-chess/types";
import {
  useAddLeadNoteMutation,
  useAssignLeadDemoClassMutation,
  useLeadDetailsQuery,
  useUpcomingDemoClassesQuery,
  useUpdateLeadStatusMutation
} from "../hooks/useAdminLeads";
import { LEAD_STATUS_OPTIONS, leadStatusBadgeVariant } from "../lib/leadStatus";

interface LeadDetailsDialogProps {
  leadId: string | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeadDetailsDialog({ leadId, isOpen, onOpenChange }: LeadDetailsDialogProps) {
  const { data, isLoading, isError } = useLeadDetailsQuery(leadId as string, !!leadId && isOpen);
  const lead = data?.lead;

  const updateStatusMutation = useUpdateLeadStatusMutation(leadId ?? "");
  const addNoteMutation = useAddLeadNoteMutation(leadId ?? "");
  const assignDemoClassMutation = useAssignLeadDemoClassMutation(leadId ?? "");
  const { data: upcomingDemoClasses } = useUpcomingDemoClassesQuery(!!leadId && isOpen);
  const [noteText, setNoteText] = useState("");
  const timeZone = useUserTimeZone();

  // A draft belongs to the lead it was typed for.
  useEffect(() => {
    setNoteText("");
  }, [leadId]);

  const demoClassOptions = useMemo<SelectOption[]>(
    () =>
      (upcomingDemoClasses?.classes ?? []).map((demoClass) => ({
        label: `${demoClass.topic} — ${formatDateTime(demoClass.startsAt, timeZone)} (${demoClass.coachName})`,
        value: demoClass.id
      })),
    [upcomingDemoClasses, timeZone]
  );

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "N/A";
    return formatDateTime(dateString, timeZone);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lead details</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {isError && (
            <div className="text-sm text-app-danger">Failed to load lead details.</div>
          )}

          {lead && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-app-text">{lead.studentName}</h3>
                  <p className="mt-1 text-sm text-app-muted">
                    Age {lead.studentAge} · {lead.experienceLevel}
                  </p>
                </div>
                <Badge variant={leadStatusBadgeVariant(lead.status)}>
                  {LEAD_STATUS_LABELS[lead.status]}
                </Badge>
              </div>

              <div className="space-y-2 rounded-app border border-app-border bg-app-soft p-4">
                <div className="flex items-center gap-2 text-sm text-app-text">
                  <User className="size-4 text-app-muted" />
                  <span className="min-w-[100px] font-semibold">Parent:</span>
                  <span>{lead.parentName}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-app-text">
                  <Phone className="size-4 text-app-muted" />
                  <span className="min-w-[100px] font-semibold">Phone:</span>
                  <span>{lead.phone}</span>
                </div>
                {lead.email ? (
                  <div className="flex items-center gap-2 text-sm text-app-text">
                    <Mail className="size-4 text-app-muted" />
                    <span className="min-w-[100px] font-semibold">Email:</span>
                    <a className="break-all text-primary-ink hover:underline" href={`mailto:${lead.email}`}>
                      {lead.email}
                    </a>
                  </div>
                ) : null}
                <div className="flex items-center gap-2 text-sm text-app-text">
                  <Calendar className="size-4 text-app-muted" />
                  <span className="min-w-[100px] font-semibold">Received:</span>
                  <span>{formatDate(lead.createdAt)}</span>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-app-text" htmlFor="lead-status">
                  Status
                </label>
                <Select
                  disabled={updateStatusMutation.isPending}
                  id="lead-status"
                  onChange={(event) =>
                    updateStatusMutation.mutate({ status: event.target.value as LeadStatus })
                  }
                  options={LEAD_STATUS_OPTIONS}
                  value={lead.status}
                />
              </div>

              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-app-text">
                  <CalendarClock className="size-4" /> Demo class
                </h4>
                {lead.assignedClass ? (
                  <div className="mb-2 rounded-app border border-app-border bg-app-soft p-3 text-sm">
                    <p className="font-semibold text-app-text">{lead.assignedClass.topic}</p>
                    <p className="text-app-muted">
                      {formatDateTime(lead.assignedClass.startsAt, timeZone)} with{" "}
                      {lead.assignedClass.coachName}
                    </p>
                  </div>
                ) : null}
                <Select
                  disabled={assignDemoClassMutation.isPending || demoClassOptions.length === 0}
                  onChange={(event) => {
                    if (!event.target.value) return;
                    assignDemoClassMutation.mutate({ classId: event.target.value });
                  }}
                  options={demoClassOptions}
                  placeholder={
                    demoClassOptions.length === 0
                      ? "No scheduled demo classes"
                      : lead.assignedClass
                        ? "Reassign to a different class..."
                        : "Assign to a scheduled demo class..."
                  }
                  value={lead.assignedClassId ?? ""}
                />
              </div>

              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-app-text">
                  <Globe className="size-4" /> Attribution
                </h4>
                {lead.visitorAttribution ? (
                  <div className="grid gap-1.5 rounded-app border border-app-border bg-app-surface p-4 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-app-muted">Source</span>
                      <span className="text-app-text">{lead.source ?? "Unknown"}</span>
                    </div>
                    {lead.campaign ? (
                      <div className="flex items-center justify-between">
                        <span className="text-app-muted">Campaign</span>
                        <span className="text-app-text">{lead.campaign}</span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between">
                      <span className="text-app-muted">Referrer</span>
                      <span className="max-w-[280px] truncate text-app-text">
                        {lead.visitorAttribution.referrer ?? "Direct"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-app-muted">
                        {lead.visitorAttribution.deviceType === "Mobile" ? (
                          <Smartphone className="size-3.5" />
                        ) : (
                          <Monitor className="size-3.5" />
                        )}
                        Device
                      </span>
                      <span className="text-app-text">
                        {lead.visitorAttribution.browser} on {lead.visitorAttribution.os} (
                        {lead.visitorAttribution.deviceType})
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-app-muted">Page views</span>
                      <span className="text-app-text">{lead.visitorAttribution.pageViews}</span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-app border border-app-border bg-app-soft p-4 text-center text-sm text-app-muted">
                    No attribution data captured for this lead.
                  </div>
                )}
              </div>

              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-app-text">
                  <MessageSquare className="size-4" /> Add a note
                </h4>
                <Textarea
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder="Called the parent, will follow up Thursday..."
                  value={noteText}
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    disabled={!noteText.trim() || addNoteMutation.isPending}
                    isLoading={addNoteMutation.isPending}
                    onClick={() =>
                      addNoteMutation.mutate(
                        { note: noteText.trim() },
                        { onSuccess: () => setNoteText("") }
                      )
                    }
                    size="sm"
                    type="button"
                  >
                    Add note
                  </Button>
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-bold text-app-text">Activity</h4>
                {lead.activities.length > 0 ? (
                  <ul className="max-h-[220px] space-y-3 overflow-y-auto rounded-app border border-app-border bg-app-surface p-3">
                    {lead.activities.map((activity) => (
                      <li className="text-sm" key={activity.id}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-app-text">{activity.title}</span>
                          <span className="shrink-0 text-xs text-app-muted">
                            {formatDateTime(activity.createdAt, timeZone)}
                          </span>
                        </div>
                        {activity.description ? (
                          <p className="mt-0.5 text-xs text-app-muted">{activity.description}</p>
                        ) : null}
                        {activity.createdByName ? (
                          <p className="mt-0.5 text-xs text-app-muted">by {activity.createdByName}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-app border border-app-border bg-app-soft p-4 text-center text-sm text-app-muted">
                    No activity yet.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
