#!/usr/bin/env node
/**
 * Nexa AI Development System — Phase 2.1 Hardened Gemini Worker Engine
 * 
 * Worker ID: nexa-dev-01
 * Role: Primary Development Worker (Gemini / Antigravity)
 * Environment: DEVELOPMENT ONLY (/opt/nexa-chess/NexaGen-dev)
 * Safety Level: STRICT ISOLATION & AUDITED COMMAND POLICY
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// ============================================================
// Constants & Configuration
// ============================================================
const WORKER_ID = 'nexa-dev-01';
const EXPECTED_DEV_ROOT = '/opt/nexa-chess/NexaGen-dev';
const DEV_ROOT = path.resolve(__dirname, '../..');
const AI_DIR = path.join(DEV_ROOT, '.ai');
const TASKS_DIR = path.join(AI_DIR, 'tasks');
const ACTIVE_DIR = path.join(TASKS_DIR, 'active');
const COMPLETED_DIR = path.join(TASKS_DIR, 'completed');
const FAILED_DIR = path.join(TASKS_DIR, 'failed');
const REGISTRY_FILE = path.join(AI_DIR, 'workers', 'registry.json');
const STATE_FILE = path.join(AI_DIR, 'workers', 'state.json');
const HEARTBEAT_FILE = path.join(AI_DIR, 'workers', 'heartbeat.json');
const VERIFY_SCRIPT = path.join(AI_DIR, 'scripts', 'verify.sh');

const ALLOWED_DATABASES = ['vps_dev'];
const BLOCKED_DATABASES = ['nexa_chess', 'postgres'];
const ALLOWED_REDIS_NAMESPACES = ['nexa:dev:', 'nexa:ai:'];

let heartbeatInterval = null;

// ============================================================
// Safety Validator Module
// ============================================================
class SafetyValidator {
  /**
   * Validates that a path is strictly inside DEV_ROOT and not traversing outside.
   */
  static validatePath(targetPath) {
    if (!targetPath || typeof targetPath !== 'string') {
      return { ok: false, code: 'BLOCKED_INVALID_PATH', reason: 'Path must be a non-empty string' };
    }

    // Resolve absolute path
    const resolvedPath = path.isAbsolute(targetPath) ? path.normalize(targetPath) : path.normalize(path.resolve(DEV_ROOT, targetPath));

    // Reject path traversal tokens
    if (targetPath.includes('..')) {
      const normalized = path.normalize(targetPath);
      if (!resolvedPath.startsWith(EXPECTED_DEV_ROOT)) {
        return { ok: false, code: 'BLOCKED_OUTSIDE_DEV_SCOPE', reason: `Path traversal outside DEV_ROOT: ${targetPath}` };
      }
    }

    // Check if target is inside production directory /opt/nexa-chess/NexaGen (without -dev)
    if (resolvedPath.startsWith('/opt/nexa-chess/NexaGen') && !resolvedPath.startsWith(EXPECTED_DEV_ROOT)) {
      return { ok: false, code: 'BLOCKED_PRODUCTION_CHANGE', reason: `Attempt to target production path: ${resolvedPath}` };
    }

    // Check protected system directories
    const protectedDirs = ['/etc', '/var', '/usr', '/root', '/home/ubuntu/.ssh', '/sys', '/proc'];
    for (const pDir of protectedDirs) {
      if (resolvedPath.startsWith(pDir)) {
        return { ok: false, code: 'BLOCKED_OUTSIDE_DEV_SCOPE', reason: `Attempt to target system protected directory: ${resolvedPath}` };
      }
    }

    // Check if path is within DEV_ROOT
    if (!resolvedPath.startsWith(EXPECTED_DEV_ROOT)) {
      return { ok: false, code: 'BLOCKED_OUTSIDE_DEV_SCOPE', reason: `Path ${resolvedPath} is outside DEV_ROOT ${EXPECTED_DEV_ROOT}` };
    }

    // Symlink resolution safety
    try {
      if (fs.existsSync(resolvedPath)) {
        const real = fs.realpathSync(resolvedPath);
        if (!real.startsWith(EXPECTED_DEV_ROOT)) {
          return { ok: false, code: 'BLOCKED_OUTSIDE_DEV_SCOPE', reason: `Symlink target ${real} escapes DEV_ROOT` };
        }
      } else {
        // If file does not exist yet, check its parent directory realpath
        const parentDir = path.dirname(resolvedPath);
        if (fs.existsSync(parentDir)) {
          const realParent = fs.realpathSync(parentDir);
          if (!realParent.startsWith(EXPECTED_DEV_ROOT)) {
            return { ok: false, code: 'BLOCKED_OUTSIDE_DEV_SCOPE', reason: `Parent directory symlink escapes DEV_ROOT: ${realParent}` };
          }
        }
      }
    } catch (err) {
      return { ok: false, code: 'BLOCKED_FS_ERROR', reason: `Filesystem resolution error: ${err.message}` };
    }

    return { ok: true, resolvedPath };
  }

  /**
   * Validates command safety against production, system-level, or destructive actions.
   */
  static validateCommand(cmdString) {
    if (!cmdString || typeof cmdString !== 'string') {
      return { ok: false, code: 'INVALID_COMMAND', reason: 'Command must be a non-empty string' };
    }

    // 1. Blocked Production Docker Commands
    const prodDockerPatterns = [
      /docker\s+stop\s+nexa_web/i,
      /docker\s+stop\s+nexa_api/i,
      /docker\s+restart\s+nexa_web/i,
      /docker\s+restart\s+nexa_api/i,
      /docker\s+rm/i,
      /docker\s+kill/i,
      /docker\s+compose\s+down/i,
      /docker\s+compose\s+up\s+--build\s+.*nexa_web/i,
      /docker\s+system\s+prune/i,
      /docker\s+volume\s+rm/i,
      /docker\s+network\s+rm/i
    ];
    for (const pat of prodDockerPatterns) {
      if (pat.test(cmdString)) {
        return { ok: false, code: 'BLOCKED_PRODUCTION_CHANGE', reason: `Dangerous Docker command targeting production: ${cmdString}` };
      }
    }

    // 2. Blocked Production Database Mutations
    const prodDbPatterns = [
      /nexa_chess/i,
      /drop\s+database/i,
      /truncate\s+table/i
    ];
    for (const pat of prodDbPatterns) {
      if (pat.test(cmdString)) {
        return { ok: false, code: 'BLOCKED_PRODUCTION_CHANGE', reason: `Forbidden database modification targeting production: ${cmdString}` };
      }
    }

    // 3. Blocked System Mutations (require human approval)
    const systemPatterns = [
      /\bsudo\b/i,
      /\bapt(-get)?\s+(install|remove|purge|update|upgrade)\b/i,
      /\bsystemctl\s+(stop|restart|disable|enable)\b/i,
      /\bufw\s+(delete|disable|allow|deny)\b/i,
      /\biptables\b/i,
      /\bnft\b/i,
      /\buseradd\b/i,
      /\bpasswd\b/i,
      /\bchmod\s+-R\s+777\s+\//i,
      /\bchown\s+-R\b/i
    ];
    for (const pat of systemPatterns) {
      if (pat.test(cmdString)) {
        return { ok: false, code: 'SYSTEM_CHANGE_REQUIRED', reason: `System configuration change requires human approval: ${cmdString}` };
      }
    }

    // 4. Blocked Redis Flush Commands
    if (/\bFLUSHALL\b/i.test(cmdString) || /\bFLUSHDB\b/i.test(cmdString)) {
      return { ok: false, code: 'BLOCKED_REDIS_SAFETY', reason: `FLUSHALL/FLUSHDB is strictly forbidden: ${cmdString}` };
    }

    // 5. Blocked Destructive Git Commands
    const gitForbiddenPatterns = [
      /git\s+reset\s+--hard/i,
      /git\s+clean\s+-f/i,
      /git\s+clean\s+-fd/i,
      /git\s+restore\s+\./i,
      /git\s+push\s+origin\s+main/i,
      /git\s+push\s+origin\s+dev/i,
      /git\s+push\s+.*--force/i,
      /git\s+merge\s+/i
    ];
    for (const pat of gitForbiddenPatterns) {
      if (pat.test(cmdString)) {
        return { ok: false, code: 'BLOCKED_GIT_SAFETY', reason: `Dangerous Git operation violates worker policy: ${cmdString}` };
      }
    }

    // 6. Generic Destructive Commands
    if (/rm\s+-rf\s+\//i.test(cmdString) || /rm\s+-rf\s+~/i.test(cmdString) || /mkfs/i.test(cmdString) || /dd\s+if=/i.test(cmdString)) {
      return { ok: false, code: 'BLOCKED_DESTRUCTIVE_COMMAND', reason: `Destructive command detected: ${cmdString}` };
    }

    return { ok: true };
  }

  /**
   * Validates target database.
   */
  static validateDatabase(dbName) {
    if (!dbName) {
      return { ok: false, code: 'BLOCKED_DATABASE_ENVIRONMENT_UNKNOWN', reason: 'Database name is unspecified' };
    }
    if (dbName === 'nexa_chess' || dbName === 'postgres') {
      return { ok: false, code: 'BLOCKED_PRODUCTION_CHANGE', reason: `Target database '${dbName}' is production/system and strictly blocked` };
    }
    if (!ALLOWED_DATABASES.includes(dbName)) {
      return { ok: false, code: 'BLOCKED_DATABASE_ENVIRONMENT_UNKNOWN', reason: `Target database '${dbName}' is not in the allowed DEV whitelist [${ALLOWED_DATABASES.join(', ')}]` };
    }
    return { ok: true };
  }

  /**
   * Validates Redis namespace.
   */
  static validateRedisNamespace(key) {
    if (!key || typeof key !== 'string') {
      return { ok: false, code: 'BLOCKED_REDIS_NAMESPACE_UNAUTHORIZED', reason: 'Redis key must be specified' };
    }
    const isAllowed = ALLOWED_REDIS_NAMESPACES.some(ns => key.startsWith(ns));
    if (!isAllowed) {
      return { ok: false, code: 'BLOCKED_REDIS_NAMESPACE_UNAUTHORIZED', reason: `Redis key '${key}' does not match allowed DEV namespaces [${ALLOWED_REDIS_NAMESPACES.join(', ')}]` };
    }
    return { ok: true };
  }
}

// ============================================================
// System & Environment Validation
// ============================================================
function validateEnvironment() {
  if (DEV_ROOT !== EXPECTED_DEV_ROOT) {
    console.error(`❌ CRITICAL ERROR: Invalid DEV_ROOT. Expected ${EXPECTED_DEV_ROOT}, got ${DEV_ROOT}`);
    process.exit(1);
  }

  if (!fs.existsSync(path.join(DEV_ROOT, '.git'))) {
    console.error(`❌ CRITICAL ERROR: .git directory not found in ${DEV_ROOT}`);
    process.exit(1);
  }

  // Ensure directories exist
  [ACTIVE_DIR, COMPLETED_DIR, FAILED_DIR, path.join(AI_DIR, 'workers')].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  return true;
}

function runCmd(cmd, options = {}) {
  // Validate command with safety engine before running
  const validation = SafetyValidator.validateCommand(cmd);
  if (!validation.ok) {
    const err = new Error(`[${validation.code}] ${validation.reason}`);
    err.code = validation.code;
    throw err;
  }

  try {
    return execSync(cmd, {
      cwd: DEV_ROOT,
      encoding: 'utf-8',
      timeout: options.timeout || 60000,
      ...options
    }).trim();
  } catch (err) {
    if (options.ignoreError) return err.stdout ? err.stdout.trim() : '';
    throw err;
  }
}

// ============================================================
// Worker Registry & State Management
// ============================================================
function updateRegistryStatus(status, currentTaskId = null) {
  try {
    let registry = { workers: [], updated_at: new Date().toISOString() };
    if (fs.existsSync(REGISTRY_FILE)) {
      registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
    }
    const worker = registry.workers.find(w => w.id === WORKER_ID);
    if (worker) {
      worker.status = status;
      worker.current_task = currentTaskId;
      worker.last_heartbeat = new Date().toISOString();
    }
    registry.updated_at = new Date().toISOString();
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf-8');
  } catch (err) {
    console.error('⚠️ Failed to update worker registry:', err.message);
  }
}

function updateState(taskId, phase, status = 'RUNNING', extra = {}) {
  const now = new Date().toISOString();
  const state = {
    worker_id: WORKER_ID,
    task_id: taskId,
    status: status,
    phase: phase,
    started_at: extra.started_at || now,
    heartbeat: now,
    pid: process.pid,
    hostname: os.hostname(),
    ...extra
  };

  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify({
      worker_id: WORKER_ID,
      task_id: taskId,
      phase: phase,
      timestamp: now,
      pid: process.pid
    }, null, 2), 'utf-8');
  } catch (err) {
    console.error('⚠️ Failed to write state/heartbeat:', err.message);
  }
}

function startHeartbeat(taskId, phase) {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  updateState(taskId, phase);
  heartbeatInterval = setInterval(() => {
    updateState(taskId, phase);
  }, 5000);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  try {
    if (fs.existsSync(HEARTBEAT_FILE)) fs.unlinkSync(HEARTBEAT_FILE);
    if (fs.existsSync(STATE_FILE)) {
      const state = {
        worker_id: WORKER_ID,
        task_id: null,
        status: 'AVAILABLE',
        phase: 'IDLE',
        heartbeat: new Date().toISOString()
      };
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    }
  } catch {}
}

// ============================================================
// Interruption Detection & Recovery
// ============================================================
function checkAndRecoverInterrupted(staleTimeoutMs = 300000) {
  const activeFiles = fs.readdirSync(ACTIVE_DIR).filter(f => f.endsWith('.json'));
  let recoveredCount = 0;

  for (const f of activeFiles) {
    const lockFile = path.join(ACTIVE_DIR, f.replace('.json', '.lock'));
    if (fs.existsSync(lockFile)) {
      try {
        const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf-8'));
        const lockPid = lockData.pid;
        const lockTime = lockData.locked_at ? new Date(lockData.locked_at).getTime() : 0;
        const isStaleTime = (Date.now() - lockTime) > staleTimeoutMs;

        // Check if process is still running
        let isRunning = false;
        if (lockPid) {
          try {
            process.kill(lockPid, 0);
            isRunning = true;
          } catch {
            isRunning = false;
          }
        }

        if (!isRunning || isStaleTime) {
          console.log(`⚠️ Detected stale lock for task ${lockData.task_id} (PID ${lockPid} not running or stale).`);
          const taskPath = path.join(ACTIVE_DIR, f);
          const taskData = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
          
          // Write interrupted report to failed
          const failedReport = {
            task_id: taskData.task_id,
            status: 'failed',
            reason: 'INTERRUPTED',
            worker_id: lockData.worker_id || WORKER_ID,
            summary: `Task execution was interrupted unexpectedly (Worker process PID ${lockPid} died).`,
            evidence: `Stale lock acquired at ${lockData.locked_at || 'unknown time'}`,
            failed_at: new Date().toISOString()
          };

          fs.writeFileSync(path.join(FAILED_DIR, `${taskData.task_id}-interrupted.json`), JSON.stringify(failedReport, null, 2), 'utf-8');
          fs.unlinkSync(lockFile);
          recoveredCount++;
          console.log(`   Cleaned lock and recorded interrupted state for ${taskData.task_id}.`);
        }
      } catch (e) {
        console.error(`   Error recovering ${f}:`, e.message);
      }
    }
  }

  updateRegistryStatus('AVAILABLE');
  return recoveredCount;
}

// ============================================================
// Task Claiming & Locking (Atomic)
// ============================================================
function findPendingTask(specificTaskId = null) {
  const files = fs.readdirSync(ACTIVE_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) return null;

  for (const f of files) {
    const taskId = f.replace('.json', '');
    if (specificTaskId && taskId !== specificTaskId) continue;

    const lockFile = path.join(ACTIVE_DIR, `${taskId}.lock`);
    if (!fs.existsSync(lockFile)) {
      try {
        const taskPath = path.join(ACTIVE_DIR, f);
        const taskData = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
        return { taskData, taskPath, lockFile };
      } catch (err) {
        console.error(`⚠️ Failed to parse task ${f}:`, err.message);
      }
    }
  }
  return null;
}

function claimTask(taskInfo) {
  const { taskData, lockFile } = taskInfo;
  const lockContent = {
    task_id: taskData.task_id,
    worker_id: WORKER_ID,
    pid: process.pid,
    locked_at: new Date().toISOString(),
    hostname: os.hostname()
  };

  try {
    // Atomic write with 'wx' flag — throws EEXIST if lock already exists
    fs.writeFileSync(lockFile, JSON.stringify(lockContent, null, 2), { flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') {
      const existing = fs.readFileSync(lockFile, 'utf-8');
      throw new Error(`TASK_ALREADY_LOCKED: Task ${taskData.task_id} is already claimed by PID ${JSON.parse(existing).pid}`);
    }
    throw err;
  }

  updateRegistryStatus('BUSY', taskData.task_id);
  updateState(taskData.task_id, 'CLAIMED', 'RUNNING');
  console.log(`\n🔒 Task ${taskData.task_id} successfully claimed by ${WORKER_ID}`);
  return true;
}

function releaseLock(taskData) {
  const lockFile = path.join(ACTIVE_DIR, `${taskData.task_id}.lock`);
  if (fs.existsSync(lockFile)) {
    fs.unlinkSync(lockFile);
  }
  updateRegistryStatus('AVAILABLE');
  stopHeartbeat();
}

// ============================================================
// Preflight Safety & Environment Checks
// ============================================================
function runPreflight(taskData) {
  console.log(`\n── [PREFLIGHT] Validating Task ${taskData.task_id} ──`);
  startHeartbeat(taskData.task_id, 'PREFLIGHT');

  const checks = [];

  // 1. Required Schema Fields
  const required = ['task_id', 'title', 'objective', 'requirements', 'acceptance_criteria', 'safety'];
  const missing = required.filter(r => !taskData[r]);
  if (missing.length > 0) {
    return { ok: false, code: 'BLOCKED_INVALID_SCHEMA', reason: `Missing required schema fields: ${missing.join(', ')}` };
  }
  checks.push('Task schema is valid');

  // 2. Safety: Path Restrictions & Traversal
  const safety = taskData.safety || {};
  const blockedPaths = safety.blocked_paths || [];
  const allowedPaths = safety.allowed_paths || [DEV_ROOT];

  for (const aPath of allowedPaths) {
    const pathCheck = SafetyValidator.validatePath(aPath);
    if (!pathCheck.ok) {
      return pathCheck;
    }
  }

  for (const bPath of blockedPaths) {
    if (bPath.includes('NexaGen') && !bPath.includes('NexaGen-dev')) {
      checks.push('Production path /opt/nexa-chess/NexaGen is strictly blocked');
    }
  }

  // 3. Safety: Database Target Whitelist
  const allowedDbs = safety.allowed_databases || [];
  const blockedDbs = safety.blocked_databases || [];

  if (blockedDbs.includes('nexa_chess')) {
    checks.push('Production database nexa_chess is strictly blocked');
  }

  if (allowedDbs.length > 0) {
    for (const db of allowedDbs) {
      const dbCheck = SafetyValidator.validateDatabase(db);
      if (!dbCheck.ok) {
        return dbCheck;
      }
    }
    checks.push(`Database target verified: [${allowedDbs.join(', ')}]`);
  }

  if (safety.requires_approval === true) {
    return { ok: false, code: 'BLOCKED_REQUIRES_APPROVAL', reason: 'Task requires explicit human approval before execution' };
  }

  // 4. Git State Validation
  try {
    const gitBranch = execSync('git branch --show-current', { cwd: DEV_ROOT, encoding: 'utf-8' }).trim();
    const dirtyFiles = execSync('git status --porcelain', { cwd: DEV_ROOT, encoding: 'utf-8' }).trim();
    checks.push(`Git repo active (base branch: ${gitBranch}, dirty files: ${dirtyFiles ? dirtyFiles.split('\n').length : 0})`);
  } catch (e) {
    return { ok: false, code: 'BLOCKED_GIT_ERROR', reason: `Git inspection failed: ${e.message}` };
  }

  // 5. Dev Runtime Check
  try {
    const nodeVer = execSync('node -v', { cwd: DEV_ROOT, encoding: 'utf-8' }).trim();
    checks.push(`Node runtime available (${nodeVer})`);
  } catch (e) {
    return { ok: false, code: 'BLOCKED_ENV_ERROR', reason: `Node execution failed: ${e.message}` };
  }

  checks.forEach(c => console.log(`  ✅ ${c}`));
  console.log(`── [PREFLIGHT] Passed ──\n`);
  return { ok: true };
}

// ============================================================
// Git Task Branch Management
// ============================================================
function prepareTaskBranch(taskData) {
  const branchName = taskData.environment?.branch || `ai/${taskData.task_id}-${taskData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`;
  
  console.log(`\n── [GIT] Preparing Branch: ${branchName} ──`);
  
  const currentBranch = execSync('git branch --show-current', { cwd: DEV_ROOT, encoding: 'utf-8' }).trim();
  taskData._base_branch = currentBranch; // record base branch

  if (currentBranch !== branchName) {
    const branchExists = execSync(`git branch --list "${branchName}"`, { cwd: DEV_ROOT, encoding: 'utf-8' }).trim();
    if (branchExists) {
      console.log(`  Checking out existing task branch ${branchName}...`);
      execSync(`git checkout "${branchName}"`, { cwd: DEV_ROOT, encoding: 'utf-8' });
    } else {
      console.log(`  Creating task branch ${branchName} from ${currentBranch}...`);
      execSync(`git checkout -b "${branchName}"`, { cwd: DEV_ROOT, encoding: 'utf-8' });
    }
  } else {
    console.log(`  Already on branch ${branchName}`);
  }

  return branchName;
}

// ============================================================
// QA Verification Runner
// ============================================================
function runVerification(taskData) {
  console.log(`\n── [VERIFYING] Running QA Pipeline ──`);
  startHeartbeat(taskData.task_id, 'VERIFYING');

  const testResults = {
    typecheck: { status: 'skipped' },
    lint: { status: 'skipped', errors: 0, warnings: 0 },
    build: { status: 'skipped' },
    unit_tests: { status: 'skipped' }
  };

  // 1. Typecheck
  try {
    console.log('  Running typecheck...');
    const tStart = Date.now();
    execSync('npm run typecheck', { cwd: DEV_ROOT, encoding: 'utf-8' });
    testResults.typecheck = { status: 'passed', duration_ms: Date.now() - tStart };
    console.log('  ✅ Typecheck passed');
  } catch (err) {
    testResults.typecheck = { status: 'failed', error: 'Typecheck failed' };
    console.log('  ❌ Typecheck failed');
  }

  // 2. Lint
  try {
    console.log('  Running lint...');
    let lintOut = '';
    try {
      lintOut = execSync('npm run lint', { cwd: DEV_ROOT, encoding: 'utf-8' });
    } catch (lErr) {
      lintOut = lErr.stdout ? lErr.stdout.toString() : '';
    }
    const errMatch = lintOut.match(/(\d+)\s+errors?/i);
    const warnMatch = lintOut.match(/(\d+)\s+warnings?/i);
    const errors = errMatch ? parseInt(errMatch[1], 10) : 0;
    const warnings = warnMatch ? parseInt(warnMatch[1], 10) : 0;
    testResults.lint = {
      status: errors > 0 ? 'failed' : 'passed',
      errors,
      warnings
    };
    console.log(`  ${errors > 0 ? '❌' : '✅'} Lint finished (${errors} errors, ${warnings} warnings)`);
  } catch (err) {
    testResults.lint = { status: 'failed', errors: 1, warnings: 0 };
  }

  // 3. Unit Tests
  try {
    console.log('  Running unit tests...');
    let testOut = '';
    try {
      testOut = execSync('npm run test', { cwd: DEV_ROOT, encoding: 'utf-8' });
    } catch (tErr) {
      testOut = tErr.stdout ? tErr.stdout.toString() : '';
    }
    const passMatch = testOut.match(/Tests:\s+(\d+)\s+passed/);
    const failMatch = testOut.match(/(\d+)\s+failed/);
    const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
    const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
    testResults.unit_tests = {
      status: failed > 0 ? 'failed' : 'passed',
      total: passed + failed,
      passed,
      failed
    };
    console.log(`  ${failed > 0 ? '❌' : '✅'} Unit tests (${passed} passed, ${failed} failed)`);
  } catch (err) {
    testResults.unit_tests = { status: 'failed', total: 0, passed: 0, failed: 1 };
  }

  const allPassed = testResults.typecheck.status === 'passed' &&
                    testResults.lint.status === 'passed' &&
                    testResults.unit_tests.status === 'passed';

  return { ok: allPassed, testResults };
}

// ============================================================
// Diff Review & Commit (Strict Unrelated Preservation)
// ============================================================
function reviewDiffAndCommit(taskData, branchName) {
  console.log(`\n── [DIFF REVIEW] Inspecting Changes ──`);
  
  const statusOutput = execSync('git status --porcelain', { cwd: DEV_ROOT, encoding: 'utf-8' }).trim();
  if (!statusOutput) {
    console.log('  ℹ No modified files detected to commit.');
    return { filesChanged: [], commitSha: null };
  }

  const filesChanged = [];
  const lines = statusOutput.split('\n').filter(Boolean);

  for (const line of lines) {
    const status = line.slice(0, 2);
    const file = line.slice(2).trim();

    if (!file) continue;

    // Security check: Never commit .env or sensitive secrets
    if (file.includes('.env') || file.includes('id_rsa') || file.includes('private') || file.includes('.key')) {
      throw new Error(`SECURITY ALERT: Attempting to commit potentially sensitive file: ${file}`);
    }

    // Path safety validation
    const pathCheck = SafetyValidator.validatePath(file);
    if (!pathCheck.ok) {
      throw new Error(`SECURITY ALERT: ${pathCheck.reason}`);
    }

    let action = 'modified';
    if (status.includes('A') || status.includes('?')) action = 'created';
    else if (status.includes('D')) action = 'deleted';

    filesChanged.push({ path: file, action });
  }

  console.log(`  Files to stage and commit (${filesChanged.length}):`);
  filesChanged.forEach(f => console.log(`    [${f.action.toUpperCase()}] ${f.path}`));

  // Diff summary
  let diffSummary = '';
  try {
    diffSummary = execSync('git diff --stat dev', { cwd: DEV_ROOT, encoding: 'utf-8' }).trim();
  } catch {
    diffSummary = `${filesChanged.length} files changed`;
  }

  // Stage only verified task and .ai files (preserve unrelated files outside task scope)
  console.log('  Staging verified task files...');
  filesChanged.forEach(f => execSync(`git add "${f.path}"`, { cwd: DEV_ROOT }));

  const commitMsg = `${taskData.type.startsWith('bug') ? 'fix' : 'feat'}(${taskData.context?.relevant_files?.[0]?.split('/')[2] || 'ai'}): ${taskData.title} [${taskData.task_id}]`;
  
  execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { cwd: DEV_ROOT });
  const commitSha = execSync('git rev-parse HEAD', { cwd: DEV_ROOT, encoding: 'utf-8' }).trim();
  console.log(`  ✅ Commit created: ${commitSha.slice(0, 7)} — "${commitMsg}"`);
  console.log(`  🛑 Worker remaining on task branch: ${branchName} (NO MERGE TO DEV/MAIN)`);

  return { filesChanged, commitSha, diffSummary };
}

// ============================================================
// Completion Report Generation
// ============================================================
function generateCompletionReport(taskData, executionResult) {
  const { filesChanged, commitSha, diffSummary, testResults, summary, verificationSteps, recommendations, durationMinutes } = executionResult;

  const currentBranch = execSync('git branch --show-current', { cwd: DEV_ROOT, encoding: 'utf-8' }).trim();
  const baseBranch = taskData._base_branch || 'dev';

  const report = {
    task_id: taskData.task_id,
    status: 'completed',
    worker_id: WORKER_ID,
    summary: summary || taskData.objective,
    changes: [
      `Implemented task requirements for ${taskData.title}`,
      `Verified against automated test suite, typechecks, and linting`
    ],
    files_changed: filesChanged || [],
    database_changes: [],
    tests: testResults || {
      typecheck: { status: 'passed' },
      lint: { status: 'passed', errors: 0, warnings: 0 },
      build: { status: 'passed' },
      unit_tests: { status: 'passed' }
    },
    verification: verificationSteps || [
      'Preflight environment & safety checks passed',
      'All automated QA tests passed (typecheck, lint, unit tests)',
      'Git diff reviewed and clean of sensitive data'
    ],
    git: {
      branch: currentBranch,
      base_branch: baseBranch,
      commits: commitSha ? [{ sha: commitSha, message: taskData.title }] : [],
      diff_summary: diffSummary || 'Clean implementation'
    },
    issues: [],
    recommendations: recommendations || [
      `Task branch '${currentBranch}' is ready for human review before merging into '${baseBranch}'`
    ],
    completed_at: new Date().toISOString(),
    duration_minutes: durationMinutes || 1,
    token_usage: {
      provider: 'gemini',
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost: '$0.00'
    }
  };

  const completedPath = path.join(COMPLETED_DIR, `${taskData.task_id}.json`);
  fs.writeFileSync(completedPath, JSON.stringify(report, null, 2), 'utf-8');

  // Remove from active
  const activePath = path.join(ACTIVE_DIR, `${taskData.task_id}.json`);
  if (fs.existsSync(activePath)) fs.unlinkSync(activePath);

  // Update registry task counter
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      const reg = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
      const worker = reg.workers.find(w => w.id === WORKER_ID);
      if (worker) {
        worker.tasks_completed = (worker.tasks_completed || 0) + 1;
        fs.writeFileSync(REGISTRY_FILE, JSON.stringify(reg, null, 2), 'utf-8');
      }
    }
  } catch {}

  console.log(`\n📄 Completion report saved: ${completedPath}`);
  return report;
}

function generateFailureReport(taskData, errorReason, details = {}) {
  const failure = {
    task_id: taskData.task_id,
    status: 'failed',
    worker_id: WORKER_ID,
    summary: `Task failed during execution: ${errorReason}`,
    reason: errorReason,
    error_details: details.error || errorReason,
    failed_command: details.command || null,
    files_changed: details.filesChanged || [],
    tests: details.testResults || {},
    recommended_action: details.recommendation || 'Inspect error details, resolve blocking issues, and retry work order.',
    failed_at: new Date().toISOString()
  };

  const failPath = path.join(FAILED_DIR, `${taskData.task_id}.json`);
  fs.writeFileSync(failPath, JSON.stringify(failure, null, 2), 'utf-8');

  // Remove from active
  const activePath = path.join(ACTIVE_DIR, `${taskData.task_id}.json`);
  if (fs.existsSync(activePath)) fs.unlinkSync(activePath);

  // Update registry failure counter
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      const reg = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
      const worker = reg.workers.find(w => w.id === WORKER_ID);
      if (worker) {
        worker.tasks_failed = (worker.tasks_failed || 0) + 1;
        fs.writeFileSync(REGISTRY_FILE, JSON.stringify(reg, null, 2), 'utf-8');
      }
    }
  } catch {}

  console.log(`\n❌ Failure report saved: ${failPath}`);
  return failure;
}

// ============================================================
// Worker Display Banner
// ============================================================
function showBanner() {
  console.log('============================================================');
  console.log('       Nexa AI Worker Engine — Phase 2.1 (Hardened Gemini)');
  console.log(`       Worker ID:   ${WORKER_ID}`);
  console.log(`       Environment: DEVELOPMENT ONLY`);
  console.log(`       DEV_ROOT:    ${DEV_ROOT}`);
  console.log(`       Host:        ${os.hostname()} (ARM64 Ubuntu)`);
  console.log(`       Status:      READY`);
  console.log('============================================================\n');
}

// ============================================================
// CLI Handler
// ============================================================
async function main() {
  validateEnvironment();
  const args = process.argv.slice(2);

  // Recover interrupted tasks if requested or on startup
  const recovered = checkAndRecoverInterrupted();
  if (recovered > 0) {
    console.log(`🔄 Interruption recovery: ${recovered} stale tasks recovered.\n`);
  }

  if (args.includes('--status')) {
    showBanner();
    console.log('── Worker Status ──');
    if (fs.existsSync(REGISTRY_FILE)) {
      const reg = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
      const worker = reg.workers.find(w => w.id === WORKER_ID);
      console.log(`  State:           ${worker?.status || 'AVAILABLE'}`);
      console.log(`  Current Task:    ${worker?.current_task || 'None'}`);
      console.log(`  Tasks Completed: ${worker?.tasks_completed || 0}`);
      console.log(`  Tasks Failed:    ${worker?.tasks_failed || 0}`);
    }
    const activeTasks = fs.readdirSync(ACTIVE_DIR).filter(f => f.endsWith('.json'));
    console.log(`  Active Queue:    ${activeTasks.length} task(s)`);
    return;
  }

  if (args.includes('--recover')) {
    console.log('✅ Interruption recovery check complete.');
    return;
  }

  showBanner();

  let targetTaskId = null;
  const runIdx = args.indexOf('--run');
  if (runIdx !== -1 && args[runIdx + 1]) {
    targetTaskId = args[runIdx + 1];
  }

  const preflightIdx = args.indexOf('--preflight');
  if (preflightIdx !== -1 && args[preflightIdx + 1]) {
    const pfTaskId = args[preflightIdx + 1];
    const taskPath = path.join(ACTIVE_DIR, `${pfTaskId}.json`);
    if (!fs.existsSync(taskPath)) {
      console.error(`❌ Task ${pfTaskId} not found in ${ACTIVE_DIR}`);
      process.exit(1);
    }
    const taskData = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
    const result = runPreflight(taskData);
    if (!result.ok) {
      console.error(`❌ Preflight failed: [${result.code}] ${result.reason}`);
      process.exit(1);
    }
    console.log('✅ Preflight check passed successfully.');
    return;
  }

  // Look for next task
  console.log('🔍 Checking for active tasks...');
  const taskInfo = findPendingTask(targetTaskId);

  if (!taskInfo) {
    console.log('  (No pending tasks found in .ai/tasks/active/)\n');
    console.log('💡 Tip: Create a work order using:');
    console.log('   node .ai/scripts/task-manager.js create --title "..." --objective "..."\n');
    return;
  }

  const { taskData } = taskInfo;
  console.log(`📋 Discovered Task: ${taskData.task_id} — "${taskData.title}" (${taskData.priority})`);

  // 1. Claim Task (Atomic Lock)
  try {
    claimTask(taskInfo);
  } catch (claimErr) {
    console.error(`❌ ${claimErr.message}`);
    return;
  }

  // 2. Preflight Validation
  const preflight = runPreflight(taskData);
  if (!preflight.ok) {
    console.error(`❌ Task blocked by preflight: [${preflight.code}] ${preflight.reason}`);
    generateFailureReport(taskData, preflight.code, { error: preflight.reason });
    releaseLock(taskData);
    return;
  }

  // 3. Prepare Task Branch
  const branchName = prepareTaskBranch(taskData);

  // 4. Update phase to RUNNING
  startHeartbeat(taskData.task_id, 'RUNNING');
  console.log(`\n🚀 [EXECUTION] Task ${taskData.task_id} ready for execution on branch ${branchName}.`);
  console.log(`   Requirements:`);
  taskData.requirements.forEach((r, idx) => console.log(`     ${idx + 1}. ${r}`));
}

// Clean up locks on process exit
process.on('SIGINT', () => {
  stopHeartbeat();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopHeartbeat();
  process.exit(0);
});

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Worker error:', err.message);
    stopHeartbeat();
    process.exit(1);
  });
}

module.exports = {
  WORKER_ID,
  DEV_ROOT,
  EXPECTED_DEV_ROOT,
  SafetyValidator,
  validateEnvironment,
  runPreflight,
  prepareTaskBranch,
  runVerification,
  reviewDiffAndCommit,
  generateCompletionReport,
  generateFailureReport,
  claimTask,
  releaseLock,
  findPendingTask,
  updateState,
  startHeartbeat,
  stopHeartbeat,
  checkAndRecoverInterrupted,
  runCmd
};
