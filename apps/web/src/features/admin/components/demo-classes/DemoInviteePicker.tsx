"use client";

import { useState } from "react";
import { Mail, Phone, Plus, Search, UserPlus, Users, X } from "lucide-react";
import {
  LEAD_STATUS_LABELS,
  demoInviteeInputSchema,
  type DemoInviteeInput,
  type DemoRegistrationContactMethod,
  type LeadListItem
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useLeadsQuery } from "@/features/leads/hooks/useAdminLeads";
import { cn } from "@/lib/utils";

export interface PendingInvitees {
  leads: Pick<LeadListItem, "id" | "studentName" | "phone">[];
  invitees: DemoInviteeInput[];
}

export const EMPTY_PENDING_INVITEES: PendingInvitees = { leads: [], invitees: [] };

export function pendingInviteeCount(value: PendingInvitees): number {
  return value.leads.length + value.invitees.length;
}

interface DemoInviteePickerProps {
  value: PendingInvitees;
  onChange: (value: PendingInvitees) => void;
  /** The class being edited — a lead already booked into it shows as such. */
  classId?: string;
  disabled?: boolean;
}

/**
 * Builds a list of guests to invite — leads from the CRM, or new people by
 * phone/email. Each becomes a registration with a personal join link; the
 * phone/email is the fallback they can type on the join page.
 */
export function DemoInviteePicker({ value, onChange, classId, disabled }: DemoInviteePickerProps) {
  const [mode, setMode] = useState<"leads" | "new">("leads");

  const addLead = (lead: LeadListItem) => {
    if (value.leads.some((l) => l.id === lead.id)) return;
    onChange({ ...value, leads: [...value.leads, { id: lead.id, studentName: lead.studentName, phone: lead.phone }] });
  };
  const addInvitee = (invitee: DemoInviteeInput) => onChange({ ...value, invitees: [...value.invitees, invitee] });

  return (
    <div className="grid gap-3">
      <div className="flex rounded-control border border-app-border bg-app-soft p-1 text-sm font-medium">
        <SegmentButton active={mode === "leads"} onClick={() => setMode("leads")} icon={<Users className="size-4" />}>
          From leads
        </SegmentButton>
        <SegmentButton active={mode === "new"} onClick={() => setMode("new")} icon={<UserPlus className="size-4" />}>
          New guest
        </SegmentButton>
      </div>

      {mode === "leads" ? (
        <LeadSearch
          classId={classId}
          selectedIds={value.leads.map((l) => l.id)}
          onAdd={addLead}
          disabled={disabled}
        />
      ) : (
        <NewInviteeForm onAdd={addInvitee} disabled={disabled} />
      )}

      {pendingInviteeCount(value) > 0 && (
        <div className="grid gap-2">
          <p className="text-xs font-bold text-app-muted">
            To invite ({pendingInviteeCount(value)})
          </p>
          <ul className="flex flex-wrap gap-2">
            {value.leads.map((lead) => (
              <InviteChip
                key={`lead-${lead.id}`}
                label={lead.studentName}
                detail={lead.phone}
                icon={<Users className="size-3" />}
                onRemove={() => onChange({ ...value, leads: value.leads.filter((l) => l.id !== lead.id) })}
              />
            ))}
            {value.invitees.map((invitee, index) => (
              <InviteChip
                key={`inv-${index}`}
                label={invitee.name}
                detail={invitee.contactMethod === "EMAIL" ? invitee.email : invitee.phoneNumber}
                icon={invitee.contactMethod === "EMAIL" ? <Mail className="size-3" /> : <Phone className="size-3" />}
                onRemove={() =>
                  onChange({ ...value, invitees: value.invitees.filter((_, i) => i !== index) })
                }
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function LeadSearch({
  classId,
  selectedIds,
  onAdd,
  disabled
}: {
  classId?: string;
  selectedIds: string[];
  onAdd: (lead: LeadListItem) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useLeadsQuery({ search: search.trim() || undefined, pageSize: 8 });
  const leads = data?.items ?? [];

  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-muted" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search leads by student, parent or phone…"
          className="pl-9"
          disabled={disabled}
          aria-label="Search leads"
        />
      </div>
      <ul className="max-h-56 divide-y divide-app-border overflow-y-auto rounded-control border border-app-border">
        {isLoading &&
          Array.from({ length: 3 }, (_, i) => (
            <li key={i} className="p-3">
              <Skeleton className="h-4 w-2/3" />
            </li>
          ))}
        {!isLoading && leads.length === 0 && (
          <li className="p-3 text-center text-sm text-app-muted">No leads match.</li>
        )}
        {leads.map((lead) => {
          const picked = selectedIds.includes(lead.id);
          const bookedHere = !!classId && lead.assignedClassId === classId;
          return (
            <li key={lead.id} className="flex items-center justify-between gap-3 p-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-app-text">
                  {lead.studentName}{" "}
                  <span className="font-normal text-app-muted">· {lead.parentName}</span>
                </p>
                <p className="flex items-center gap-2 text-xs text-app-muted">
                  {lead.phone}
                  <Badge variant="outline" className="text-[10px]">
                    {LEAD_STATUS_LABELS[lead.status]}
                  </Badge>
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={picked || bookedHere ? "ghost" : "outline"}
                disabled={disabled || picked || bookedHere}
                onClick={() => onAdd(lead)}
              >
                {bookedHere ? "Invited" : picked ? "Added" : (
                  <>
                    <Plus aria-hidden="true" className="size-4" /> Add
                  </>
                )}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NewInviteeForm({ onAdd, disabled }: { onAdd: (invitee: DemoInviteeInput) => void; disabled?: boolean }) {
  const [name, setName] = useState("");
  const [contactMethod, setContactMethod] = useState<DemoRegistrationContactMethod>("PHONE");
  const [contact, setContact] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const parsed = demoInviteeInputSchema.safeParse({
      name,
      contactMethod,
      ...(contactMethod === "EMAIL" ? { email: contact } : { phoneNumber: contact })
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the details.");
      return;
    }
    onAdd(parsed.data);
    setName("");
    setContact("");
    setError(null);
  };

  return (
    <div className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto]">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Guest name"
          aria-label="Guest name"
          maxLength={50}
          disabled={disabled}
        />
        <div className="flex rounded-control border border-app-border bg-app-soft p-1">
          <SimpleTooltip label="Invite by phone">
            <button
              type="button"
              aria-label="Invite by phone"
              aria-pressed={contactMethod === "PHONE"}
              onClick={() => setContactMethod("PHONE")}
              className={cn("rounded-control px-2", contactMethod === "PHONE" ? "bg-app-surface shadow-soft" : "text-app-muted")}
            >
              <Phone aria-hidden="true" className="size-4" />
            </button>
          </SimpleTooltip>
          <SimpleTooltip label="Invite by email">
            <button
              type="button"
              aria-label="Invite by email"
              aria-pressed={contactMethod === "EMAIL"}
              onClick={() => setContactMethod("EMAIL")}
              className={cn("rounded-control px-2", contactMethod === "EMAIL" ? "bg-app-surface shadow-soft" : "text-app-muted")}
            >
              <Mail aria-hidden="true" className="size-4" />
            </button>
          </SimpleTooltip>
        </div>
        <Input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={contactMethod === "EMAIL" ? "Email address" : "Mobile number"}
          aria-label={contactMethod === "EMAIL" ? "Email address" : "Mobile number"}
          type={contactMethod === "EMAIL" ? "email" : "tel"}
          inputMode={contactMethod === "EMAIL" ? "email" : "tel"}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={submit} disabled={disabled}>
          <Plus aria-hidden="true" className="size-4" /> Add
        </Button>
      </div>
      {error ? (
        <p className="text-xs text-app-danger-ink">{error}</p>
      ) : (
        <p className="text-xs text-app-muted">
          They get a personal join link. The phone or email also lets them in if they open the class page directly.
        </p>
      )}
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  icon,
  children
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-control px-3 py-1.5 transition-colors",
        active ? "bg-app-surface text-app-text shadow-soft" : "text-app-muted hover:text-app-text"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function InviteChip({
  label,
  detail,
  icon,
  onRemove
}: {
  label: string;
  detail?: string;
  icon: React.ReactNode;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-1.5 rounded-full border border-app-border bg-app-surface py-1 pl-2.5 pr-1 text-xs">
      <span className="text-app-muted">{icon}</span>
      <span className="font-semibold text-app-text">{label}</span>
      {detail && <span className="text-app-muted">{detail}</span>}
      <SimpleTooltip label={`Remove ${label}`}>
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
          className="rounded-full p-0.5 text-app-muted hover:bg-app-soft hover:text-app-text"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </SimpleTooltip>
    </li>
  );
}
