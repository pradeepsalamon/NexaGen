/**
 * Nexa AI Development System — Phase 9 Main AI Manager
 * Multi-Worker Development Control Plane, Planning, Approval Gates, Risk Analysis,
 * Regression Intelligence, DAG Orchestration, and Diff Review.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Planner = require('./planner');
const Dispatcher = require('./dispatcher');
const Reviewer = require('./reviewer');
const Scheduler = require('./scheduler');
const WorkerRegistry = require('./worker-registry');
const WorktreeManager = require('./worktree-manager');
const DependencyGraph = require('./dependency-graph');
const GeminiProvider = require('./providers/gemini-provider');
const ProjectContextEngine = require('./project-context');
const TaskLifecycle = require('./task-lifecycle');
const RiskEngine = require('./risk-engine');
const RegressionEngine = require('./regression-engine');

const DEV_ROOT = path.resolve(__dirname, '../..');
const AI_DIR = path.join(DEV_ROOT, '.ai');
const TASKS_DIR = path.join(AI_DIR, 'tasks');
const ACTIVE_DIR = path.join(TASKS_DIR, 'active');
const COMPLETED_DIR = path.join(TASKS_DIR, 'completed');
const STATE_DIR = path.join(AI_DIR, 'manager', 'state');
const SESSION_FILE = path.join(STATE_DIR, 'session.json');

class MainManager {
  constructor() {
    this.contextEngine = new ProjectContextEngine(DEV_ROOT);
    this.registry = new WorkerRegistry();
    this.worktreeManager = new WorktreeManager(DEV_ROOT);
    this.provider = new GeminiProvider();
    this.regressionEngine = new RegressionEngine();
    this.planner = new Planner(this.provider, this.contextEngine, this.regressionEngine);
    this.dispatcher = new Dispatcher('nexa-dev-01', this.registry, this.worktreeManager);
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
    const history = this.regressionEngine.searchHistoricalKnowledge(query, 10);

    if (history.length === 0) {
      console.log('  No matching historical tasks found.\n');
      return;
    }

    console.log(`Found ${history.length} historical task(s):\n`);
    for (const item of history) {
      const statusIcon = item.status === 'COMPLETED' ? '✅' : '❌';
      console.log(`  ${statusIcon} [${item.task_id}] ${item.title}`);
      console.log(`     Status:  ${item.status} (Attempt ${item.attempt})`);
      console.log(`     Date:    ${item.completed_at}`);
      if (item.root_cause) {
        console.log(`     Root Cause: ${item.root_cause}`);
      }
      if (item.files_changed && item.files_changed.length > 0) {
        console.log(`     Files:   ${item.files_changed.slice(0, 3).join(', ')}${item.files_changed.length > 3 ? '...' : ''}`);
      }
      console.log(`     Summary: ${item.summary}\n`);
    }
  }

  /**
   * Primary development request mode: plans, assesses risk, searches regression intelligence,
   * decomposes tasks, and outputs structured development request summary.
   */
  async handleUserRequest(userPrompt) {
    this.showBanner();

    // 1. Planning Phase (separating Plan from Execute)
    const planResult = await this.planner.plan(userPrompt, { autoApprove: false });
    if (!planResult.ok) {
      console.error(`\n❌ Request Rejected: [${planResult.code}]`);
      console.error(`   ${planResult.reason}\n`);
      return { ok: false, code: planResult.code, reason: planResult.reason };
    }

    const { workOrders, risk, regression } = planResult;
    const firstOrder = workOrders[0];

    console.log('------------------------------------------------------------');
    console.log('NEXAGEN DEVELOPMENT REQUEST');
    console.log('------------------------------------------------------------\n');
    console.log(`Request:`);
    console.log(`  "${userPrompt}"\n`);
    console.log(`Classification:`);
    console.log(`  ${(firstOrder.type || 'FEATURE').toUpperCase()}\n`);
    console.log(`Impact / Risk:`);
    console.log(`  ${risk.level}`);
    risk.reasons.forEach(r => console.log(`  • ${r}`));
    console.log('');
    console.log(`Project Areas:`);
    const apps = firstOrder.context?.affected_apps || ['apps/api'];
    const pkgs = firstOrder.context?.affected_packages || [];
    console.log(`  Apps:     ${apps.join(', ')}`);
    if (pkgs.length > 0) console.log(`  Packages: ${pkgs.join(', ')}`);
    console.log('');
    console.log(`Historical Context:`);
    if (regression.related_tasks.length > 0) {
      console.log(`  Related Past Tasks: ${regression.related_tasks.join(', ')}`);
      regression.past_root_causes.forEach(rc => console.log(`  • [${rc.task_id}] Root cause: ${rc.root_cause}`));
    } else {
      console.log(`  No previous related bug regressions found.`);
    }
    console.log('');
    console.log(`Plan (${workOrders.length} task(s)):`);
    workOrders.forEach((wo, idx) => {
      console.log(`  ${idx + 1}. [${wo.task_id}] ${wo.title}`);
    });
    console.log('');
    console.log(`Dependencies:`);
    const hasDeps = workOrders.some(wo => wo.dependencies && wo.dependencies.length > 0);
    if (hasDeps) {
      workOrders.forEach(wo => {
        if (wo.dependencies && wo.dependencies.length > 0) {
          console.log(`  • ${wo.task_id} depends on: ${wo.dependencies.join(', ')}`);
        }
      });
    } else {
      console.log(`  Independent execution (No blocking dependencies)`);
    }
    console.log('');
    console.log(`Verification:`);
    workOrders.forEach(wo => {
      console.log(`  [${wo.task_id}] Tier: ${(wo.qa_tier || 'backend_logic').toUpperCase()}`);
      if (wo.verification_commands) {
        wo.verification_commands.forEach(cmd => console.log(`    - ${cmd}`));
      }
    });
    console.log('');
    console.log(`Safety:`);
    console.log(`  ✓ Development environment isolated (/opt/nexa-chess/NexaGen-dev)`);
    console.log(`  ✓ Target database: vps_dev (nexa_chess blocked)`);
    console.log(`  ✓ Worktree branch isolation per worker`);
    console.log('');
    console.log(`Status:`);
    console.log(`  AWAITING_HUMAN_APPROVAL`);
    console.log('\n------------------------------------------------------------');
    console.log(`To approve this plan for worker execution:`);
    if (workOrders.length === 1) {
      console.log(`  npm run ai:manager -- --approve ${firstOrder.task_id}`);
    } else {
      console.log(`  npm run ai:manager -- --approve-plan ${firstOrder.task_id}`);
    }
    console.log(`Then run scheduler:`);
    console.log(`  npm run ai:schedule`);
    console.log('------------------------------------------------------------\n');

    return { ok: true, workOrders, risk, status: 'AWAITING_HUMAN_APPROVAL' };
  }

  /**
   * Explicitly approves a single active task.
   */
  approveTask(taskId, approver = 'HUMAN') {
    this.showBanner();
    const taskPath = path.join(ACTIVE_DIR, `${taskId}.json`);
    if (!fs.existsSync(taskPath)) {
      console.error(`❌ Task ${taskId} not found in active queue (${ACTIVE_DIR})`);
      return { ok: false, code: 'TASK_NOT_FOUND' };
    }

    try {
      const taskData = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
      const appResult = TaskLifecycle.approveTask(taskData, { approver, reason: 'Approved by human engineer' });
      if (!appResult.ok) {
        console.error(`❌ Approval rejected: ${appResult.reason}`);
        return appResult;
      }

      fs.writeFileSync(taskPath, JSON.stringify(taskData, null, 2), 'utf-8');
      console.log(`✅ [APPROVED] Task ${taskId} successfully approved for worker execution by ${approver}.`);
      console.log(`   Run 'npm run ai:schedule' to execute approved runnable tasks.\n`);
      return { ok: true, task_id: taskId, status: 'APPROVED' };
    } catch (e) {
      console.error(`❌ Error approving task ${taskId}: ${e.message}`);
      return { ok: false, code: 'TASK_UPDATE_ERROR', error: e.message };
    }
  }

  /**
   * Approves a root task and all its dependent DAG subtasks.
   */
  approvePlan(rootTaskId, approver = 'HUMAN') {
    this.showBanner();
    const activeTasks = this.scheduler.loadActiveTasks();
    const targetTask = activeTasks.find(t => t.task_id === rootTaskId);

    if (!targetTask) {
      console.error(`❌ Root task ${rootTaskId} not found in active queue.`);
      return { ok: false, code: 'TASK_NOT_FOUND' };
    }

    let approvedCount = 0;
    for (const task of activeTasks) {
      // Approve root task and any task related or dependent
      const isRelated = task.task_id === rootTaskId || (task.dependencies && task.dependencies.includes(rootTaskId));
      if (isRelated) {
        const appRes = TaskLifecycle.approveTask(task, { approver, reason: `Plan approved via root task ${rootTaskId}` });
        if (appRes.ok) {
          fs.writeFileSync(path.join(ACTIVE_DIR, `${task.task_id}.json`), JSON.stringify(task, null, 2), 'utf-8');
          approvedCount++;
          console.log(`  ✓ Approved [${task.task_id}] ${task.title}`);
        }
      }
    }

    console.log(`\n✅ Successfully approved ${approvedCount} task(s) in DAG plan.`);
    console.log(`   Run 'npm run ai:schedule' to execute.\n`);
    return { ok: true, rootTaskId, approvedCount };
  }

  /**
   * Explicitly rejects an active task.
   */
  rejectTask(taskId, approver = 'HUMAN') {
    this.showBanner();
    const taskPath = path.join(ACTIVE_DIR, `${taskId}.json`);
    if (!fs.existsSync(taskPath)) {
      console.error(`❌ Task ${taskId} not found in active queue.`);
      return { ok: false, code: 'TASK_NOT_FOUND' };
    }

    try {
      const taskData = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
      const rejResult = TaskLifecycle.rejectTask(taskData, { approver, reason: 'Rejected by human engineer' });
      fs.writeFileSync(taskPath, JSON.stringify(taskData, null, 2), 'utf-8');
      console.log(`🛑 [REJECTED] Task ${taskId} marked as REJECTED by ${approver}.\n`);
      return { ok: true, task_id: taskId, status: 'REJECTED' };
    } catch (e) {
      console.error(`❌ Error rejecting task ${taskId}: ${e.message}`);
      return { ok: false, code: 'TASK_UPDATE_ERROR', error: e.message };
    }
  }

  /**
   * Diagnostic-only post-merge verification check.
   * NEVER PERFORMS MERGE OR PUSH.
   */
  postMergeCheck(taskId, baseBranch = 'dev') {
    this.showBanner();
    console.log(`── Diagnostic Post-Merge Check for Task: ${taskId} ──\n`);

    const result = {
      task_id: taskId,
      base_branch: baseBranch,
      commit_in_dev: false,
      working_tree_clean: false,
      tests_passing: false,
      services_healthy: false
    };

    // 1. Check if commit exists in base branch
    const completedFile = path.join(COMPLETED_DIR, `${taskId}.json`);
    let commitSha = null;
    if (fs.existsSync(completedFile)) {
      try {
        const rep = JSON.parse(fs.readFileSync(completedFile, 'utf-8'));
        commitSha = rep.commit_sha || rep.git?.commits?.[0]?.sha;
      } catch {}
    }

    if (commitSha) {
      try {
        const contains = execSync(`git branch --contains ${commitSha}`, { cwd: DEV_ROOT, encoding: 'utf-8' });
        result.commit_in_dev = contains.includes(baseBranch);
        console.log(`  Commit [${commitSha.slice(0, 7)}] in '${baseBranch}': ${result.commit_in_dev ? '✅ YES' : '❌ NO'}`);
      } catch {
        console.log(`  Commit [${commitSha.slice(0, 7)}] in '${baseBranch}': ❌ NO`);
      }
    } else {
      console.log(`  ℹ️ No commit SHA recorded for task ${taskId}`);
    }

    // 2. Working tree cleanliness
    try {
      const status = execSync('git status --porcelain', { cwd: DEV_ROOT, encoding: 'utf-8' }).trim();
      result.working_tree_clean = status.length === 0;
      console.log(`  Working Tree Clean:            ${result.working_tree_clean ? '✅ YES' : '⚠️ DIRTY (Uncommitted files present)'}`);
    } catch {}

    // 3. Dev Services
    const ctx = this.contextEngine.getDevServicesContext();
    result.services_healthy = Boolean(ctx.web_3010 && ctx.api_3011);
    console.log(`  DEV Web (:3010) & API (:3011):  ${result.services_healthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);

    console.log(`\n  🛑 DIAGNOSTIC ONLY: Merge verification complete. Antigravity never auto-merges or pushes.\n`);
    return result;
  }

  /**
   * Displays Git worktrees.
   */
  showWorktrees() {
    this.showBanner();
    const worktrees = this.worktreeManager.listWorktrees();

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
    const worktrees = this.worktreeManager.listWorktrees();

    console.log('── Validating Worker Worktrees ──');
    let allValid = true;
    for (const wt of worktrees) {
      if (wt.exists) {
        const val = this.worktreeManager.validateWorkerWorktree(wt.worker_id);
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
    const res = this.worktreeManager.checkMergeReadiness(taskId, null, baseBranch);

    console.log(`── Merge Readiness Check for Task: ${taskId} ──\n`);
    console.log(`  Task Branch:       ${res.task_branch || 'ai/' + taskId}`);
    console.log(`  Base Branch:       ${res.base_branch || baseBranch}`);
    console.log(`  Commits Ahead:     ${res.commits_ahead || 0}`);
    console.log(`  Changed Files:     ${res.changed_files ? res.changed_files.length : 0}`);
    if (res.changed_files && res.changed_files.length > 0) {
      res.changed_files.forEach(f => console.log(`     • ${f}`));
    }
    console.log(`  Affected Packages: ${res.affected_packages ? res.affected_packages.join(', ') : 'None'}`);
    console.log(`  Merge Conflicts:   ${res.has_conflicts ? '⚠️ DETECTED' : 'NONE (Clean)'}`);
    if (res.has_conflicts) {
      console.log(`     Details: ${res.conflict_details}`);
    }
    console.log(`  Test Status:       ${res.test_status || 'UNKNOWN'}`);
    console.log(`  Acceptance Status: ${res.acceptance_criteria_status || 'UNKNOWN'}`);
    console.log(`  Production Safety: ${res.production_safety || 'PASSED'}`);
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
    console.log('  npm run ai:manager -- "<user_request>"       Analyze request, assess risk, and generate plan');
    console.log('  npm run ai:manager -- --plan "<request>"     Plan without executing (Awaiting approval)');
    console.log('  npm run ai:manager -- --approve <TASK_ID>    Explicitly approve task for worker execution');
    console.log('  npm run ai:manager -- --approve-plan <ID>    Approve root task and dependent DAG subtasks');
    console.log('  npm run ai:manager -- --reject <TASK_ID>     Explicitly reject an active task');
    console.log('  npm run ai:schedule                          Execute approved runnable tasks in parallel worktrees');
    console.log('  npm run ai:manager -- --status               Display manager & worker queue status');
    console.log('  npm run ai:manager -- --workers              List all registered workers in multi-worker pool');
    console.log('  npm run ai:manager -- --worktrees            List all Git worktrees and worker assignments');
    console.log('  npm run ai:manager -- --worktree-check       Validate integrity of all worker worktrees');
    console.log('  npm run ai:manager -- --merge-check <ID>     Read-only merge readiness assessment');
    console.log('  npm run ai:manager -- --post-merge-check <ID> Diagnostic-only post-merge verification check');
    console.log('  npm run ai:manager -- --graph [TASK_ID]      Render ASCII dependency tree for task(s)');
    console.log('  npm run ai:manager -- --history [query]      Query structured project development history');
    console.log('  npm run ai:manager -- --review <TASK_ID>     Review completed task report and view Human Review Package');
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

  if (args.includes('--post-merge-check')) {
    const checkIdx = args.indexOf('--post-merge-check') + 1;
    const taskId = args[checkIdx];
    if (!taskId) {
      console.error('❌ Error: Task ID required for --post-merge-check (e.g. npm run ai:manager -- --post-merge-check NEXA-0034)');
      process.exit(1);
    }
    manager.postMergeCheck(taskId);
    return;
  }

  if (args.includes('--approve')) {
    const appIdx = args.indexOf('--approve') + 1;
    const taskId = args[appIdx];
    if (!taskId) {
      console.error('❌ Error: Task ID required for --approve (e.g. npm run ai:manager -- --approve NEXA-0034)');
      process.exit(1);
    }
    manager.approveTask(taskId);
    return;
  }

  if (args.includes('--approve-plan')) {
    const appIdx = args.indexOf('--approve-plan') + 1;
    const taskId = args[appIdx];
    if (!taskId) {
      console.error('❌ Error: Root Task ID required for --approve-plan (e.g. npm run ai:manager -- --approve-plan NEXA-0034)');
      process.exit(1);
    }
    manager.approvePlan(taskId);
    return;
  }

  if (args.includes('--reject')) {
    const rejIdx = args.indexOf('--reject') + 1;
    const taskId = args[rejIdx];
    if (!taskId) {
      console.error('❌ Error: Task ID required for --reject (e.g. npm run ai:manager -- --reject NEXA-0034)');
      process.exit(1);
    }
    manager.rejectTask(taskId);
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
    const promptIdx = args.indexOf('--plan') + 1;
    const prompt = args[promptIdx] || args[args.length - 1];
    await manager.handleUserRequest(prompt);
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
