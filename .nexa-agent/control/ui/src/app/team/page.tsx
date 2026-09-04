"use client";

/**
 * Who does what.
 *
 * The supervisor block picks the agent you are talking to; the role blocks pick
 * which agent and model fills each worker role. Saving writes
 * config/supervisor.json and config/roles.json, so a change here is the new
 * default for every task created afterwards -- it never touches a task already
 * running, because role assignments are frozen into state.json at creation.
 */

import { useCallback, useEffect, useState } from "react";
import { Bot, Check, GitBranch, Loader2, MessageSquare, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModelOption {
  id: string;
  label: string;
}
interface AgentInfo {
  name: string;
  cli: string;
  default_model: string | null;
  models: ModelOption[];
}
interface RoleInfo {
  name: string;
  description: string;
  agent: string;
  model: string | null;
  must_commit: boolean;
}
interface Team {
  supervisor: { agent: string; model: string | null; max_budget_usd: number; timeout_seconds: number };
  agents: AgentInfo[];
  roles: RoleInfo[];
  chains: Record<string, string[]>;
}

/** Roles have jobs, not just names. */
const ROLE_LABEL: Record<string, string> = {
  "backend-dev": "Backend Dev",
  "frontend-dev": "Frontend Dev",
  "fullstack-architect": "Full-Stack Architect",
  "tester-e2e": "E2E Tester",
  "bug-fixer": "Bug Fixer",
  reviewer: "Reviewer",
};

/**
 * A labelled select that survives a 360px screen.
 *
 * Three things are load-bearing here. `min-w-0` lets the flex item shrink below
 * its content width -- without it a long option like "Gemini 3.8 Flash (Ultra
 * Fast ~15s)" forces the row wider than the viewport and the page scrolls
 * sideways. `w-full` plus `truncate` keeps the closed select inside that box.
 * And the pickers stack on narrow screens rather than sitting side by side,
 * because two selects sharing 360px leaves neither readable.
 */
function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-app-text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 truncate rounded-lg border border-app-border bg-app-bg px-2 py-2.5 text-sm outline-none focus:border-app-primary"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function TeamPage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/team");
    if (res.ok) setTeam(await res.json());
    else setError((await res.json()).error ?? "failed to load");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const agentFor = (name: string) => team?.agents.find((a) => a.name === name);

  /** Model options for an agent, plus the "whatever the CLI defaults to" choice. */
  const modelOptions = (agentName: string) => {
    const agent = agentFor(agentName);
    return [
      { value: "", label: `CLI default${agent?.default_model ? ` (${agent.default_model})` : ""}` },
      ...(agent?.models ?? []).map((m) => ({ value: m.id, label: m.label })),
    ];
  };

  function setSupervisor(patch: Partial<Team["supervisor"]>) {
    if (!team) return;
    const next = { ...team.supervisor, ...patch };
    // A model from the old agent is meaningless under the new one.
    if (patch.agent && patch.agent !== team.supervisor.agent) next.model = null;
    setTeam({ ...team, supervisor: next });
    setSaved(false);
  }

  function setRole(name: string, patch: Partial<RoleInfo>) {
    if (!team) return;
    setTeam({
      ...team,
      roles: team.roles.map((r) => {
        if (r.name !== name) return r;
        const next = { ...r, ...patch };
        if (patch.agent && patch.agent !== r.agent) next.model = null;
        return next;
      }),
    });
    setSaved(false);
  }

  async function save() {
    if (!team) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/team", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supervisor: { agent: team.supervisor.agent, model: team.supervisor.model || null },
          roles: team.roles.map((r) => ({ role: r.name, agent: r.agent, model: r.model || null })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `save failed (${res.status})`);
      setTeam(data);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (error && !team) {
    return <p className="rounded-lg border border-app-error/30 bg-app-error/5 p-3 text-sm text-app-error">{error}</p>;
  }
  if (!team) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-app-text-muted">
        <Loader2 className="size-4 animate-spin" /> Loading team…
      </div>
    );
  }

  const agentOptions = team.agents.map((a) => ({ value: a.name, label: `${a.name} (${a.cli})` }));

  return (
    <div className="flex w-full max-w-full flex-col gap-5 overflow-x-hidden pb-24">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="mt-1 text-sm text-app-text-muted">
          Who you talk to, and who does the work. Changes apply to tasks created from now on — a task
          already running keeps the agents it was created with.
        </p>
      </div>

      <section className="rounded-2xl border border-app-primary/30 bg-app-primary/5 p-4">
        <h2 className="mb-1 flex items-center gap-2 font-semibold text-app-primary">
          <MessageSquare className="size-4" /> Supervisor
        </h2>
        <p className="mb-3 text-xs text-app-text-muted">
          The agent you chat with. It reads the repo and drives the orchestrator, and has no write
          tools at all — switching it mid-conversation carries a transcript recap across, since CLI
          sessions are not portable.
        </p>
        <div className="flex flex-col gap-2 min-[400px]:flex-row">
          <Picker
            label="Agent"
            value={team.supervisor.agent}
            options={agentOptions}
            onChange={(v) => setSupervisor({ agent: v })}
          />
          <Picker
            label="Model"
            value={team.supervisor.model ?? ""}
            options={modelOptions(team.supervisor.agent)}
            onChange={(v) => setSupervisor({ model: v || null })}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Bot className="size-4 text-app-text-muted" /> Roles
        </h2>

        {team.roles.map((role) => (
          <div key={role.name} className="rounded-2xl border border-app-border bg-app-surface p-4">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 truncate font-medium">{ROLE_LABEL[role.name] ?? role.name}</span>
              <span
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]",
                  role.must_commit
                    ? "border-app-warning/30 bg-app-warning/10 text-app-warning"
                    : "border-app-success/30 bg-app-success/10 text-app-success",
                )}
                title={role.must_commit ? "Writes code and commits it" : "Reads only, never commits"}
              >
                {role.must_commit ? <GitBranch className="size-3" /> : <ShieldCheck className="size-3" />}
                {role.must_commit ? "commits" : "read-only"}
              </span>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-app-text-muted">{role.description}</p>
            <div className="flex flex-col gap-2 min-[400px]:flex-row">
              <Picker
                label="Agent"
                value={role.agent}
                options={agentOptions}
                onChange={(v) => setRole(role.name, { agent: v })}
              />
              <Picker
                label="Model"
                value={role.model ?? ""}
                options={modelOptions(role.agent)}
                onChange={(v) => setRole(role.name, { model: v || null })}
              />
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-app-border bg-app-surface p-4">
        <h2 className="mb-2 font-semibold">Chains</h2>
        <p className="mb-3 text-xs text-app-text-muted">
          The role sequences a task can run. Pick one when creating a task.
        </p>
        <div className="flex flex-col gap-2">
          {Object.entries(team.chains).map(([name, chain]) => (
            <div key={name} className="flex flex-col gap-1 text-xs">
              <span className="font-mono text-app-text-muted">{name}</span>
              <div className="flex flex-wrap items-center gap-1">
                {chain.map((r, i) => (
                  <span key={r} className="flex items-center gap-1">
                    {i > 0 && <span className="text-app-text-muted">→</span>}
                    <span className="rounded-full border border-app-border bg-app-bg px-2 py-0.5">
                      {ROLE_LABEL[r] ?? r}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {error && (
        <p className="rounded-lg border border-app-error/30 bg-app-error/5 p-2 text-xs text-app-error">{error}</p>
      )}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="fixed bottom-24 left-1/2 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-center gap-2 rounded-xl bg-app-primary py-3 font-medium text-white shadow-lg shadow-app-primary/30 disabled:opacity-50"
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : saved ? <Check className="size-4" /> : null}
        {saving ? "Saving…" : saved ? "Saved" : "Save team"}
      </button>
    </div>
  );
}
