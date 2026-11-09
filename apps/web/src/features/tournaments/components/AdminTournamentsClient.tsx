"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Archive, Check, CheckCircle2, Inbox, Pencil, Plus, Trophy, Users, X } from "lucide-react";
import {
  CERTIFICATE_BORDER_STYLES,
  CERTIFICATE_ORIENTATIONS,
  CERTIFICATE_PLACEHOLDERS,
  DEFAULT_CERTIFICATE_TEMPLATE,
  TOURNAMENT_MAX_SPECTATOR_DELAY_SEC,
  TOURNAMENT_PUBLIC_NAME_FORMATS,
  TOURNAMENT_PUBLIC_NAME_FORMAT_LABELS,
  certificateTemplateRequestSchema,
  ordinal,
  renderCertificateText,
  type AdminTournamentRegistrationDto,
  type CertificateTemplateDto,
  type CertificateTemplateRequest,
  type TournamentSettingsDto
} from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { SectionCard } from "@/components/ui/SectionCard";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/StatTile";
import { Switch } from "@/components/ui/Switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { useToast } from "@/providers/ToastProvider";
import * as api from "../api/tournamentsApi";
import { useAdminMutation, useAdminOverview, useAdminRegistrations, useAdminTemplates, useTournamentSettings } from "../hooks/useTournaments";
import { ReasonDialog } from "./ReasonDialog";
import { Pager, TournamentCard } from "./TournamentBits";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

function OverviewPanel() {
  const overview = useAdminOverview();
  if (overview.isError) return <Alert variant="error">Couldn&apos;t load the overview.</Alert>;
  if (!overview.data) return <Skeleton className="h-64" />;
  const o = overview.data;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Trophy} label="Live now" tone="primary" value={String(o.counts.LIVE + o.counts.PAUSED)} />
        <StatTile icon={Users} label="Players this year" tone="secondary" value={String(o.playersThisYear)} />
        <StatTile icon={CheckCircle2} label="Completion rate" tone="accent" value={pct(o.completionRate)} />
        <StatTile icon={X} label="Forfeit rate" tone="warm" value={pct(o.forfeitRate)} />
      </div>
      {o.pendingRegistrations || o.pendingPublishRequests ? (
        <Alert
          action={
            o.pendingPublishRequests ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/requests">
                  <Inbox className="size-4" />
                  Requests
                </Link>
              </Button>
            ) : undefined
          }
          title="Waiting for you"
          variant="warning"
        >
          {o.pendingRegistrations} registrations to approve · {o.pendingPublishRequests} tournaments waiting to be published
        </Alert>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        {(["DRAFT", "PUBLISHED", "COMPLETED"] as const).map((s) => (
          <div className="rounded-control border border-app-border bg-app-surface p-3" key={s}>
            <p className="text-xs text-app-muted">{s === "DRAFT" ? "Drafts" : s === "PUBLISHED" ? "Upcoming" : "Finished"}</p>
            <p className="text-xl font-semibold tabular-nums text-app-text">{o.counts[s]}</p>
          </div>
        ))}
      </div>
      {o.live.length || o.upcoming.length ? (
        <SectionCard title="Live and upcoming">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...o.live, ...o.upcoming].map((t) => (
              <TournamentCard href={`/tournaments/${t.id}`} key={t.id} tournament={t} />
            ))}
          </div>
        </SectionCard>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Recent results">
          {o.recent.length === 0 ? (
            <EmptyState title="No finished tournaments yet" variant="inline" />
          ) : (
            <ul className="flex flex-col divide-y divide-app-border">
              {o.recent.map((t) => (
                <li className="flex min-w-0 items-center justify-between gap-3 py-2" key={t.id}>
                  <Link className="min-w-0 truncate font-medium hover:underline" href={`/tournaments/${t.id}`}>
                    {t.name}
                  </Link>
                  <span className="flex shrink-0 items-center gap-1 text-sm text-app-muted">
                    <Trophy aria-hidden className="size-4 text-accent-ink" />
                    {t.champion?.name ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Hosts">
          {o.hosts.length === 0 ? (
            <EmptyState title="No hosts yet" variant="inline" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Host</TableHead>
                  <TableHead className="text-right">Tournaments</TableHead>
                  <TableHead className="text-right">Live</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {o.hosts.map((h) => (
                  <TableRow key={h.user.id}>
                    <TableCell>
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar imageUrl={h.user.avatarUrl} name={h.user.name} size="xs" />
                        <span className="truncate">{h.user.name}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{h.tournaments}</TableCell>
                    <TableCell className="text-right tabular-nums">{h.live}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function RegistrationsPanel() {
  const [page, setPage] = useState(1);
  const registrations = useAdminRegistrations(page);
  const timeZone = useUserTimeZone();
  const toast = useToast();
  const [rejecting, setRejecting] = useState<AdminTournamentRegistrationDto | null>(null);
  const decide = useAdminMutation((args: { row: AdminTournamentRegistrationDto; status: "APPROVED" | "REJECTED"; reason?: string }) =>
    api.decidePlayer(args.row.tournament.id, args.row.id, { reason: args.reason, status: args.status })
  );
  if (!registrations.data) return <Skeleton className="h-48" />;
  const rows = registrations.data.registrations;
  return (
    <SectionCard description="Entries waiting for approval across every tournament." title="Registrations">
      {rows.length === 0 ? (
        <EmptyState title="Nothing waiting" variant="inline" />
      ) : (
        <div className="flex flex-col gap-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead>Tournament</TableHead>
                <TableHead className="hidden md:table-cell">Registered</TableHead>
                <TableHead pin="end">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link className="hover:underline" href={`/admin/tournaments/students/${r.user.id}`}>
                      {r.user.name}
                    </Link>
                    <span className="ml-2 text-xs text-app-muted">{r.seedRating ?? "Unrated"}</span>
                  </TableCell>
                  <TableCell>
                    <Link className="hover:underline" href={`/tournaments/${r.tournament.id}/manage`}>
                      {r.tournament.name}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{formatDateTime(r.registeredAt, timeZone)}</TableCell>
                  <TableCell pin="end">
                    <div className="flex justify-end gap-1">
                      <SimpleTooltip label="Approve">
                        <Button
                          aria-label="Approve"
                          className="size-8 p-0"
                          disabled={decide.isPending}
                          onClick={() => decide.mutate({ row: r, status: "APPROVED" }, { onSuccess: () => toast.success({ title: "Entry approved" }) })}
                          variant="neutral"
                        >
                          <Check className="size-4" strokeWidth={2.5} />
                        </Button>
                      </SimpleTooltip>
                      <SimpleTooltip label="Reject">
                        <Button aria-label="Reject" className="size-8 p-0 text-app-danger-ink" onClick={() => setRejecting(r)} variant="neutral">
                          <X className="size-4" strokeWidth={2.5} />
                        </Button>
                      </SimpleTooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pager onPage={setPage} page={registrations.data.pagination.page} total={registrations.data.pagination.total} totalPages={registrations.data.pagination.totalPages} />
        </div>
      )}
      <ReasonDialog
        busy={decide.isPending}
        confirmLabel="Reject"
        destructive
        onClose={() => setRejecting(null)}
        onConfirm={async (reason) => {
          if (!rejecting) return;
          await decide.mutateAsync({ reason: reason || undefined, row: rejecting, status: "REJECTED" }).catch(() => undefined);
          setRejecting(null);
        }}
        open={!!rejecting}
        optional
        title={`Reject ${rejecting?.user.name ?? ""}?`}
      />
    </SectionCard>
  );
}

function SettingsPanel() {
  const settings = useTournamentSettings();
  const [draft, setDraft] = useState<TournamentSettingsDto | null>(null);
  const toast = useToast();
  const save = useAdminMutation(api.saveSettings);
  useEffect(() => {
    if (settings.data) setDraft(settings.data.settings);
  }, [settings.data]);
  if (!draft) return <Skeleton className="h-48" />;
  const set = (patch: Partial<TournamentSettingsDto>) => setDraft({ ...draft, ...patch });
  return (
    <SectionCard description="Applies to every tournament in the academy." title="Tournament settings">
      <div className="flex flex-col gap-4">
        <Switch checked={draft.coachesMayCreate} label="Coaches may create tournaments" onCheckedChange={(v) => set({ coachesMayCreate: v })} />
        <Switch
          checked={draft.coachesMayPublishPublic}
          disabled={!draft.coachesMayCreate}
          label="Coaches may publish public tournaments without approval"
          onCheckedChange={(v) => set({ coachesMayPublishPublic: v })}
        />
        <Switch checked={draft.allowAnonymousSpectating} label="Anyone with the link may watch public tournaments (no sign-in)" onCheckedChange={(v) => set({ allowAnonymousSpectating: v })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField hint={`0–${TOURNAMENT_MAX_SPECTATOR_DELAY_SEC} seconds. New tournaments start with this.`} id="settings-delay" label="Default spectator delay">
            <Input
              id="settings-delay"
              inputMode="numeric"
              onChange={(e) => set({ defaultSpectatorDelaySec: Math.min(TOURNAMENT_MAX_SPECTATOR_DELAY_SEC, Number(e.target.value.replace(/\D/g, "")) || 0) })}
              value={String(draft.defaultSpectatorDelaySec)}
            />
          </FormField>
          <FormField hint="How students' names appear to the public." id="settings-names" label="Public names">
            <Select
              id="settings-names"
              onChange={(e) => set({ publicNameFormat: e.target.value as TournamentSettingsDto["publicNameFormat"] })}
              options={TOURNAMENT_PUBLIC_NAME_FORMATS.map((f) => ({ label: TOURNAMENT_PUBLIC_NAME_FORMAT_LABELS[f], value: f }))}
              value={draft.publicNameFormat}
            />
          </FormField>
        </div>
        <div className="flex justify-end">
          <Button
            isLoading={save.isPending}
            onClick={() =>
              save.mutate(
                {
                  allowAnonymousSpectating: draft.allowAnonymousSpectating,
                  coachesMayCreate: draft.coachesMayCreate,
                  coachesMayPublishPublic: draft.coachesMayPublishPublic,
                  defaultSpectatorDelaySec: draft.defaultSpectatorDelaySec,
                  publicNameFormat: draft.publicNameFormat
                },
                { onSuccess: () => toast.success({ title: "Settings saved" }) }
              )
            }
          >
            Save settings
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

function TemplateDialog({ template, onClose }: { template: CertificateTemplateDto | "new"; onClose: () => void }) {
  const initial: CertificateTemplateRequest =
    template === "new"
      ? DEFAULT_CERTIFICATE_TEMPLATE
      : {
          accentColor: template.accentColor,
          body: template.body,
          borderStyle: template.borderStyle,
          name: template.name,
          orientation: template.orientation,
          secondSignatoryName: template.secondSignatoryName ?? null,
          secondSignatoryTitle: template.secondSignatoryTitle ?? null,
          signatoryName: template.signatoryName ?? null,
          signatoryTitle: template.signatoryTitle ?? null,
          title: template.title
        };
  const [form, setForm] = useState<CertificateTemplateRequest>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toast = useToast();
  const save = useAdminMutation((body: CertificateTemplateRequest) => (template === "new" ? api.createTemplate(body) : api.updateTemplate(template.id, body)));
  const set = (patch: Partial<CertificateTemplateRequest>) => setForm({ ...form, ...patch });
  const sample = { "academy.name": "Your academy", ageGroup: "U12", date: "1 December 2026", placement: ordinal(1), "player.name": "Asha R.", points: "6½", "tournament.name": "Winter Open" };
  const submit = () => {
    const parsed = certificateTemplateRequestSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    save.mutate(parsed.data, {
      onSuccess: () => {
        toast.success({ title: "Template saved" });
        onClose();
      }
    });
  };
  const field = (key: keyof CertificateTemplateRequest, label: string) => (
    <FormField error={errors[key]} id={`tpl-${key}`} label={label}>
      <Input id={`tpl-${key}`} onChange={(e) => set({ [key]: e.target.value || null } as Partial<CertificateTemplateRequest>)} value={(form[key] as string | null) ?? ""} />
    </FormField>
  );
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{template === "new" ? "New certificate template" : `Edit ${template.name}`}</DialogTitle>
          <DialogDescription>Placeholders: {CERTIFICATE_PLACEHOLDERS.map((p) => `{{${p}}}`).join(" ")}</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65dvh] gap-4 overflow-y-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-2">
            {field("name", "Template name")}
            {field("title", "Certificate title")}
          </div>
          <FormField error={errors.body} id="tpl-body" label="Text">
            <Textarea id="tpl-body" maxLength={1000} onChange={(e) => set({ body: e.target.value })} rows={3} value={form.body} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField id="tpl-orientation" label="Orientation">
              <Select
                id="tpl-orientation"
                onChange={(e) => set({ orientation: e.target.value as CertificateTemplateRequest["orientation"] })}
                options={CERTIFICATE_ORIENTATIONS.map((o) => ({ label: o === "LANDSCAPE" ? "Landscape" : "Portrait", value: o }))}
                value={form.orientation}
              />
            </FormField>
            <FormField id="tpl-border" label="Border">
              <Select
                id="tpl-border"
                onChange={(e) => set({ borderStyle: e.target.value as CertificateTemplateRequest["borderStyle"] })}
                options={CERTIFICATE_BORDER_STYLES.map((b) => ({ label: b.charAt(0) + b.slice(1).toLowerCase(), value: b }))}
                value={form.borderStyle}
              />
            </FormField>
            <FormField error={errors.accentColor} id="tpl-colour" label="Accent colour">
              <div className="flex items-center gap-2">
                <input aria-label="Pick a colour" className="h-9 w-12 shrink-0 cursor-pointer rounded-control border border-app-border bg-app-surface" onChange={(e) => set({ accentColor: e.target.value.toUpperCase() })} type="color" value={form.accentColor} />
                <Input id="tpl-colour" onChange={(e) => set({ accentColor: e.target.value })} value={form.accentColor} />
              </div>
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("signatoryName", "Signatory")}
            {field("signatoryTitle", "Signatory title")}
            {field("secondSignatoryName", "Second signatory")}
            {field("secondSignatoryTitle", "Second signatory title")}
          </div>
          <div className="rounded-control border border-app-border bg-paper p-4 text-center" style={{ borderTopColor: form.accentColor, borderTopWidth: 6 }}>
            <p className="text-lg font-semibold text-app-text">{renderCertificateText(form.title, sample)}</p>
            <p className="mt-2 text-sm text-app-muted">{renderCertificateText(form.body, sample)}</p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="neutral">
            Cancel
          </Button>
          <Button isLoading={save.isPending} onClick={submit}>
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplatesPanel() {
  const templates = useAdminTemplates();
  const [editing, setEditing] = useState<CertificateTemplateDto | "new" | null>(null);
  const archive = useAdminMutation(api.archiveTemplate);
  const toast = useToast();
  return (
    <SectionCard
      actions={
        <Button onClick={() => setEditing("new")} size="sm">
          <Plus className="size-4" />
          New template
        </Button>
      }
      description="Hosts pick from these when they set certificate rules."
      title="Certificate templates"
    >
      {!templates.data ? (
        <Skeleton className="h-32" />
      ) : templates.data.templates.length === 0 ? (
        <EmptyState action={{ label: "New template", onClick: () => setEditing("new") }} title="No templates yet" variant="inline" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead pin="end">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.data.templates.map((tpl) => (
              <TableRow key={tpl.id}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: tpl.accentColor }} />
                    {tpl.name}
                  </span>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{tpl.title}</TableCell>
                <TableCell>{tpl.archivedAt ? <Badge variant="secondary">Archived</Badge> : <Badge variant="success">Active</Badge>}</TableCell>
                <TableCell pin="end">
                  <div className="flex justify-end gap-1">
                    <SimpleTooltip label="Edit">
                      <Button aria-label="Edit" className="size-8 p-0" onClick={() => setEditing(tpl)} variant="neutral">
                        <Pencil className="size-4" strokeWidth={2.5} />
                      </Button>
                    </SimpleTooltip>
                    {!tpl.archivedAt ? (
                      <SimpleTooltip label="Archive (issued certificates keep their snapshot)">
                        <Button
                          aria-label="Archive"
                          className="size-8 p-0"
                          onClick={() => archive.mutate(tpl.id, { onSuccess: () => toast.success({ title: "Template archived" }) })}
                          variant="neutral"
                        >
                          <Archive className="size-4" strokeWidth={2.5} />
                        </Button>
                      </SimpleTooltip>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {editing ? <TemplateDialog onClose={() => setEditing(null)} template={editing} /> : null}
    </SectionCard>
  );
}

export function AdminTournamentsClient() {
  const [tab, setTab] = useState("overview");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        actions={
          <Button asChild>
            <Link href="/tournaments/new">
              <Plus className="size-4" />
              New tournament
            </Link>
          </Button>
        }
        description="Every tournament in the academy: who hosts, who plays, how they went."
        title="Tournaments"
      />
      <Tabs onValueChange={setTab} value={tab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="registrations">Registrations</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="templates">Certificates</TabsTrigger>
        </TabsList>
        <TabsContent className="pt-4" value="overview">
          <OverviewPanel />
        </TabsContent>
        <TabsContent className="pt-4" value="registrations">
          <RegistrationsPanel />
        </TabsContent>
        <TabsContent className="pt-4" value="settings">
          <SettingsPanel />
        </TabsContent>
        <TabsContent className="pt-4" value="templates">
          <TemplatesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
