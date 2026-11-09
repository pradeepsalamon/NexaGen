"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Trash2 } from "lucide-react";
import {
  TOURNAMENT_FORMAT_LABELS,
  TOURNAMENT_FORMATS,
  TOURNAMENT_IMAGE_MAX_BYTES,
  TOURNAMENT_MAX_SPECTATOR_DELAY_SEC,
  TOURNAMENT_TIME_CONTROL_PRESETS,
  TOURNAMENT_VISIBILITIES,
  TOURNAMENT_VISIBILITY_LABELS,
  createTournamentRequestSchema,
  type TournamentDetailDto,
  type TournamentImageKind,
  type UpdateTournamentRequest
} from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { ChoiceTile } from "@/components/ui/ChoiceTile";
import { DateStringPicker } from "@/components/ui/DatePicker";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { SectionCard } from "@/components/ui/SectionCard";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/providers/ToastProvider";
import { queryKeys } from "@/lib/queryKeys";
import { createTournament, removeTournamentImage, updateTournament, uploadTournamentImage } from "../api/tournamentsApi";
import { useTournament } from "../hooks/useTournaments";
import { defaultTournamentForm, toTournamentRequest, tournamentFormSchema, type TournamentForm } from "../validation/tournamentForm";

const FORMAT_HELP: Record<(typeof TOURNAMENT_FORMATS)[number], string> = {
  ARENA: "Play as many games as you can in a fixed time; quick re-pairing, streak bonuses.",
  KNOCKOUT: "Bracket of matches; the loser of each match is out.",
  ROUND_ROBIN: "Everyone plays everyone once (or twice).",
  SWISS: "A set number of rounds; players meet others on a similar score."
};

const LEVELS = [
  { label: "Beginner", value: "BEGINNER" },
  { label: "Intermediate", value: "INTERMEDIATE" },
  { label: "Advanced", value: "ADVANCED" }
] as const;

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function ImagePicker({ tournament, kind }: { tournament: TournamentDetailDto; kind: TournamentImageKind }) {
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const url = kind === "banner" ? tournament.bannerUrl : tournament.logoUrl;
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: queryKeys.tournaments.detail(tournament.id) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-sm font-medium text-app-text">{kind === "banner" ? "Banner" : "Logo"}</span>
      <div className={kind === "banner" ? "h-24 overflow-hidden rounded-control border border-app-border bg-app-soft" : "size-24 overflow-hidden rounded-control border border-app-border bg-app-soft"}>
        {/* eslint-disable-next-line @next/next/no-img-element -- uploaded image on the CDN */}
        {url ? <img alt="" className="size-full object-cover" src={url} /> : null}
      </div>
      <div className="flex gap-2">
        <input
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            if (file.size > TOURNAMENT_IMAGE_MAX_BYTES) return toast.error({ title: "That image is over 3 MB" });
            void run(() => uploadTournamentImage(tournament.id, kind, file));
          }}
          ref={input}
          type="file"
        />
        <Button isLoading={busy} onClick={() => input.current?.click()} size="sm" type="button" variant="outline">
          <ImagePlus className="size-4" />
          {url ? "Replace" : "Upload"}
        </Button>
        {url ? (
          <Button disabled={busy} onClick={() => void run(() => removeTournamentImage(tournament.id, kind))} size="sm" type="button" variant="ghost">
            <Trash2 className="size-4" />
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function EditorForm({ tournament }: { tournament?: TournamentDetailDto }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const initial = defaultTournamentForm(tournament);
  const form = useForm<TournamentForm>({ defaultValues: initial, resolver: zodResolver(tournamentFormSchema) });
  const { errors } = form.formState;
  const format = form.watch("format");
  const [saving, setSaving] = useState(false);
  const started = tournament ? !["DRAFT", "PUBLISHED"].includes(tournament.status) : false;
  const published = tournament ? tournament.status !== "DRAFT" : false;

  const submit = async (values: TournamentForm) => {
    const body = toTournamentRequest(values);
    const parsed = createTournamentRequestSchema.safeParse(body);
    if (!parsed.success && !started) {
      for (const issue of parsed.error.issues) {
        const path = String(issue.path[0] ?? "name");
        const field = (path === "timeControl" ? "initialMinutes" : path === "eligibility" ? "minRating" : path) as keyof TournamentForm;
        form.setError(field in values ? field : "name", { message: issue.message });
      }
      return;
    }
    setSaving(true);
    try {
      if (!tournament) {
        const created = await createTournament(body);
        toast.success({ message: "Add a banner, then publish it when you're ready.", title: "Tournament created" });
        void qc.invalidateQueries({ queryKey: queryKeys.tournaments.all });
        router.push(`/tournaments/${created.tournament.id}/edit`);
        return;
      }
      // Send only what changed (a started tournament takes only its texts).
      const before = toTournamentRequest(initial) as Record<string, unknown>;
      const changes: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(body)) {
        if (JSON.stringify(value) !== JSON.stringify(before[key])) changes[key] = value;
      }
      if (Object.keys(changes).length === 0) {
        router.push(`/tournaments/${tournament.id}`);
        return;
      }
      await updateTournament(tournament.id, { ...(changes as Partial<UpdateTournamentRequest>), version: tournament.version });
      await qc.invalidateQueries({ queryKey: queryKeys.tournaments.all });
      toast.success({ title: "Tournament saved" });
      router.push(`/tournaments/${tournament.id}`);
    } catch {
      // apiFetch already showed the reason.
    } finally {
      setSaving(false);
    }
  };

  const text = (name: keyof TournamentForm, label: string, props: { hint?: string; placeholder?: string; inputMode?: "numeric" | "decimal"; disabled?: boolean } = {}) => (
    <FormField error={errors[name]?.message as string | undefined} hint={props.hint} id={`t-${name}`} label={label}>
      <Input disabled={props.disabled} hasError={!!errors[name]} id={`t-${name}`} inputMode={props.inputMode} placeholder={props.placeholder} {...form.register(name)} />
    </FormField>
  );
  const when = (name: "startsAt" | "registrationOpensAt" | "registrationClosesAt", label: string, hint?: string) => (
    <FormField error={errors[name]?.message} hint={hint} id={`t-${name}`} label={label}>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <fieldset className="contents" disabled={started}>
            <DateStringPicker id={`t-${name}`} onChange={field.onChange} value={field.value} withTime />
          </fieldset>
        )}
      />
    </FormField>
  );

  return (
    <form className="flex flex-col gap-5" noValidate onSubmit={form.handleSubmit(submit)}>
      {started ? <Alert variant="info">This tournament has started: only its name, texts and spectator delay can change.</Alert> : null}
      <SectionCard description="What players see first." title="Basics">
        <div className="flex flex-col gap-4">
          {text("name", "Name", { placeholder: "Winter Rapid Open" })}
          <FormField hint="Plain text; links work." id="t-description" label="Description">
            <Textarea id="t-description" maxLength={4000} rows={4} {...form.register("description")} />
          </FormField>
          {tournament ? (
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <ImagePicker kind="banner" tournament={tournament} />
              <ImagePicker kind="logo" tournament={tournament} />
            </div>
          ) : (
            <p className="text-sm text-app-muted">You can add a banner and logo after saving.</p>
          )}
        </div>
      </SectionCard>

      <SectionCard description={published ? "The format is fixed once published." : "How players are paired."} title="Format">
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {TOURNAMENT_FORMATS.map((f) => (
              <ChoiceTile
                className="flex flex-col items-start gap-1 p-3 text-left"
                disabled={published}
                key={f}
                onClick={() => {
                  form.setValue("format", f, { shouldDirty: true });
                  if (f === "ROUND_ROBIN") form.setValue("rounds", "1");
                  if (f === "SWISS" && Number(form.getValues("rounds")) < 3) form.setValue("rounds", "5");
                }}
                selected={format === f}
              >
                <span className="font-semibold text-app-text">{TOURNAMENT_FORMAT_LABELS[f]}</span>
                <span className="text-xs text-app-muted">{FORMAT_HELP[f]}</span>
              </ChoiceTile>
            ))}
          </div>
          <Grid>
            {format === "SWISS" ? text("rounds", "Rounds", { disabled: started, inputMode: "numeric" }) : null}
            {format === "ROUND_ROBIN" ? (
              <FormField id="t-rounds" label="Cycles">
                <Select disabled={started} id="t-rounds" options={[{ label: "Single (play everyone once)", value: "1" }, { label: "Double (once with each colour)", value: "2" }]} {...form.register("rounds")} />
              </FormField>
            ) : null}
            {format === "ARENA" ? text("arenaDurationMin", "Duration (minutes)", { disabled: started, inputMode: "numeric" }) : null}
            {format === "KNOCKOUT" ? text("gamesPerMatch", "Games per match", { disabled: started, hint: "Best of this many.", inputMode: "numeric" }) : null}
            {format === "KNOCKOUT" ? (
              <FormField id="t-kotb" label="A level match">
                <Select
                  disabled={started}
                  id="t-kotb"
                  options={[{ label: "Sudden-death games", value: "SUDDEN_DEATH" }, { label: "Higher seed advances", value: "HIGHER_SEED" }]}
                  {...form.register("knockoutTiebreak")}
                />
              </FormField>
            ) : null}
            {format === "ARENA" ? (
              <div className="flex flex-col gap-3 sm:col-span-2">
                <Controller control={form.control} name="berserk" render={({ field }) => <Switch checked={field.value} disabled={started} label="Allow berserk (halve your clock for a bonus point)" onCheckedChange={field.onChange} />} />
                <Controller control={form.control} name="streaks" render={({ field }) => <Switch checked={field.value} disabled={started} label="Winning streaks score double" onCheckedChange={field.onChange} />} />
              </div>
            ) : null}
          </Grid>
        </div>
      </SectionCard>

      <SectionCard title="Time control and schedule">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {TOURNAMENT_TIME_CONTROL_PRESETS.map((preset) => (
              <Button
                disabled={started}
                key={preset.label}
                onClick={() => {
                  form.setValue("initialMinutes", String(preset.value.initialSeconds / 60));
                  form.setValue("incrementSeconds", String(preset.value.incrementSeconds));
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <Grid>
            {text("initialMinutes", "Minutes per player", { disabled: started, inputMode: "decimal" })}
            {text("incrementSeconds", "Increment (seconds per move)", { disabled: started, inputMode: "numeric" })}
            {when("startsAt", "Starts at")}
            {format === "ARENA" ? null : text("roundBreakSec", "Break between rounds (seconds)", { disabled: started, inputMode: "numeric" })}
          </Grid>
        </div>
      </SectionCard>

      <SectionCard description="Who can see the tournament and how players get in." title="Entry">
        <div className="flex flex-col gap-4">
          <FormField id="t-visibility" label="Visibility">
            <Select
              disabled={started}
              id="t-visibility"
              options={TOURNAMENT_VISIBILITIES.map((v) => ({ label: TOURNAMENT_VISIBILITY_LABELS[v], value: v }))}
              {...form.register("visibility")}
            />
          </FormField>
          <Grid>
            {when("registrationOpensAt", "Registration opens", "Blank: when published.")}
            {when("registrationClosesAt", "Registration closes", "Blank: at the start.")}
            {text("minPlayers", "Minimum players", { disabled: started, inputMode: "numeric" })}
            {text("maxPlayers", "Player cap", { disabled: started, hint: "Blank: no cap.", inputMode: "numeric" })}
            {format === "SWISS" || format === "ARENA"
              ? text("lateRegistrationRounds", format === "ARENA" ? "Late entry (0 = closed at start, 1+ = open)" : "Late entry until round", { disabled: started, inputMode: "numeric" })
              : null}
          </Grid>
          <Controller
            control={form.control}
            name="registrationRequiresApproval"
            render={({ field }) => <Switch checked={field.value} disabled={started} label="A host approves each registration" onCheckedChange={field.onChange} />}
          />
        </div>
      </SectionCard>

      <SectionCard description="Leave blank for no limit. Ratings come from student profiles." title="Eligibility">
        <div className="flex flex-col gap-4">
          <Grid>
            {text("minRating", "Minimum rating", { disabled: started, inputMode: "numeric" })}
            {text("maxRating", "Maximum rating", { disabled: started, inputMode: "numeric" })}
            {text("minAge", "Minimum age", { disabled: started, inputMode: "numeric" })}
            {text("maxAgeUnder", "Under this age (e.g. 12 = U12)", { disabled: started, inputMode: "numeric" })}
          </Grid>
          <Controller control={form.control} name="allowUnrated" render={({ field }) => <Switch checked={field.value} disabled={started} label="Unrated players may enter" onCheckedChange={field.onChange} />} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-app-text">Experience levels (none ticked = all)</legend>
            <Controller
              control={form.control}
              name="experienceLevels"
              render={({ field }) => (
                <div className="flex flex-wrap gap-4">
                  {LEVELS.map((level) => (
                    <Checkbox
                      checked={field.value.includes(level.value)}
                      disabled={started}
                      key={level.value}
                      label={level.label}
                      onCheckedChange={(checked) => field.onChange(checked === true ? [...field.value, level.value] : field.value.filter((v) => v !== level.value))}
                    />
                  ))}
                </div>
              )}
            />
          </fieldset>
        </div>
      </SectionCard>

      <SectionCard title="Rules, prizes and spectators">
        <div className="flex flex-col gap-4">
          <FormField id="t-rules" label="Rules">
            <Textarea id="t-rules" maxLength={8000} rows={4} {...form.register("rulesText")} />
          </FormField>
          <FormField id="t-prizes" label="Prizes">
            <Textarea id="t-prizes" maxLength={8000} rows={3} {...form.register("prizesText")} />
          </FormField>
          {text("spectatorDelaySec", "Spectator delay (seconds)", {
            hint: `Spectators see moves this much later (max ${TOURNAMENT_MAX_SPECTATOR_DELAY_SEC}). Blank: the academy default.`,
            inputMode: "numeric"
          })}
        </div>
      </SectionCard>

      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild type="button" variant="neutral">
          <Link href={tournament ? `/tournaments/${tournament.id}` : "/tournaments"}>Cancel</Link>
        </Button>
        <Button isLoading={saving} type="submit">
          {tournament ? "Save changes" : "Create draft"}
        </Button>
      </div>
    </form>
  );
}

export function TournamentEditor({ tournamentId }: { tournamentId?: string }) {
  const query = useTournament(tournamentId ?? "");
  if (!tournamentId) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <PageHeader breadcrumbs={[{ href: "/tournaments", label: "Tournaments" }, { label: "New" }]} description="Saved as a draft; nobody sees it until you publish." title="New tournament" />
        <EditorForm />
      </div>
    );
  }
  if (query.isError) return <Alert variant="error">This tournament isn&apos;t available.</Alert>;
  if (!query.data) return <Skeleton className="h-96 w-full" />;
  const t = query.data.tournament;
  if (!t.viewer.canManage) return <Alert variant="error">Only the tournament&apos;s hosts and academy admins can edit it.</Alert>;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader
        breadcrumbs={[{ href: "/tournaments", label: "Tournaments" }, { href: `/tournaments/${t.id}`, label: t.name }, { label: "Edit" }]}
        title={`Edit ${t.name}`}
      />
      <EditorForm key={t.version} tournament={t} />
    </div>
  );
}
