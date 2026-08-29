/**
 * Nexa AI Development System — Phase 6 Main Manager Dispatcher
 * Dispatches work orders to available worker agents based on capabilities,
 * monitors execution, prevents workspace conflicts, and performs crash recovery.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const WorkerRegistry = require('./worker-registry');
const { checkAndRecoverInterrupted } = require('../scripts/worker');

const DEV_ROOT = path.resolve(__dirname, '../..');
const AI_DIR = path.join(DEV_ROOT, '.ai');
const TASKS_DIR = path.join(AI_DIR, 'tasks');
const ACTIVE_DIR = path.join(TASKS_DIR, 'active');
const WORKER_SCRIPT = path.join(AI_DIR, 'scripts', 'worker.js');

class Dispatcher {
  constructor(workerId = 'nexa-dev-01', registry = null) {
    this.workerId = workerId;
    this.registry = registry || new WorkerRegistry();
  }

  /**
   * Checks worker status in registry and checks for stale heartbeat.
   */
  getWorkerStatus(targetWorkerId = this.workerId) {
    // Run crash recovery check for stale locks
    try {
      checkAndRecoverInterrupted(60000);
    } catch {}

    const worker = this.registry.getWorker(targetWorkerId);
    if (!worker) {
      return { ok: false, code: 'WORKER_NOT_FOUND', status: 'UNKNOWN' };
    }

    // Check heartbeat freshness
    let isHeartbeatStale = false;
    const hbFile = path.join(AI_DIR, 'workers', `heartbeat_${targetWorkerId}.json`);
    const globalHbFile = path.join(AI_DIR, 'workers', 'heartbeat.json');
    const checkFile = fs.existsSync(hbFile) ? hbFile : globalHbFile;

    if (fs.existsSync(checkFile)) {
      try {
        const hb = JSON.parse(fs.readFileSync(checkFile, 'utf-8'));
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
      capabilities: worker.capabilities || [],
      worker,
      is_stale: isHeartbeatStale
    };
  }

  /**
   * Dispatches a work order to an eligible capable worker.
   */
  async dispatch(taskId, preferredWorkerId = null) {
    const taskPath = path.join(ACTIVE_DIR, `${taskId}.json`);
    if (!fs.existsSync(taskPath)) {
      return { ok: false, code: 'TASK_NOT_FOUND', reason: `Active task ${taskId} not found in ${ACTIVE_DIR}` };
    }

    const lockPath = path.join(ACTIVE_DIR, `${taskId}.lock`);
    if (fs.existsSync(lockPath)) {
      return { ok: false, code: 'TASK_ALREADY_LOCKED', reason: `Task ${taskId} is currently locked by another worker process` };
    }

    let taskData = null;
    try {
      taskData = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
    } catch (err) {
      return { ok: false, code: 'TASK_PARSE_ERROR', reason: err.message };
    }

    // 1. Environment Health Check
    const ProjectContextEngine = require('./project-context');
    const ctxEngine = new ProjectContextEngine(DEV_ROOT);
    const envHealth = ctxEngine.checkEnvironmentHealth();
    if (!envHealth.ok) {
      console.error(`\n❌ [DISPATCH BLOCKED] Development environment unhealthy: ${envHealth.reason}`);
      return {
        ok: false,
        code: 'BLOCKED_ENVIRONMENT',
        reason: envHealth.reason,
        details: envHealth.details
      };
    }

    // 2. Select Worker & Validate Capabilities
    const targetWorkerId = preferredWorkerId || taskData.assigned_worker || this.workerId;
    let selectedWorker = this.registry.getWorker(targetWorkerId);

    // If specific worker requested, verify capabilities
    const requiredCaps = taskData.required_capabilities || [];
    if (selectedWorker) {
      const workerCaps = (selectedWorker.capabilities || []).map(c => c.toLowerCase());
      const hasCaps = requiredCaps.length === 0 || requiredCaps.some(req =>
        workerCaps.some(cap => cap.includes(req.toLowerCase()) || req.toLowerCase().includes(cap))
      );

      if (!hasCaps) {
        // Try to find another capable worker
        const alternative = this.registry.findCapableWorker(requiredCaps);
        if (alternative) {
          selectedWorker = alternative;
        } else {
          return {
            ok: false,
            code: 'BLOCKED_NO_CAPABLE_WORKER',
            reason: `Worker '${targetWorkerId}' lacks required capabilities [${requiredCaps.join(', ')}] and no other capable worker is available.`
          };
        }
      }
    } else {
      selectedWorker = this.registry.findCapableWorker(requiredCaps);
      if (!selectedWorker) {
        return {
          ok: false,
          code: 'BLOCKED_NO_CAPABLE_WORKER',
          reason: `No AVAILABLE worker found matching required capabilities: [${requiredCaps.join(', ')}]`
        };
      }
    }

    const workerId = selectedWorker.worker_id || selectedWorker.id;
    const workerStatus = this.getWorkerStatus(workerId);

    if (workerStatus.status === 'BUSY' && workerStatus.current_task !== taskId) {
      return {
        ok: false,
        code: 'WORKER_BUSY',
        reason: `Worker ${workerId} is currently busy executing task ${workerStatus.current_task}`
      };
    }

    if (workerStatus.status === 'STALE' || workerStatus.status === 'OFFLINE' || workerStatus.status === 'ERROR') {
      return {
        ok: false,
        code: 'WORKER_UNAVAILABLE',
        reason: `Worker ${workerId} is currently in ${workerStatus.status} state`
      };
    }

    console.log(`\n📡 [DISPATCH] Dispatching ${taskId} to worker '${workerId}' (Capabilities: [${(selectedWorker.capabilities || []).join(', ')}])...`);

    // Record assignment in work order
    taskData.assigned_worker = workerId;
    taskData.state_history = taskData.state_history || [];
    taskData.state_history.push({
      state: 'CLAIMED',
      worker: workerId,
      timestamp: new Date().toISOString()
    });
    fs.writeFileSync(taskPath, JSON.stringify(taskData, null, 2), 'utf-8');

    // Update worker status to BUSY
    this.registry.updateWorkerStatus(workerId, 'BUSY', taskId);

    try {
      const workerOutput = execSync(`node "${WORKER_SCRIPT}" --run "${taskId}"`, {
        cwd: DEV_ROOT,
        encoding: 'utf-8',
        timeout: 180000
      });

      // Release worker back to AVAILABLE
      this.registry.updateWorkerStatus(workerId, 'AVAILABLE', null);

      return {
        ok: true,
        task_id: taskId,
        worker_id: workerId,
        output: workerOutput
      };
    } catch (err) {
      this.registry.updateWorkerStatus(workerId, 'AVAILABLE', null);
      return {
        ok: false,
        code: 'DISPATCH_EXECUTION_ERROR',
        task_id: taskId,
        worker_id: workerId,
        error: err.message,
        stdout: err.stdout ? err.stdout.toString() : '',
        stderr: err.stderr ? err.stderr.toString() : ''
      };
    }
  }
}

module.exports = Dispatcher;
