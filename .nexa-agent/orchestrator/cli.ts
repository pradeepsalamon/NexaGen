#!/usr/bin/env ts-node
/**
 * Manual CLI for the orchestrator. Phase 2: create tasks and trigger one role
 * at a time, so state files and handoff packets can be inspected before the
 * auto-chain is switched on.
 *
 *   npm run agent -- create --summary "..." --chain backend-dev,tester-e2e
 *   npm run agent -- create --summary "..." --chain feature --agent backend-dev=antigravity
 *   npm run agent -- dispatch <task-id>
 *   npm run agent -- show <task-id>
 *   npm run agent -- list
 */
import { loadRoles } from "./paths";
import type { AgentName, RoleName } from "./types";
import { createTask, listTasks, readState } from "./state";
import { approveTask, dispatchNext, isTerminal, nextAction, rejectTask, runTask } from "./orchestrator";
import * as git from "./git";

function parseArgs(argv: string[]): { cmd: string; flags: Record<string, string[]>; positional: string[] } {
  const [cmd = "help", ...rest] = argv;
  const flags: Record<string, string[]> = {};
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[++i] : "true";
      (flags[key] ??= []).push(value);
    } else {
      positional.push(token);
    }
  }
  return { cmd, flags, positional };
}

const one = (flags: Record<string, string[]>, key: string): string | undefined => flags[key]?.[0];

function resolveChain(value: string): RoleName[] {
  const roles = loadRoles();
  if (roles.chains[value]) return roles.chains[value];
  return value.split(",").map((r) => r.trim()) as RoleName[];
}

function usage(): void {
  const roles = loadRoles();
  console.log(`nexa-agent orchestrator (Phase 2)

Commands:
  create --summary "<prompt>" --chain <chain|role,role> [--agent role=agent]... [--paths a,b] [--id <task-id>]
  run <task-id>          drive the task to a terminal state (full auto-handoff chain)
  dispatch <task-id>     run the next role in the chain (one step only)
  approve <task-id> --by <name>    merge the approved branch into dev_vps
  reject <task-id> --reason "..."  send it back to the bug-fixer
  show <task-id>         print task state
  list                   list all tasks
  roles                  list roles, chains and default agents

Chains:   ${Object.keys(roles.chains).join(", ")}
Roles:    ${Object.keys(roles.roles).join(", ")}
`);
}

function cmdCreate(flags: Record<string, string[]>): void {
  const summary = one(flags, "summary");
  const chainRaw = one(flags, "chain");
  if (!summary) throw new Error("--summary is required");
  if (!chainRaw) throw new Error("--chain is required");

  const agentOverrides: Partial<Record<RoleName, AgentName>> = {};
  for (const pair of flags.agent ?? []) {
    const [role, agent] = pair.split("=");
    if (!role || !agent) throw new Error(`--agent expects role=agent, got "${pair}"`);
    agentOverrides[role as RoleName] = agent as AgentName;
  }

  const state = createTask({
    summary,
    chain: resolveChain(chainRaw),
    agentOverrides,
    relevantPaths: one(flags, "paths")?.split(",").map((p) => p.trim()).filter(Boolean) ?? [],
    taskId: one(flags, "id"),
  });

  console.log(`created ${state.task_id}`);
  console.log(`  branch  ${state.branch}  (off ${state.base_branch} @ ${state.base_sha.slice(0, 8)})`);
  console.log(`  chain   ${state.chain.join(" -> ")}`);
  for (const [role, agent] of Object.entries(state.role_agents)) {
    console.log(`    ${role.padEnd(14)} ${agent}`);
  }
}

function cmdDispatch(positional: string[]): void {
  const id = positional[0];
  if (!id) throw new Error("dispatch requires a task id");
  const before = readState(id);
  const role = before.chain[before.step_index];
  console.log(`dispatching ${role} (${before.role_agents[role]}) for ${id}...`);

  const step = dispatchNext(id);
  console.log(`  outcome     ${step.outcome} (exit ${step.exit_code})`);
  console.log(`  session     ${step.session}  attempt ${step.attempt}`);
  console.log(`  commit      ${step.commit_sha?.slice(0, 8) ?? "none"}`);
  console.log(`  files       ${step.files_changed.length}`);
  if (step.test_pass !== null) console.log(`  test_pass   ${step.test_pass} (${step.failure_count} failures)`);
  if (step.diff_summary) console.log(`  summary     ${step.diff_summary}`);
}


function cmdRun(positional: string[]): void {
  const id = positional[0];
  if (!id) throw new Error("run requires a task id");
  const start = readState(id);
  console.log(`running ${id}  chain=${start.chain.join(" -> ")}  max_attempts=${start.max_attempts}`);

  const final = runTask(id, {
    onStep: (step, state) => {
      const verdict =
        step.test_pass === null ? "" : step.test_pass ? "  PASS" : `  FAIL (${step.failure_count} defects)`;
      console.log(
        `  [${step.index}] ${step.role.padEnd(13)} ${step.agent.padEnd(12)} ` +
          `a${step.attempt}/s${step.session}  ${step.outcome}` +
          `  ${step.commit_sha?.slice(0, 8) ?? "no-commit"}${verdict}`,
      );
      if (state.status === "FIXING") console.log("      -> tester failed, handing to bug-fixer");
    },
  });

  console.log(`\nfinal status: ${final.status}`);
  if (final.failure_reason) console.log(`reason: ${final.failure_reason}`);
  if (final.status === "PASS_AWAITING_APPROVAL") {
    console.log(`\nawaiting human approval. Review with:`);
    console.log(`  git diff ${final.base_sha.slice(0, 8)}..${final.branch}`);
    console.log(`  npm run agent -- approve ${id} --by <name>`);
  }
}

function cmdApprove(positional: string[], flags: Record<string, string[]>): void {
  const id = positional[0];
  if (!id) throw new Error("approve requires a task id");
  const by = one(flags, "by");
  if (!by) throw new Error("--by <name> is required to record who approved");
  const state = approveTask(id, by);
  console.log(`${id} -> ${state.status} (approved by ${by})`);
}

function cmdReject(positional: string[], flags: Record<string, string[]>): void {
  const id = positional[0];
  if (!id) throw new Error("reject requires a task id");
  const reason = one(flags, "reason");
  if (!reason) throw new Error('--reason "..." is required');
  const state = rejectTask(id, reason);
  console.log(`${id} -> ${state.status}. Run "npm run agent -- run ${id}" to start the fix cycle.`);
}

function cmdNext(positional: string[]): void {
  const id = positional[0];
  if (!id) throw new Error("next requires a task id");
  const state = readState(id);
  const action = nextAction(state);
  console.log(`${id}  status=${state.status}  terminal=${isTerminal(state)}`);
  console.log(JSON.stringify(action, null, 2));
}

function cmdShow(positional: string[]): void {
  const id = positional[0];
  if (!id) throw new Error("show requires a task id");
  const state = readState(id);
  console.log(JSON.stringify(state, null, 2));
  const files = git.changedFiles(state.base_sha, state.branch);
  if (files.length) {
    console.log("\ncumulative diff:");
    for (const f of files) console.log(`  +${f.added} -${f.removed}  ${f.file}`);
  }
}

function cmdList(): void {
  const tasks = listTasks();
  if (!tasks.length) return console.log("no tasks");
  for (const t of tasks) {
    const role = t.chain[t.step_index] ?? "-";
    console.log(
      `${t.status.padEnd(24)} ${t.task_id.padEnd(44)} step ${t.step_index}/${t.chain.length} ` +
        `next=${role} attempt=${t.attempt}/${t.max_attempts}`,
    );
  }
}

function cmdRoles(): void {
  const roles = loadRoles();
  for (const [name, cfg] of Object.entries(roles.roles)) {
    console.log(`${name.padEnd(14)} -> ${cfg.default_agent.padEnd(12)} ${cfg.description}`);
  }
  console.log();
  for (const [name, chain] of Object.entries(roles.chains)) {
    console.log(`chain ${name.padEnd(16)} ${chain.join(" -> ")}`);
  }
}

function main(): void {
  const { cmd, flags, positional } = parseArgs(process.argv.slice(2));
  switch (cmd) {
    case "create": return cmdCreate(flags);
    case "run": return cmdRun(positional);
    case "dispatch": return cmdDispatch(positional);
    case "approve": return cmdApprove(positional, flags);
    case "reject": return cmdReject(positional, flags);
    case "next": return cmdNext(positional);
    case "show": return cmdShow(positional);
    case "list": return cmdList();
    case "roles": return cmdRoles();
    default: return usage();
  }
}

try {
  main();
} catch (err) {
  console.error(`error: ${(err as Error).message}`);
  process.exit(1);
}
