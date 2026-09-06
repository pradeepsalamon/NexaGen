/**
 * Context budget accounting and checkpoint/restart (spec section 7).
 *
 * MEASUREMENT NOTE -- this is the part that is easy to get wrong.
 * Claude Code's JSON result reports `input_tokens` as only the NEW input for the
 * final turn; the conversation actually occupying the context window arrives as
 * `cache_read_input_tokens` + `cache_creation_input_tokens`. A budget computed
 * from `input_tokens` alone reads as ~0% forever and the cap silently never
 * fires. Real measurements from this repo:
 *
 *   trivial read-only step : input 10, cache_read 116,760  -> ~138k occupancy
 *   one-file doc edit      : input 18, cache_read 234,728  -> ~235k occupancy
 *
 * So `contextTokens()` sums all three, and a "200k window" is already exceeded
 * by a one-file edit. See CONTEXT_BUDGET.md for what that means for the 50% cap.
 *
 * ENFORCEMENT NOTE.
 * `claude -p` is single-shot: usage is only reported when the turn ends, so
 * there is no way to interrupt mid-session and ask for a summary. Enforcement is
 * therefore two-sided:
 *   1. Pre-emptive  -- the packet tells the agent its budget and instructs it to
 *      stop and emit `handoff_summary` rather than run past it, and the CLI is
 *      given a hard `--max-budget-usd` derived from that budget.
 *   2. Post-hoc     -- the orchestrator reads usage after the session and, if the
 *      agent checkpointed (or blew the budget), dispatches a FRESH session for
 *      the same role-step carrying the handoff summary forward.
 * True mid-turn interception would need --input-format stream-json; that is
 * recorded as a known limitation rather than assumed to work.
 */
import type { AgentConfig, StepRecord } from "./types";

/** Hard ceiling on checkpoint restarts within one role-step, so a task cannot loop forever. */
export const MAX_SESSIONS_PER_STEP = 5;

/**
 * Rough blended $/token used to translate a token budget into --max-budget-usd.
 * Calibrated against a measured step: ~235k context tokens cost $0.49 (~$2.1/M),
 * so this errs high and the dollar cap will not bite before the token budget does.
 */
const USD_PER_TOKEN = 3.5 / 1_000_000;

/**
 * Floor for the CLI dollar cap. A very low token budget (a forced test
 * threshold, say) would otherwise derive a cap so small the CLI is killed
 * before it can write its result file, turning a checkpoint into a crash.
 */
const MIN_BUDGET_USD = 2;

export interface UsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number | null;
  turns: number | null;
  /** False for CLIs with no token accounting (antigravity, opencode). */
  measured: boolean;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function parseUsage(raw: Record<string, unknown> | null | undefined): UsageSnapshot {
  if (!raw || raw.note) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: null,
      turns: typeof raw?.turns === "number" ? raw.turns : null,
      measured: false,
    };
  }
  return {
    inputTokens: num(raw.input_tokens),
    outputTokens: num(raw.output_tokens),
    cacheReadTokens: num(raw.cache_read_tokens),
    cacheCreationTokens: num(raw.cache_creation_tokens),
    costUsd: typeof raw.total_cost_usd === "number" ? raw.total_cost_usd : null,
    turns: typeof raw.num_turns === "number" ? raw.num_turns : null,
    measured: true,
  };
}

/**
 * Tokens actually occupying the context window. Output is included because it is
 * fed back as input on the next turn within the same session.
 */
export function contextTokens(u: UsageSnapshot): number {
  return u.inputTokens + u.cacheReadTokens + u.cacheCreationTokens + u.outputTokens;
}

/** The token ceiling for one session, or null when the agent has no window configured. */
export function budgetTokens(agent: AgentConfig): number | null {
  if (!agent.context_window_tokens || !agent.context_budget_pct) return null;
  return Math.floor((agent.context_window_tokens * agent.context_budget_pct) / 100);
}

export function pctOfWindow(u: UsageSnapshot, agent: AgentConfig): number | null {
  if (!agent.context_window_tokens || !u.measured) return null;
  return (contextTokens(u) / agent.context_window_tokens) * 100;
}

/**
 * Dollar ceiling handed to the CLI.
 *
 * `configured` (an agent's max_budget_usd in agents.json) is the real cost
 * policy and now wins outright whenever it is set. It used to be clamped by
 * `min(derived, configured)`, but for any agent with a 200k context_window_tokens
 * (i.e. "claude"), `derived` tops out at 200,000 * 100% * USD_PER_TOKEN = $0.70
 * -- always below MIN_BUDGET_USD -- so `derived` was always exactly the $2
 * floor and min() silently discarded every configured value above $2. Observed
 * live: a backend-dev step doing two migrations + a live-DB index inspection +
 * an endpoint wired end to end was hard-killed by the CLI's own
 * --max-budget-usd at $2 mid-implementation (86 turns, cost compounding with
 * turn count as the growing conversation is re-sent each turn -- something one
 * token-budget snapshot never captures), even though agents.json already said
 * max_budget_usd: 8. `derived` is now only a fallback for an agent with no
 * configured value at all.
 */
export function maxBudgetUsd(agent: AgentConfig): number {
  const configured = agent.max_budget_usd ?? null;
  if (configured) return Math.max(configured, MIN_BUDGET_USD);
  const tokens = budgetTokens(agent);
  const derived = tokens ? tokens * USD_PER_TOKEN : null;
  return Math.max(derived ?? 8, MIN_BUDGET_USD);
}

export interface BudgetVerdict {
  /** Whether this role-step should be continued in a fresh session. */
  continueInNewSession: boolean;
  reason: string | null;
  usedTokens: number;
  budget: number | null;
  pctUsed: number | null;
  exhaustedSessions: boolean;
}

/**
 * Decide whether a completed step needs a continuation session.
 *
 * The authoritative signal is the agent emitting `handoff_summary` -- it knows
 * whether its work is finished. Budget overrun alone is NOT treated as
 * incomplete: an agent that finished the job inside its last turn is done,
 * regardless of how much context it burned getting there.
 */
export function evaluateBudget(
  step: StepRecord,
  agent: AgentConfig,
  sessionsUsedForStep: number,
): BudgetVerdict {
  const usage = parseUsage(step.usage as Record<string, unknown> | null);
  const used = contextTokens(usage);
  const budget = budgetTokens(agent);
  const pct = pctOfWindow(usage, agent);

  const base = { usedTokens: used, budget, pctUsed: pct, exhaustedSessions: false };

  if (step.outcome !== "ok") {
    return { ...base, continueInNewSession: false, reason: null };
  }

  const checkpointed = Boolean(step.handoff_summary && step.handoff_summary.trim());
  if (!checkpointed) {
    return { ...base, continueInNewSession: false, reason: null };
  }

  if (sessionsUsedForStep >= MAX_SESSIONS_PER_STEP) {
    return {
      ...base,
      continueInNewSession: false,
      exhaustedSessions: true,
      reason: `role-step exhausted its ${MAX_SESSIONS_PER_STEP}-session checkpoint limit`,
    };
  }

  return {
    ...base,
    continueInNewSession: true,
    reason:
      `agent checkpointed after ${used.toLocaleString()} context tokens` +
      (budget ? ` (budget ${budget.toLocaleString()}` : "") +
      (pct !== null ? `, ${pct.toFixed(1)}% of window)` : budget ? ")" : ""),
  };
}

/** The budget block injected into the packet so the agent knows its ceiling. */
export interface ContextBudgetInfo {
  window_tokens: number | null;
  budget_tokens: number | null;
  budget_pct: number | null;
  session: number;
  max_sessions: number;
  measured: boolean;
}

export function budgetInfoFor(agent: AgentConfig, session: number): ContextBudgetInfo {
  return {
    window_tokens: agent.context_window_tokens ?? null,
    budget_tokens: budgetTokens(agent),
    budget_pct: agent.context_budget_pct ?? null,
    session,
    max_sessions: MAX_SESSIONS_PER_STEP,
    measured: agent.supports_token_accounting,
  };
}
