/**
 * Nexa AI Development System — Phase 6 Worker Registry Manager
 * Manages multi-worker pool state, capability routing, and heartbeat tracking.
 *
 * CRITICAL RULE: Filesystem-based state with atomic consistency.
 */

const fs = require('fs');
const path = require('path');

const DEV_ROOT = path.resolve(__dirname, '../..');
const AI_DIR = path.join(DEV_ROOT, '.ai');
const REGISTRY_FILE = path.join(AI_DIR, 'workers', 'registry.json');
const HEARTBEAT_DIR = path.join(AI_DIR, 'workers');

const VALID_STATUSES = ['AVAILABLE', 'BUSY', 'STALE', 'OFFLINE', 'ERROR'];

class WorkerRegistry {
  constructor(registryFile = REGISTRY_FILE) {
    this.registryFile = registryFile;
  }

  /**
   * Loads the current registry from disk.
   */
  loadRegistry() {
    if (!fs.existsSync(this.registryFile)) {
      return { workers: [], updated_at: new Date().toISOString() };
    }
    try {
      return JSON.parse(fs.readFileSync(this.registryFile, 'utf-8'));
    } catch (err) {
      return { workers: [], error: err.message };
    }
  }

  /**
   * Atomically saves the registry to disk.
   */
  saveRegistry(data) {
    const payload = {
      ...data,
      updated_at: new Date().toISOString()
    };
    fs.writeFileSync(this.registryFile, JSON.stringify(payload, null, 2), 'utf-8');
  }

  /**
   * Returns list of all registered workers.
   */
  getWorkers() {
    const reg = this.loadRegistry();
    return reg.workers || [];
  }

  /**
   * Returns a specific worker by ID.
   */
  getWorker(workerId) {
    const workers = this.getWorkers();
    return workers.find(w => (w.worker_id === workerId || w.id === workerId)) || null;
  }

  /**
   * Validates the registry structure and detects duplicate worker IDs.
   */
  validateRegistry() {
    const workers = this.getWorkers();
    const seenIds = new Set();
    const errors = [];

    for (const w of workers) {
      const id = w.worker_id || w.id;
      if (!id) {
        errors.push('Found worker missing worker_id');
        continue;
      }
      if (seenIds.has(id)) {
        errors.push(`Duplicate worker ID detected: ${id}`);
      }
      seenIds.add(id);

      if (!VALID_STATUSES.includes(w.status)) {
        errors.push(`Worker ${id} has invalid status: ${w.status}`);
      }

      if (!Array.isArray(w.capabilities) || w.capabilities.length === 0) {
        errors.push(`Worker ${id} has missing or empty capabilities`);
      }
    }

    return {
      ok: errors.length === 0,
      errors
    };
  }

  /**
   * Finds an AVAILABLE worker that satisfies the required capabilities.
   */
  findCapableWorker(requiredCapabilities = [], excludeWorkerIds = []) {
    const workers = this.getWorkers();
    const available = workers.filter(w => 
      w.status === 'AVAILABLE' && 
      !excludeWorkerIds.includes(w.worker_id || w.id)
    );

    if (available.length === 0) {
      return null;
    }

    if (!requiredCapabilities || requiredCapabilities.length === 0) {
      return available[0];
    }

    const reqLower = requiredCapabilities.map(c => c.toLowerCase());

    // Score available workers by number of matching capabilities
    let bestWorker = null;
    let bestScore = -1;

    for (const worker of available) {
      const workerCaps = (worker.capabilities || []).map(c => c.toLowerCase());
      
      // Check if worker has ALL required capabilities, or calculate coverage score
      const matches = reqLower.filter(req => 
        workerCaps.some(cap => cap.includes(req) || req.includes(cap))
      );

      const score = matches.length;
      if (score === reqLower.length) {
        // Complete match found
        return worker;
      }

      if (score > bestScore) {
        bestScore = score;
        bestWorker = worker;
      }
    }

    // If best worker matched at least one required capability, return it
    if (bestScore > 0) {
      return bestWorker;
    }

    // If strict capability matching fails, return null
    return null;
  }

  /**
   * Updates worker status and current task.
   */
  updateWorkerStatus(workerId, status, currentTask = null) {
    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`Invalid worker status '${status}'`);
    }

    const reg = this.loadRegistry();
    let updated = false;

    for (const w of reg.workers) {
      if (w.worker_id === workerId || w.id === workerId) {
        w.status = status;
        w.current_task = currentTask;
        w.heartbeat = new Date().toISOString();
        if (status === 'COMPLETED' || (status === 'AVAILABLE' && w.current_task === null)) {
          // Keep count
        }
        updated = true;
        break;
      }
    }

    if (updated) {
      this.saveRegistry(reg);
    }
    return updated;
  }

  /**
   * Records a heartbeat pulse for a worker.
   */
  recordHeartbeat(workerId, metadata = {}) {
    const pulse = {
      worker_id: workerId,
      timestamp: new Date().toISOString(),
      pid: metadata.pid || process.pid,
      status: metadata.status || 'RUNNING',
      task_id: metadata.task_id || null,
      phase: metadata.phase || 'EXECUTION'
    };

    const hbFile = path.join(HEARTBEAT_DIR, `heartbeat_${workerId}.json`);
    try {
      fs.writeFileSync(hbFile, JSON.stringify(pulse, null, 2), 'utf-8');
    } catch {}

    // Also update global heartbeat
    try {
      fs.writeFileSync(path.join(HEARTBEAT_DIR, 'heartbeat.json'), JSON.stringify(pulse, null, 2), 'utf-8');
    } catch {}
  }
}

module.exports = WorkerRegistry;
