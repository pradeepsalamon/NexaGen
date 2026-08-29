/**
 * Nexa AI Development System — Phase 6 Filesystem Scheduler
 * Scans task queues, evaluates DAG dependency graphs, matches capable workers,
 * dispatches runnable tasks, and manages crash recovery.
 *
 * CRITICAL RULE: Filesystem-based, idempotent, zero external message queues.
 */

const fs = require('fs');
const path = require('path');
const WorkerRegistry = require('./worker-registry');
const DependencyGraph = require('./dependency-graph');
const Dispatcher = require('./dispatcher');
const Reviewer = require('./reviewer');
const { checkAndRecoverInterrupted } = require('../scripts/worker');

const DEV_ROOT = path.resolve(__dirname, '../..');
const AI_DIR = path.join(DEV_ROOT, '.ai');
const TASKS_DIR = path.join(AI_DIR, 'tasks');
const ACTIVE_DIR = path.join(TASKS_DIR, 'active');
const COMPLETED_DIR = path.join(TASKS_DIR, 'completed');
const FAILED_DIR = path.join(TASKS_DIR, 'failed');

class Scheduler {
  constructor(registry = null) {
    this.registry = registry || new WorkerRegistry();
    this.reviewer = new Reviewer();
  }

  /**
   * Loads all tasks currently in the active directory.
   */
  loadActiveTasks() {
    if (!fs.existsSync(ACTIVE_DIR)) return [];
    const files = fs.readdirSync(ACTIVE_DIR).filter(f => f.endsWith('.json'));
    const tasks = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(ACTIVE_DIR, file), 'utf-8');
        const task = JSON.parse(content);
        tasks.push(task);
      } catch {}
    }
    return tasks;
  }

  /**
   * Loads all completed and accepted task IDs.
   */
  loadCompletedTaskIds() {
    if (!fs.existsSync(COMPLETED_DIR)) return new Set();
    const files = fs.readdirSync(COMPLETED_DIR).filter(f => f.endsWith('.json'));
    return new Set(files.map(f => f.replace('.json', '')));
  }

  /**
   * Loads all failed task IDs.
   */
  loadFailedTaskIds() {
    if (!fs.existsSync(FAILED_DIR)) return new Set();
    const files = fs.readdirSync(FAILED_DIR).filter(f => f.endsWith('.json'));
    return new Set(files.map(f => f.replace('.json', '')));
  }

  /**
   * Runs one scheduling cycle across all active tasks.
   */
  async runCycle(options = {}) {
    const cycleLog = [];
    const log = (msg) => {
      cycleLog.push(msg);
      if (!options.silent) console.log(msg);
    };

    log('============================================================');
    log('         Nexa AI Filesystem Scheduler — Cycle');
    log(`         Time: ${new Date().toISOString()}`);
    log('============================================================\n');

    // 1. Crash Recovery
    try {
      const recovered = checkAndRecoverInterrupted(60000);
      if (recovered > 0) {
        log(`🛠️ Recovered ${recovered} stale/interrupted task(s).`);
      }
    } catch {}

    // 2. Validate Worker Registry
    const regCheck = this.registry.validateRegistry();
    if (!regCheck.ok) {
      log(`❌ Worker Registry Error: ${regCheck.errors.join(', ')}`);
      return { ok: false, code: 'INVALID_REGISTRY', errors: regCheck.errors };
    }

    // 3. Load Queues & Graph
    const activeTasks = this.loadActiveTasks();
    const completedIds = this.loadCompletedTaskIds();
    const failedIds = this.loadFailedTaskIds();

    log(`Active Tasks in Queue: ${activeTasks.length}`);
    log(`Completed Tasks:       ${completedIds.size}`);
    log(`Failed Tasks:          ${failedIds.size}`);

    if (activeTasks.length === 0) {
      log('\nℹ️ No active tasks in queue. Scheduler cycle complete.\n');
      return { ok: true, scheduled: 0, active: 0, cycleLog };
    }

    // 4. Validate Dependency Graph
    const graph = new DependencyGraph(activeTasks);
    const graphValidation = graph.validateGraph(completedIds, failedIds);

    if (!graphValidation.ok) {
      log('\n❌ Dependency Graph Validation Error:');
      graphValidation.errors.forEach(e => log(`   - [${e.type}] ${e.reason}`));
      return { ok: false, code: 'INVALID_DEPENDENCY_GRAPH', errors: graphValidation.errors };
    }

    // 5. Evaluate Runnable & Blocked Tasks
    const runningTaskIds = new Set();
    if (fs.existsSync(ACTIVE_DIR)) {
      const locks = fs.readdirSync(ACTIVE_DIR).filter(f => f.endsWith('.lock'));
      locks.forEach(l => runningTaskIds.add(l.replace('.lock', '')));
    }

    const runnableTasks = graph.getRunnableTasks(completedIds, runningTaskIds);
    const blockedTasks = graph.getBlockedTasks(completedIds, failedIds);

    log(`\nRunnable Tasks:        ${runnableTasks.length}`);
    log(`Currently Running:     ${runningTaskIds.size}`);
    log(`Blocked on Deps:       ${blockedTasks.length}`);

    if (blockedTasks.length > 0) {
      log('\n⏳ Blocked Tasks:');
      for (const b of blockedTasks) {
        if (b.is_failed_blocked) {
          log(`   ❌ [${b.task_id}] BLOCKED by failed dependency: ${b.failed_dependencies.join(', ')}`);
        } else {
          log(`   ⏳ [${b.task_id}] WAITING for dependencies: ${b.pending_dependencies.join(', ')}`);
        }
      }
    }

    // 6. Schedule & Dispatch Runnable Tasks in Parallel
    let scheduledCount = 0;
    const dispatchedTasks = [];
    const assignedWorkerIdsInCycle = new Set();

    for (const task of runnableTasks) {
      const requiredCaps = task.required_capabilities || [];
      const worker = this.registry.findCapableWorker(requiredCaps, Array.from(assignedWorkerIdsInCycle));

      if (!worker) {
        log(`\n⚠️ [${task.task_id}] No capable AVAILABLE worker found for capabilities: [${requiredCaps.join(', ')}]`);
        continue;
      }

      const workerId = worker.worker_id || worker.id;
      assignedWorkerIdsInCycle.add(workerId);

      log(`\n🚀 [SCHEDULE] Assigning task ${task.task_id} to worker '${workerId}'...`);
      
      // Update task assignment in file via TaskLifecycle
      task.assigned_worker = workerId;
      const TaskLifecycle = require('./task-lifecycle');
      TaskLifecycle.transition(task, 'ASSIGNED', { worker: workerId, reason: `Assigned to capable worker ${workerId}` });
      fs.writeFileSync(path.join(ACTIVE_DIR, `${task.task_id}.json`), JSON.stringify(task, null, 2), 'utf-8');

      // Dispatch task
      const dispatcher = new Dispatcher(workerId);
      const dispatchResult = await dispatcher.dispatch(task.task_id);

      if (dispatchResult.ok) {
        scheduledCount++;
        dispatchedTasks.push({
          task_id: task.task_id,
          worker_id: workerId,
          worktree_path: dispatchResult.worktree_path,
          task_branch: dispatchResult.task_branch
        });
      } else {
        log(`❌ Dispatch failed for ${task.task_id}: ${dispatchResult.reason || dispatchResult.error}`);
      }
    }

    log(`\n============================================================`);
    log(`Cycle Complete: Dispatched ${scheduledCount} task(s).`);
    log(`============================================================\n`);

    return {
      ok: true,
      scheduled: scheduledCount,
      dispatched: dispatchedTasks,
      active: activeTasks.length,
      runnable: runnableTasks.length,
      cycleLog
    };
  }
}

// CLI handler
async function main() {
  const scheduler = new Scheduler();
  const result = await scheduler.runCycle();
  if (!result.ok) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Scheduler Error:', err.message);
    process.exit(1);
  });
}

module.exports = Scheduler;
