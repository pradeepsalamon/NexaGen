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
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { AGENT_DIR, loadAgents, loadRoles } from "./paths";
import type { AgentName, RoleName } from "./types";
import { createTask, listTasks, readState } from "./state";
import { approveTask, dispatchNext, isTerminal, nextAction, rejectTask, runTask } from "./orchestrator";
import * as git from "./git";
import { chat, listChats } from "./chat/repl";

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
  create --summary "<prompt>" --chain <chain|role,role>
         [--agent role=agent]... [--model role=model]... [--paths a,b] [--id <task-id>]
  run <task-id> [--resume]  drive the task to a terminal state (full auto-handoff chain)
                            --resume restarts a role-step a usage limit cut short
  dispatch <task-id>     run the next role in the chain (one step only)
  approve <task-id> --by <name>    merge the approved branch into dev_vps
  reject <task-id> --reason "..."  send it back to the bug-fixer
  start <task-id> [--resume]  run it in a detached background worker (returns at once)
  show <task-id>         print task state
  list [--json]          list all tasks
  status                 compact overview of every task, grouped by status
  roles                  list roles, chains and default agents

  chat [--new] [--thread <id>] [--once "..."]
                         talk to the supervisor: it answers questions and drives
                         the orchestrator for you. Default resumes your last
                         conversation.
  chats                  list saved conversations

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

  const modelOverrides: Partial<Record<RoleName, string>> = {};
  for (const pair of flags.model ?? []) {
    const [role, model] = pair.split("=");
    if (!role || !model) throw new Error(`--model expects role=model, got "${pair}"`);
    modelOverrides[role as RoleName] = model;
  }

  const state = createTask({
    summary,
    chain: resolveChain(chainRaw),
    agentOverrides,
    modelOverrides,
    relevantPaths: one(flags, "paths")?.split(",").map((p) => p.trim()).filter(Boolean) ?? [],
    taskId: one(flags, "id"),
  });

  console.log(`created ${state.task_id}`);
  console.log(`  branch  ${state.branch}  (off ${state.base_branch} @ ${state.base_sha.slice(0, 8)})`);
  console.log(`  chain   ${state.chain.join(" -> ")}`);
  for (const [role, agent] of Object.entries(state.role_agents)) {
    const model = state.role_models?.[role];
    console.log(`    ${role.padEnd(14)} ${agent}${model ? `  (${model})` : ""}`);
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


function cmdRun(positional: string[], flags: Record<string, string[]>): void {
  const id = positional[0];
  if (!id) throw new Error("run requires a task id");
  const resume = Boolean(flags.resume);
  const start = readState(id);
  console.log(
    `${resume ? "resuming" : "running"} ${id}  chain=${start.chain.join(" -> ")}  max_attempts=${start.max_attempts}`,
  );

  const final = runTask(id, {
    resume,
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
  if (final.status === "BLOCKED_RETRY") {
    console.log(`\nnot finished -- the run was cut short, not rejected. Partial work is on ${final.branch}.`);
    console.log(`  npm run agent -- run ${id} --resume`);
  }
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

/**
 * Start a task in a detached worker and return immediately.
 *
 * `run` blocks for as long as the agents take, which is minutes. The supervisor
 * chat agent must never block a conversation turn on that, so it uses this.
 */
function cmdStart(positional: string[], flags: Record<string, string[]>): void {
  const id = positional[0];
  if (!id) throw new Error("start requires a task id");
  const state = readState(id);
  const args = [
    "--project",
    path.join(AGENT_DIR, "tsconfig.json"),
    path.join(AGENT_DIR, "control", "api", "worker.ts"),
    id,
  ];
  if (flags.resume) args.push("--resume");

  const out = fs.openSync(path.join(AGENT_DIR, "logs", `worker_${id}.log`), "a");
  const child = spawn(path.join(AGENT_DIR, "..", "node_modules", ".bin", "ts-node"), args, {
    cwd: AGENT_DIR,
    detached: true,
    stdio: ["ignore", out, out],
  });
  child.unref();

  console.log(
    JSON.stringify(
      {
        started: id,
        pid: child.pid,
        branch: state.branch,
        chain: state.chain,
        log: path.join(AGENT_DIR, "logs", `worker_${id}.log`),
        note: "running in the background; poll with: npm run agent -- show " + id,
      },
      null,
      2,
    ),
  );
}

/** One compact picture of everything in flight. The supervisor's opening look. */
function cmdStatus(): void {
  const tasks = listTasks();
  const buckets: Record<string, { id: string; summary: string; branch: string; next: string }[]> = {};
  for (const t of tasks) {
    (buckets[t.status] ??= []).push({
      id: t.task_id,
      summary: t.feature_summary.slice(0, 80),
      branch: t.branch,
      next: t.chain[t.step_index] ?? "-",
    });
  }
  console.log(JSON.stringify({ total: tasks.length, by_status: buckets }, null, 2));
}

function cmdList(flags: Record<string, string[]>): void {
  const tasks = listTasks();
  if (flags.json) {
    return console.log(
      JSON.stringify(
        tasks.map((t) => ({
          task_id: t.task_id,
          status: t.status,
          summary: t.feature_summary,
          branch: t.branch,
          chain: t.chain,
          step_index: t.step_index,
          attempt: t.attempt,
          max_attempts: t.max_attempts,
          failure_reason: t.failure_reason,
          updated_at: t.updated_at,
        })),
        null,
        2,
      ),
    );
  }
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
  const agents = loadAgents();

  console.log("ROLES (default agent from config/roles.json)\n");
  for (const [name, cfg] of Object.entries(roles.roles)) {
    console.log(`  ${name.padEnd(14)} -> ${cfg.default_agent.padEnd(12)} ${cfg.description}`);
  }

  console.log("\nCHAINS\n");
  for (const [name, chain] of Object.entries(roles.chains)) {
    console.log(`  ${name.padEnd(16)} ${chain.join(" -> ")}`);
  }

  console.log("\nAGENTS AND MODELS (config/agents.json)\n");
  for (const [name, cfg] of Object.entries(agents)) {
    const models = cfg.models ?? [];
    console.log(`  ${name}  (cli: ${cfg.cli}, default model: ${cfg.default_model ?? "the CLI's own default"})`);
    for (const m of models) {
      console.log(`      ${m.id === cfg.default_model ? "*" : " "} ${m.id.padEnd(24)} ${m.label}`);
    }
  }

  console.log("\nOverride per task:  --agent backend-dev=antigravity --model backend-dev=gemini-3.1-pro-high");
}

function main(): void {
  const { cmd, flags, positional } = parseArgs(process.argv.slice(2));
  switch (cmd) {
    case "create": return cmdCreate(flags);
    case "run": return cmdRun(positional, flags);
    case "dispatch": return cmdDispatch(positional);
    case "approve": return cmdApprove(positional, flags);
    case "reject": return cmdReject(positional, flags);
    case "next": return cmdNext(positional);
    case "show": return cmdShow(positional);
    case "start": return cmdStart(positional, flags);
    case "status": return cmdStatus();
    case "list": return cmdList(flags);
    case "roles": return cmdRoles();
    case "chat":
      return chat({
        fresh: Boolean(flags.new),
        threadId: one(flags, "thread"),
        once: one(flags, "once"),
      });
    case "chats": return listChats();
    default: return usage();
  }
}

try {
  main();
} catch (err) {
  console.error(`error: ${(err as Error).message}`);
  process.exit(1);
}
