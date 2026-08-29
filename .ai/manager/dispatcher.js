/**
 * Nexa AI Development System — Phase 4 Main Manager Dispatcher
 * Dispatches work orders to available worker agents, monitors execution, and performs crash recovery.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { checkAndRecoverInterrupted } = require('../scripts/worker');

const DEV_ROOT = path.resolve(__dirname, '../..');
const AI_DIR = path.join(DEV_ROOT, '.ai');
const TASKS_DIR = path.join(AI_DIR, 'tasks');
const ACTIVE_DIR = path.join(TASKS_DIR, 'active');
const REGISTRY_FILE = path.join(AI_DIR, 'workers', 'registry.json');
const HEARTBEAT_FILE = path.join(AI_DIR, 'workers', 'heartbeat.json');
const WORKER_SCRIPT = path.join(AI_DIR, 'scripts', 'worker.js');

class Dispatcher {
  constructor(workerId = 'nexa-dev-01') {
    this.workerId = workerId;
  }

  /**
   * Checks worker status in registry and checks for stale heartbeat.
   */
  getWorkerStatus() {
    // Run crash recovery check for stale locks
    try {
      checkAndRecoverInterrupted(60000);
    } catch {}

    if (!fs.existsSync(REGISTRY_FILE)) {
      return { ok: false, code: 'WORKER_REGISTRY_MISSING', status: 'UNKNOWN' };
    }

    try {
      const reg = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
      const worker = reg.workers?.find(w => w.id === this.workerId);
      if (!worker) {
        return { ok: false, code: 'WORKER_NOT_FOUND', status: 'UNKNOWN' };
      }

      // Check heartbeat freshness
      let isHeartbeatStale = false;
      if (fs.existsSync(HEARTBEAT_FILE)) {
        try {
          const hb = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf-8'));
          const hbTime = new Date(hb.timestamp).getTime();
          if (Date.now() - hbTime > 60000) {
            isHeartbeatStale = true;
          }
        } catch {}
      }

      return {
        ok: true,
        status: isHeartbeatStale ? 'STALE' : worker.status,
        current_task: worker.current_task,
        worker,
        is_stale: isHeartbeatStale
      };
    } catch (err) {
      return { ok: false, code: 'REGISTRY_PARSE_ERROR', reason: err.message };
    }
  }

  /**
   * Dispatches a work order to the worker.
   */
  async dispatch(taskId) {
    const taskPath = path.join(ACTIVE_DIR, `${taskId}.json`);
    if (!fs.existsSync(taskPath)) {
      return { ok: false, code: 'TASK_NOT_FOUND', reason: `Active task ${taskId} not found in ${ACTIVE_DIR}` };
    }

    const lockPath = path.join(ACTIVE_DIR, `${taskId}.lock`);
    if (fs.existsSync(lockPath)) {
      return { ok: false, code: 'TASK_ALREADY_LOCKED', reason: `Task ${taskId} is currently locked by another worker process` };
    }

    const workerStatus = this.getWorkerStatus();
    if (!workerStatus.ok) {
      return workerStatus;
    }

    if (workerStatus.status === 'BUSY' && workerStatus.current_task !== taskId) {
      return {
        ok: false,
        code: 'WORKER_BUSY',
        reason: `Worker ${this.workerId} is currently busy executing task ${workerStatus.current_task}`
      };
    }

    console.log(`\n📡 [DISPATCH] Dispatching ${taskId} to worker '${this.workerId}'...`);

    try {
      const workerOutput = execSync(`node "${WORKER_SCRIPT}" --run "${taskId}"`, {
        cwd: DEV_ROOT,
        encoding: 'utf-8',
        timeout: 120000
      });

      return {
        ok: true,
        task_id: taskId,
        worker_id: this.workerId,
        output: workerOutput
      };
    } catch (err) {
      return {
        ok: false,
        code: 'DISPATCH_EXECUTION_ERROR',
        task_id: taskId,
        error: err.message,
        stdout: err.stdout ? err.stdout.toString() : '',
        stderr: err.stderr ? err.stderr.toString() : ''
      };
    }
  }
}

module.exports = Dispatcher;
