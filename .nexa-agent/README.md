# nexa-agent — multi-agent orchestrator (v2)

Autonomous development for the NexaGen monorepo. You describe what you want in
chat; a supervisor agent proposes a plan; worker agents implement, test and fix
it on an isolated git branch; you approve the merge. Nothing reaches `dev_vps`
without you saying so.

Everything here operates on `/opt/nexa-chess/NexaGen-dev` and the `vps_dev`
database only. See [config/SAFETY.md](config/SAFETY.md) — those boundaries are
not negotiable and are enforced in code, not just documented.

---

## Start here

```bash
cd /opt/nexa-chess/NexaGen-dev/.nexa-agent
npm run agent -- chat
```

That is the whole interface. Ask it what is running, ask it to explain a
failure, or tell it what to build:

```
you > what's waiting on me?
you > add a helper that formats a duration in ms as "2m 5s", with tests
```

It proposes before it acts, and it starts nothing until you agree. For the web
version, see [Control UI](#control-ui) below.

---

## How it works

```
  you ──chat──> supervisor ──creates──> task ──> QUEUED
                                                    │
                                    one at a time, on dev_vps
                                                    ▼
                    backend-dev ──> frontend-dev ──> tester-e2e
                                                        │
                                          pass ─────────┴───────── fail
                                            │                        │
                              PASS_AWAITING_APPROVAL            bug-fixer
                                            │                        │
                              ┌─────────────┴──────────┐        re-test ──┐
                              ▼                        ▼          ▲      │
                       approve (keep)           revert (undo)     └──────┘
                                                              (max 5 attempts)
```

**There are no task branches.** Agents commit straight to `dev_vps`, so the
human's decision is *keep* or *undo*, not *merge or not*. Nothing is ever
pushed.

Two things follow from that, and both are load-bearing:

- **Exactly one task runs at a time.** Two tasks committing to one branch would
  interleave, and `commitLeftovers` (the net that rescues work an agent forgot
  to commit) would sweep the other task's files into the wrong commit. The
  runner lock in `runner-lock.ts` enforces it; `start` means "get in line".
- **A task's commits are recorded per step**, not derived from `base..HEAD`.
  That range now also contains later tasks' commits and any human commit in
  between — reverting it would undo other people's work.

Every step is a **fresh CLI session**. No agent ever continues another agent's
conversation. The only input a worker receives is a task packet: the goal, the
constraints, the previous agent's report, and the real cumulative `git diff` of
the branch so far — never a description of the change.

The next action is a **pure function of `state.json`**
(`orchestrator.ts#nextAction`). Kill the orchestrator mid-task and it resumes
from the state file alone.

### The supervisor is not a worker

| | Workers (`backend-dev`, `tester-e2e`, …) | Supervisor |
|---|---|---|
| Session | fresh every dispatch, no memory | resumed, remembers the conversation |
| Permissions | bypassed, fenced by `guard.sh` | explicit allowlist, `--permission-prompts none` |
| Can edit files | yes, on a task branch | **no — no write tools at all** |
| Talks to you | never | always |

The supervisor can read the repo and drive the orchestrator CLI. It cannot
change a line of code. Code changes only ever happen inside a task branch, by a
worker, under test — that is the only path that is reviewed and reversible.

---

## Roles, agents and chains

Roles are decoupled from agents: any agent can fill any role, per task.
Defaults live in [config/roles.json](config/roles.json).

| Role | Default agent | Commits? |
|---|---|---|
| `backend-dev` | claude | yes |
| `frontend-dev` | claude | yes |
| `fullstack-architect` | claude | yes |
| `tester-e2e` | opencode | no |
| `bug-fixer` | antigravity | yes |
| `reviewer` | claude | no |

Chains: `feature` (backend → frontend → tester), `architected-feature`
(architect → backend → frontend → tester), `backend-only`, `frontend-only`,
`test-only`, `review-only`, `architect-only`.

Override per task: `--agent backend-dev=antigravity --model backend-dev=gemini-3.1-pro-high`,
or per role in the control UI's `/new` form.

### Choosing models

`npm run agent -- roles` prints every agent, its models and which is default.

| Where | Scope | How |
|---|---|---|
| **Team tab** in the UI | permanent | agent + model for the supervisor and every role. Writes the two config files below |
| `config/roles.json` → `default_agent`, `default_model` | permanent, per role | who fills the role |
| `config/agents.json` → `default_model` | permanent, per agent | used when nothing more specific applies |
| `--agent` / `--model` on `create` | one task | frozen into `state.json` at creation |
| `/new` in the UI | one task | per-role Agent + Model dropdowns |
| `NEXA_CLAUDE_MODEL`, `NEXA_ANTIGRAVITY_MODEL`, `NEXA_OPENCODE_MODEL` | one run | env override |

Precedence is task → environment → role `default_model` → agent
`default_model` → the CLI's own account default. Leaving `default_model` unset is not the same as pinning a model: it
means whatever the CLI account currently defaults to, which can change under
you.

The supervisor is configured separately in `config/supervisor.json` (`agent`,
`model`, `max_budget_usd`, `timeout_seconds`). It is deliberately not in
`agents.json` so no worker role can be assigned to it.

### Switching supervisor

Any of the three CLIs can be the supervisor — pick one in the chat header, the
Team tab, or `npm run agent -- chat --agent opencode`. Each is confined to
read-only: Claude by an explicit `--allowedTools` allowlist plus
`--permission-prompts none`, antigravity by `--mode plan`, opencode by its
`plan` agent. None of them can edit a file.

CLI sessions are not portable between agents, so switching mid-conversation
starts a fresh session and replays a trimmed transcript to the new supervisor,
which then continues rather than greeting you again.

Registered agents are in [config/agents.json](config/agents.json), including a
`_corrections` block recording where each CLI's real invocation differs from what
the documentation claims — `--max-turns`, `--headless` and `--input` do not exist
on these builds, and Antigravity ignores `settings.json` permissions in print
mode, which is why it hung silently in v1.

---

## Commands

```bash
npm run agent -- chat [--new] [--thread <id>] [--once "..."]
                      [--agent claude|antigravity|opencode] [--model <model>]
npm run agent -- chats                        saved conversations

npm run agent -- status                       everything, grouped by status
npm run agent -- list [--json]
npm run agent -- show <task-id>
npm run agent -- next <task-id>               what the state machine would do, and why
npm run agent -- roles

npm run agent -- create --summary "..." --chain <chain|role,role>
                        [--agent role=agent]... [--model role=model]... [--paths a,b]
npm run agent -- start <task-id> [--resume]   background worker, returns immediately
npm run agent -- run <task-id> [--resume]     blocking, prints each step
npm run agent -- dispatch <task-id>           one step only
npm run agent -- approve <task-id> --by <name>
npm run agent -- reject <task-id> --reason "..."
```

### Task statuses

| Status | Meaning |
|---|---|
| `QUEUED` | waiting its turn; another task holds the runner |
| `RUNNING` / `TESTING` / `FIXING` | agents are working |
| `PASS_AWAITING_APPROVAL` | tester passed; the commits are on `dev_vps` awaiting your keep-or-undo |
| `BLOCKED_RETRY` | **interrupted, not failed** — the agent ran out of quota. Work so far is committed, and the runner retries it automatically when the quota resets |
| `FAILED` | the work is genuinely wrong, or attempts ran out |
| `MERGED` | you accepted the commits |
| `REVERTED` | the task's commits were undone |

`BLOCKED_RETRY` is the one that is easy to misread. It does not mean the agent
did bad work — it means it was severed mid-flight. See
[CONTEXT_BUDGET.md](CONTEXT_BUDGET.md) for how that failure mode was found and
why a parseable result file is not proof of completion.

### Quota, and waiting it out

When a CLI reports it is out of quota, the runner reads the reset time out of
the error prose — `"resets 9:30am (UTC)"`, `"try again in 42 minutes"` — records
it as `retry_at`, and picks the task up again when it passes. Nothing else is
needed; `npm run agent -- queue` shows the countdown.

The parsing is necessarily approximate, so an unrecognised message still yields
a usable answer (a conservative 30-minute wait) rather than nothing. Waiting a
little too long costs time; retrying too early burns the retry and can re-trip
the limit. A task waiting on quota does not block the queue — the runner moves
on to anything else that is ready.

---

## Control UI

```bash
cd control/ui && npm install && npm run dev   # http://localhost:3010
```

**One process, one port.** The orchestrator is called directly from Next.js
route handlers under `src/app/api/`; there is no separate API server. That is
why `.nexa-agent/package.json` carries no `"type"` field — ts-node needs
CommonJS, and Turbopack refuses to bundle ESM-syntax `.ts` from a package that
declares it explicitly. Absent satisfies both.

Mobile-first. Four surfaces: **Chat** (the home screen — same supervisor as the
CLI, with the agent/model picker in its header), **Tasks** (list and detail,
with diffs, per-step results, approve/reject and resume), **Team** (agent and
model for the supervisor and every role), and `/new` (the raw create form).

`/new` is the lever that once turned a plain "hi" into a git branch and a merge,
because a bare text box cannot tell a greeting from a work request. It is kept
for deliberate use; the conversation is the safe way in.

---

## Layout

```
config/          agents.json, roles.json, supervisor.json, SAFETY.md
agents/
  _lib/          guard.sh (safety, exit 90), build-prompt.sh, validate-result.sh (exit 91)
  claude/ antigravity/ opencode/    worker wrappers, one per CLI
  supervisor/    run.sh + SUPERVISOR.md (the conversational system prompt)
orchestrator/
  cli.ts         command surface
  runner.ts      the serial queue; runner-lock.ts, runner-cli.ts
  quota.ts       reads reset times out of CLI error prose
  orchestrator.ts state machine + dispatch
  state.ts git.ts task-packet.ts context-budget.ts paths.ts types.ts
  chat/          thread.ts supervisor.ts repl.ts config.ts
  worker.ts      drives one task to a stopping point, detached
control/ui/      Next.js app -- UI and API in one process
  src/app/api/   route handlers calling the orchestrator directly
state/           tasks/<id>/state.json, chat/<thread>.json   (gitignored)
logs/ reports/   per-agent logs, handoff records              (gitignored)
```

`state/`, `logs/` and `reports/` are gitignored deliberately, not as
housekeeping: they are per-machine runtime data. Task branches also exclude
`.nexa-agent/**` from their commits (`:(exclude).nexa-agent/**`), so the
orchestrator's own source never leaks into a feature diff.

---

## Safety, in code

- `agents/_lib/guard.sh` (exit **90**) runs before every worker dispatch:
  asserts the workspace is the dev root, refuses prompts referencing the
  production tree or a production container, and verifies `DATABASE_URL` points
  at `vps_dev`.
- `agents/_lib/validate-result.sh` (exit **91**) rejects a malformed result
  before it can corrupt task state.
- Only the orchestrator touches git. Agents commit; they never branch, merge or
  push.
- `revertTask` is the undo path. It reverts each of the task's own commits
  rather than resetting, so later work survives, and it aborts cleanly rather
  than leaving the tree half-undone if a revert conflicts.
- Tasks created before this model, on their own `agent/*` branch, are refused
  by the runner: running one would check that branch out and silently move HEAD
  off `dev_vps`.
- Production deployment always requires a human. Passing tests are not
  permission.
