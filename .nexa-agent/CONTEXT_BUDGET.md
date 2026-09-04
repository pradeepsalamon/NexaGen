# Context budget: what was measured, and why the cap behaves as it does

The spec asked that a Claude session never exceed ~50% of its context window
before checkpointing and restarting with a compact handoff summary. Building
that turned up three things worth writing down, because each one silently
defeats a naive implementation.

---

## 1. `input_tokens` is not what occupies the window

Claude Code's JSON result reports `input_tokens` as only the **new** input for
the final turn. The conversation actually sitting in the window arrives as
`cache_read_input_tokens` and `cache_creation_input_tokens`.

Real numbers from this repository:

| Step | `input_tokens` | `cache_read` | `cache_creation` | Real occupancy |
|---|---|---|---|---|
| trivial read-only step | 10 | 116,760 | 21,756 | ~138k |
| one-file doc edit | 18 | 234,728 | — | ~235k |
| three utilities + specs | 26 | 371,551 | 26,528 | ~404k |

A budget computed from `input_tokens` alone reads as roughly 0% forever, and the
cap never fires. `contextTokens()` in `orchestrator/context-budget.ts` therefore
sums input + cache_read + cache_creation + output.

## 2. A "200k window" is routinely exceeded by ordinary work

Look at that table again. A one-file documentation edit occupied ~235k tokens —
more than the nominal window — because Claude Code compacts and re-reads as it
goes. The 404k figure came from a task that added three small utility functions
with tests.

So a literal "50% of 200k = 100k" ceiling would fire on essentially every real
step. Checkpoint-and-restart would become the normal path rather than the
exception, and each restart costs a fresh session and a re-read of the diff.

**This is why the budget is advisory, not a tripwire.** `evaluateBudget()`
triggers a continuation session on the agent emitting a `handoff_summary` — the
agent's own statement that it has more to do — and not on the token count. An
agent that finished the job inside its last turn is finished, regardless of how
much context it burned getting there. The token budget is passed into the packet
so the agent can pace itself and stop deliberately, and it derives the CLI's hard
`--max-budget-usd`. It does not, by itself, invalidate completed work.

Current setting: `context_budget_pct: 50` on a 200,000-token window in
`config/agents.json`.

## 3. Enforcement cannot be mid-turn

`claude -p` is single-shot. Usage is reported only when the turn ends, so there
is no point at which the orchestrator can interrupt a running session and ask it
to summarise. The spec's "check before each turn" is not achievable in print
mode. Enforcement is two-sided instead:

- **Pre-emptive** — the packet states the budget and instructs the agent to stop
  and emit `handoff_summary` rather than run past it, and the CLI gets a hard
  `--max-budget-usd` derived from that budget.
- **Post-hoc** — the orchestrator reads usage after the session and, if the agent
  checkpointed, dispatches a fresh session for the same role-step carrying the
  summary forward.

True mid-turn interception would need `--input-format stream-json` and a resident
supervisor process. That is recorded as a known limitation rather than pretended
away.

### The dollar floor

A token budget translates to a dollar cap at roughly $3.5/M (calibrated: 235k
tokens cost $0.49). `MIN_BUDGET_USD = 2` floors it. Without that floor, a
deliberately low test threshold derived a $0.014 cap, which killed the CLI before
it could write its result file — turning the checkpoint being tested into a
crash.

---

## What the budget test actually found

The forced-threshold test (`context_budget_pct: 2`, a 4,000-token budget) did not
produce a checkpoint. It produced something more useful.

The session hit the **account usage limit** at turn 14:

```json
{ "is_error": true,
  "terminal_reason": "api_error",
  "result": "You've hit your session limit · resets 9:30am (UTC)" }
```

The CLI still exited 0. The agent had already written a well-formed result file,
so validation passed, and the orchestrator recorded `outcome: ok`, rescued the
working tree with `commitLeftovers`, and moved the task to
`PASS_AWAITING_APPROVAL`.

**A severed session was presented to the human as finished work ready to merge.**

That is fixed. `dispatchStep` now treats the CLI's own `is_error` flag as
authoritative over a result file that happens to parse:

- outcome becomes `agent_error`, never `ok`
- the task halts at `BLOCKED_RETRY` — a non-terminal status meaning *interrupted*,
  distinct from `FAILED`, which means *the work is wrong*
- `attempt` is not consumed, and the chain does not advance
- `npm run agent -- run <id> --resume` re-dispatches the same role-step in a
  fresh session, carrying a synthesized handoff describing what the severed
  session had already committed

Three earlier tasks had died the same way and been recorded as hard `FAILED`
with no path back. Under the current code they would be resumable.

**The lesson generalises beyond usage limits:** an agent's structured output is
evidence of what it *intended*, not proof that it finished. Where the runtime
tells you the session ended abnormally, the runtime wins.
