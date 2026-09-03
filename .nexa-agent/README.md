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
  you ──chat──> supervisor ──creates──> task ──> branch off dev_vps
                                                    │
                            ┌───────────────────────┘
                            ▼
                    backend-dev ──> frontend-dev ──> tester-e2e
                                                        │
                                          pass ─────────┴───────── fail
                                            │                        │
                              PASS_AWAITING_APPROVAL            bug-fixer
                                            │                        │
                                   you approve                  re-test ──┐
                                            │                     ▲      │
                                            ▼                     └──────┘
                                   merged into dev_vps          (max 5 attempts)
```

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
| `tester-e2e` | opencode | no |
| `bug-fixer` | antigravity | yes |
| `reviewer` | claude | no |

Chains: `feature` (backend → frontend → tester), `backend-only`,
`frontend-only`, `test-only`, `review-only`.

Override per task: `--agent backend-dev=antigravity`.

Registered agents are in [config/agents.json](config/agents.json), including a
`_corrections` block recording where each CLI's real invocation differs from what
the documentation claims — `--max-turns`, `--headless` and `--input` do not exist
on these builds, and Antigravity ignores `settings.json` permissions in print
mode, which is why it hung silently in v1.

---

## Commands

```bash
npm run agent -- chat [--new] [--thread <id>] [--once "..."]
npm run agent -- chats                        saved conversations

npm run agent -- status                       everything, grouped by status
npm run agent -- list [--json]
npm run agent -- show <task-id>
npm run agent -- next <task-id>               what the state machine would do, and why
npm run agent -- roles

npm run agent -- create --summary "..." --chain <chain|role,role> [--paths a,b]
npm run agent -- start <task-id> [--resume]   background worker, returns immediately
npm run agent -- run <task-id> [--resume]     blocking, prints each step
npm run agent -- dispatch <task-id>           one step only
npm run agent -- approve <task-id> --by <name>
npm run agent -- reject <task-id> --reason "..."
```

### Task statuses

| Status | Meaning |
|---|---|
| `RUNNING` / `TESTING` / `FIXING` | agents are working |
| `PASS_AWAITING_APPROVAL` | tester passed; waiting on your merge decision |
| `BLOCKED_RETRY` | **interrupted, not failed** — a usage limit or API error cut the session short; partial work is committed. `run --resume` continues it |
| `FAILED` | the work is genuinely wrong, or attempts ran out. Branch left intact |
| `MERGED` | merged into `dev_vps` locally. Never pushed |

`BLOCKED_RETRY` is the one that is easy to misread. It does not mean the agent
did bad work — it means it was severed mid-flight. See
[CONTEXT_BUDGET.md](CONTEXT_BUDGET.md) for how that failure mode was found and
why a parseable result file is not proof of completion.

---

## Control UI

```bash
cd control/api && npm install && npm start     # port 3011
cd control/ui  && npm install && npm run dev   # port 3010
```

Mobile-first. Three surfaces: **Chat** (the home screen — same supervisor as the
CLI), **Tasks** (list and detail, with diffs, per-step results, approve/reject
and resume), and `/new` (the raw create form).

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
  orchestrator.ts state machine + dispatch
  state.ts git.ts task-packet.ts context-budget.ts paths.ts types.ts
  chat/          thread.ts supervisor.ts repl.ts
control/api/     express control API + detached task worker
control/ui/      Next.js mobile UI
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
- `approveTask` is the only merge path, it is `--no-ff`, and it never pushes.
- Production deployment always requires a human. Passing tests are not
  permission.
