#!/usr/bin/env node
/**
 * Nexa AI Development System — Phase 6 Main AI Manager
 * Multi-Worker Development Control Plane, Planning, Capability Routing, DAG Orchestration, and Review.
 */

const fs = require('fs');
const path = require('path');
const Planner = require('./planner');
const Dispatcher = require('./dispatcher');
const Reviewer = require('./reviewer');
const Scheduler = require('./scheduler');
const WorkerRegistry = require('./worker-registry');
const DependencyGraph = require('./dependency-graph');
const GeminiProvider = require('./providers/gemini-provider');
const ProjectContextEngine = require('./project-context');

const DEV_ROOT = path.resolve(__dirname, '../..');
const AI_DIR = path.join(DEV_ROOT, '.ai');
const TASKS_DIR = path.join(AI_DIR, 'tasks');
const ACTIVE_DIR = path.join(TASKS_DIR, 'active');
const STATE_DIR = path.join(AI_DIR, 'manager', 'state');
const SESSION_FILE = path.join(STATE_DIR, 'session.json');

class MainManager {
  constructor() {
    this.contextEngine = new ProjectContextEngine(DEV_ROOT);
    this.registry = new WorkerRegistry();
    this.provider = new GeminiProvider();
    this.planner = new Planner(this.provider, this.contextEngine);
    this.dispatcher = new Dispatcher('nexa-dev-01', this.registry);
    this.reviewer = new Reviewer(this.provider);
    this.scheduler = new Scheduler(this.registry);

    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
  }

  /**
   * Records session state to disk.
   */
  saveSession(data) {
    try {
      const existing = fs.existsSync(SESSION_FILE) ? JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8')) : {};
      const updated = {
        ...existing,
        ...data,
        last_updated: new Date().toISOString()
      };
      fs.writeFileSync(SESSION_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    } catch {}
  }

  /**
   * Displays status banner.
   */
  showBanner() {
    console.log('============================================================');
    console.log('       Nexa AI Development System — Main AI Manager');
    console.log('       Role:        PLANNER • DISPATCHER • REVIEWER');
    console.log('       Worker Pool: Multi-Worker (Gemini)');
    console.log('       Environment: DEVELOPMENT ONLY (/opt/nexa-chess/NexaGen-dev)');
    console.log('============================================================\n');
  }

  /**
   * Shows manager and system status.
   */
  showStatus() {
    this.showBanner();
    const summary = this.contextEngine.getProjectContextSummary();

    console.log('── Control Plane Status ──');
    console.log(`  Manager Status:   READY`);
    console.log(`  Provider:         ${summary.worker.provider}`);
    console.log(`  Scheduler:        READY (CLI / Filesystem DAG)`);

    console.log('\n── Worker Pool ──');
    const pool = summary.worker.workers_pool || [];
    for (const w of pool) {
      const statusIcon = w.status === 'AVAILABLE' ? '🟢' : w.status === 'BUSY' ? '🟡' : '🔴';
      console.log(`  ${statusIcon} ${w.worker_id}: ${w.status} [Caps: ${w.capabilities.join(', ')}]`);
    }

    console.log('\n── DEV Environment Status ──');
    console.log(`  Branch:           ${summary.git.current_branch}`);
    console.log(`  Web (:3010):      ${summary.services.web_3010 ? 'UP ✅' : 'DOWN ❌'}`);
    console.log(`  API (:3011):      ${summary.services.api_3011 ? 'UP ✅' : 'DOWN ❌'}`);
    console.log(`  DB (vps_dev):     ${summary.services.postgres_dev ? 'UP ✅' : 'DOWN ❌'}`);
    console.log(`  Redis (shared):   ${summary.services.redis_shared ? 'UP ✅' : 'DOWN ❌'}`);
    console.log(`  LiveKit (shared): ${summary.services.livekit_shared ? 'UP ✅' : 'DOWN ❌'}`);

    console.log('\n── Task Queue ──');
    console.log(`  Active:           ${summary.tasks.active_count}`);
    console.log(`  Completed:        ${summary.tasks.completed_count}`);
    console.log(`  Failed:           ${summary.tasks.failed_count}`);

    if (summary.tasks.last_task) {
      console.log(`  Last Task:        [${summary.tasks.last_task.task_id}] ${summary.tasks.last_task.title}`);
    }

    console.log('\n── Safety Boundaries ──');
    console.log(`  Production Access: ${summary.safety_boundaries.production_access}`);
    console.log(`  Production DB:     ${summary.safety_boundaries.production_db}`);
    console.log(`  Production Docker: ${summary.safety_boundaries.production_docker}`);
    console.log(`  Redis Scope:       ${summary.safety_boundaries.redis_scope}`);
    console.log(`  LiveKit Scope:     ${summary.safety_boundaries.livekit_scope}\n`);
  }

  /**
   * Displays registered workers in pool.
   */
  showWorkers() {
    this.showBanner();
    console.log('👷 Registered Multi-Worker Pool:\n');
    const workers = this.registry.getWorkers();

    if (workers.length === 0) {
      console.log('  No workers registered.\n');
      return;
    }

    for (const w of workers) {
      const statusIcon = w.status === 'AVAILABLE' ? '🟢' : w.status === 'BUSY' ? '🟡' : '🔴';
      console.log(`  ${statusIcon} [${w.worker_id || w.id}] ${w.name || 'Worker'}`);
      console.log(`     Status:       ${w.status}`);
      console.log(`     Capabilities: [${(w.capabilities || []).join(', ')}]`);
      console.log(`     Workspace:    ${w.workspace || DEV_ROOT}`);
      console.log(`     Current Task: ${w.current_task || 'None'}`);
      console.log(`     Completed:    ${w.tasks_completed || 0}, Failed: ${w.tasks_failed || 0}\n`);
    }
  }

  /**
   * Displays dependency graph for active tasks or specific root task.
   */
  showGraph(rootTaskId = null) {
    this.showBanner();
    const activeTasks = this.scheduler.loadActiveTasks();

    if (activeTasks.length === 0) {
      console.log('ℹ️ No active tasks in queue to graph.\n');
      return;
    }

    const graph = new DependencyGraph(activeTasks);
    console.log(graph.renderAsciiGraph(rootTaskId));
    console.log('');
  }

  /**
   * Displays historical tasks matching an optional search query.
   */
  showHistory(query = '') {
    this.showBanner();
    console.log(`📚 Task History Query: "${query || '*'}"\n`);
    const history = this.contextEngine.searchTaskHistory(query);

    if (history.length === 0) {
      console.log('  No matching historical tasks found.\n');
      return;
    }

    console.log(`Found ${history.length} historical task(s):\n`);
    for (const item of history) {
      const statusIcon = item.status === 'COMPLETED' ? '✅' : '❌';
      console.log(`  ${statusIcon} [${item.task_id}] ${item.title}`);
      console.log(`     Status:  ${item.status} (Attempt ${item.attempt})`);
      console.log(`     Type:    ${item.type}`);
      console.log(`     Date:    ${item.date}`);
      if (item.files_changed && item.files_changed.length > 0) {
        console.log(`     Files:   ${item.files_changed.slice(0, 3).join(', ')}${item.files_changed.length > 3 ? '...' : ''}`);
      }
      console.log(`     Summary: ${item.summary}\n`);
    }
  }

  /**
   * Orchestrates a complete user request lifecycle:
   * Request -> Plan -> Work Orders -> Scheduler / DAG Execution -> Review -> Summary
   */
  async handleUserRequest(userPrompt) {
    this.showBanner();
    console.log(`👤 User Request:\n   "${userPrompt}"\n`);

    // 1. Planning Phase
    console.log('── [PHASE 1: PLANNING] Analyzing Request & Formulating Work Orders ──');
    const planResult = await this.planner.plan(userPrompt);
    if (!planResult.ok) {
      console.error(`\n❌ Request Rejected: [${planResult.code}]`);
      console.error(`   ${planResult.reason}\n`);
      return { ok: false, code: planResult.code, reason: planResult.reason };
    }

    const { workOrders } = planResult;
    console.log(`\n✅ Generated ${workOrders.length} work order(s).`);

    // Show initial dependency graph
    const graph = new DependencyGraph(workOrders);
    console.log('\n' + graph.renderAsciiGraph() + '\n');

    const results = [];

    // 2. Dispatch & Execution via Scheduler cycles
    console.log('── [PHASE 2: DAG DISPATCH] Executing Work Orders with Capability Routing ──');
    
    // Execute scheduler cycles until all tasks are completed or blocked
    let maxCycles = workOrders.length * 2 + 2;
    while (maxCycles > 0) {
      maxCycles--;
      const activeBefore = this.scheduler.loadActiveTasks();
      if (activeBefore.length === 0) break;

      const schedResult = await this.scheduler.runCycle({ silent: false });
      if (!schedResult.ok) {
        console.error(`❌ Scheduling cycle failed: ${schedResult.code}`);
        break;
      }

      if (schedResult.scheduled === 0 && activeBefore.length > 0) {
        // Check if remaining tasks are blocked
        console.log('ℹ️ No runnable tasks dispatched in this cycle.');
        break;
      }
    }

    // 3. Review Phase
    console.log('\n── [PHASE 3: REVIEW] Auditing Completed Work Orders ──');
    for (const wo of workOrders) {
      const reviewResult = await this.reviewer.review(wo.task_id);
      results.push(reviewResult);

      if (reviewResult.verdict === 'ACCEPTED') {
        console.log(`\n` + reviewResult.human_summary);
      } else if (reviewResult.verdict === 'FAILED') {
        console.log(`\n### ❌ Task ${wo.task_id} Failed\n**Reason:** ${reviewResult.reason}\n**Details:** ${reviewResult.error_details}`);
      } else if (reviewResult.needs_follow_up) {
        console.log(`\n⚠️ Task ${wo.task_id} completed with unmet criteria.`);
      }
    }

    return { ok: true, results };
  }

  /**
   * Displays all Git worktrees and worker ownership.
   */
  showWorktrees() {
    this.showBanner();
    const WorktreeManager = require('./worktree-manager');
    const wm = new WorktreeManager(DEV_ROOT);
    const worktrees = wm.listWorktrees();

    console.log('── Git Worktrees & Worker Ownership ──');
    for (const wt of worktrees) {
      const statusIcon = wt.status === 'AVAILABLE' ? '🟢' : wt.status === 'READY' ? '🟢' : wt.status === 'DIRTY' ? '🟡' : '🔴';
      console.log(`  ${statusIcon} Worker:    ${wt.worker_id}`);
      console.log(`     Path:      ${wt.worktree_path}`);
      console.log(`     Status:    ${wt.status}`);
      console.log(`     Branch:    ${wt.branch || 'None'}`);
      console.log(`     Clean:     ${wt.is_clean ? 'YES' : 'NO (Uncommitted Changes)'}`);
      console.log('');
    }
  }

  /**
   * Validates all worker worktrees.
   */
  checkWorktrees() {
    this.showBanner();
    const WorktreeManager = require('./worktree-manager');
    const wm = new WorktreeManager(DEV_ROOT);
    const worktrees = wm.listWorktrees();

    console.log('── Validating Worker Worktrees ──');
    let allValid = true;
    for (const wt of worktrees) {
      if (wt.exists) {
        const val = wm.validateWorkerWorktree(wt.worker_id);
        if (val.ok) {
          console.log(`  ✅ [${wt.worker_id}] Worktree valid (${val.branch || 'no branch'}, clean: ${val.is_clean})`);
        } else {
          console.log(`  ❌ [${wt.worker_id}] Validation failed: [${val.code}] ${val.reason}`);
          allValid = false;
        }
      } else {
        console.log(`  ℹ️ [${wt.worker_id}] Worktree available for creation on demand`);
      }
    }
    console.log('');
    return allValid;
  }

  /**
   * Performs read-only merge readiness assessment.
   */
  checkMerge(taskId, baseBranch = 'dev') {
    this.showBanner();
    const WorktreeManager = require('./worktree-manager');
    const wm = new WorktreeManager(DEV_ROOT);
    const res = wm.checkMergeReadiness(taskId, null, baseBranch);

    console.log(`── Merge Readiness Check for Task: ${taskId} ──\n`);
    console.log(`  Task Branch:       ${res.task_branch || 'ai/' + taskId}`);
    console.log(`  Base Branch:       ${res.base_branch || baseBranch}`);
    console.log(`  Commits Ahead:     ${res.commits_ahead || 0}`);
    console.log(`  Changed Files:     ${res.changed_files ? res.changed_files.length : 0}`);
    if (res.changed_files && res.changed_files.length > 0) {
      res.changed_files.forEach(f => console.log(`     • ${f}`));
    }
    console.log(`  Merge Conflicts:   ${res.has_conflicts ? '⚠️ DETECTED' : 'NONE (Clean)'}`);
    if (res.has_conflicts) {
      console.log(`     Details: ${res.conflict_details}`);
    }
    console.log(`  Test Status:       ${res.test_status || 'UNKNOWN'}`);
    console.log(`\n  VERDICT:           ${res.verdict === 'READY_FOR_HUMAN_REVIEW' ? '✅ READY_FOR_HUMAN_REVIEW' : '❌ NOT_READY'}`);
    console.log(`  Recommendation:    ${res.recommendation}\n`);
    console.log(`  🛑 SAFETY NOTE: Antigravity never auto-merges into dev. Human review required.\n`);
    return res;
  }
}

// CLI handler
async function main() {
  const manager = new MainManager();
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    manager.showBanner();
    console.log('Usage:');
    console.log('  npm run ai:manager -- "<user_request>"       Execute full planning & DAG orchestration workflow');
    console.log('  npm run ai:manager -- --status               Display manager & worker queue status');
    console.log('  npm run ai:manager -- --workers              List all registered workers in multi-worker pool');
    console.log('  npm run ai:manager -- --worktrees            List all Git worktrees and worker assignments');
    console.log('  npm run ai:manager -- --worktree-check       Validate integrity of all worker worktrees');
    console.log('  npm run ai:manager -- --merge-check <ID>     Read-only merge readiness assessment');
    console.log('  npm run ai:manager -- --graph [TASK_ID]      Render ASCII dependency tree for task(s)');
    console.log('  npm run ai:manager -- --history [query]      Query structured project development history');
    console.log('  npm run ai:manager -- --plan "<request>"     Plan and generate work order without executing');
    console.log('  npm run ai:manager -- --dispatch <TASK_ID>   Dispatch specific task to worker');
    console.log('  npm run ai:manager -- --review <TASK_ID>     Review completed task report');
    console.log('  npm run ai:schedule                          Run one scheduler cycle across active tasks');
    console.log('');
    return;
  }

  if (args.includes('--status')) {
    manager.showStatus();
    return;
  }

  if (args.includes('--workers')) {
    manager.showWorkers();
    return;
  }

  if (args.includes('--worktrees')) {
    manager.showWorktrees();
    return;
  }

  if (args.includes('--worktree-check')) {
    manager.checkWorktrees();
    return;
  }

  if (args.includes('--merge-check')) {
    const checkIdx = args.indexOf('--merge-check') + 1;
    const taskId = args[checkIdx];
    if (!taskId) {
      console.error('❌ Error: Task ID required for --merge-check (e.g. npm run ai:manager -- --merge-check NEXA-0034)');
      process.exit(1);
    }
    manager.checkMerge(taskId);
    return;
  }

  if (args.includes('--graph')) {
    const graphIdx = args.indexOf('--graph') + 1;
    const taskId = args[graphIdx] && !args[graphIdx].startsWith('--') ? args[graphIdx] : null;
    manager.showGraph(taskId);
    return;
  }

  if (args.includes('--history')) {
    const histIdx = args.indexOf('--history') + 1;
    const query = args[histIdx] && !args[histIdx].startsWith('--') ? args[histIdx] : '';
    manager.showHistory(query);
    return;
  }

  if (args.includes('--plan')) {
    manager.showBanner();
    const promptIdx = args.indexOf('--plan') + 1;
    const prompt = args[promptIdx] || args[args.length - 1];
    const planResult = await manager.planner.plan(prompt);
    if (!planResult.ok) {
      console.error(`❌ Planning failed: [${planResult.code}] ${planResult.reason}`);
      process.exit(1);
    }
    console.log('\n✅ Plan generated successfully:');
    console.log(JSON.stringify(planResult.workOrders, null, 2));
    return;
  }

  if (args.includes('--dispatch')) {
    manager.showBanner();
    const taskIdx = args.indexOf('--dispatch') + 1;
    const taskId = args[taskIdx];
    if (!taskId) {
      console.error('❌ Error: Task ID required for --dispatch');
      process.exit(1);
    }
    const result = await manager.dispatcher.dispatch(taskId);
    if (!result.ok) {
      console.error(`❌ Dispatch failed: ${result.reason || result.error}`);
      process.exit(1);
    }
    console.log('✅ Task dispatched successfully.');
    return;
  }

  if (args.includes('--review')) {
    manager.showBanner();
    const taskIdx = args.indexOf('--review') + 1;
    const taskId = args[taskIdx];
    if (!taskId) {
      console.error('❌ Error: Task ID required for --review');
      process.exit(1);
    }
    const reviewResult = await manager.reviewer.review(taskId);
    console.log('\n' + (reviewResult.human_summary || JSON.stringify(reviewResult, null, 2)));
    return;
  }

  // Treat remaining string as user prompt
  const userPrompt = args.filter(a => !a.startsWith('--')).join(' ');
  if (!userPrompt) {
    console.error('❌ Error: Please provide a valid user request.');
    process.exit(1);
  }

  await manager.handleUserRequest(userPrompt);
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Main Manager Error:', err.message);
    process.exit(1);
  });
}

module.exports = MainManager;
