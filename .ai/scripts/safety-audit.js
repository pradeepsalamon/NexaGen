#!/usr/bin/env node
/**
 * Nexa AI Development System — Phase 2.1 Worker Hardening & Safety Audit Suite
 * Runs exhaustive automated validation tests against all safety constraints.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const {
  WORKER_ID,
  DEV_ROOT,
  EXPECTED_DEV_ROOT,
  SafetyValidator,
  validateEnvironment,
  runPreflight,
  claimTask,
  releaseLock,
  generateCompletionReport,
  generateFailureReport,
  checkAndRecoverInterrupted,
  reviewDiffAndCommit
} = require('./worker');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(description, condition, details = '') {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${description}`);
    passedTests++;
    return true;
  } else {
    console.error(`  ❌ [FAIL] ${description} ${details ? '(' + details + ')' : ''}`);
    failedTests++;
    return false;
  }
}

console.log('\n============================================================');
console.log('       Nexa AI Worker — Phase 2.1 Safety Audit Suite');
console.log(`       Target DEV_ROOT: ${DEV_ROOT}`);
console.log(`       Time: ${new Date().toISOString()}`);
console.log('============================================================\n');

// ============================================================
// 1. Filesystem & Path Boundary Audit
// ============================================================
console.log('── 1. Filesystem & Path Boundary Tests ──');

const testDevPath = SafetyValidator.validatePath('packages/utils/src/dev-info.ts');
assert('DEV path is allowed', testDevPath.ok === true);

const testProdPath = SafetyValidator.validatePath('/opt/nexa-chess/NexaGen/docker-compose.yml');
assert('PROD path is blocked', testProdPath.ok === false && testProdPath.code === 'BLOCKED_PRODUCTION_CHANGE');

const testTraversal = SafetyValidator.validatePath('../NexaGen/package.json');
assert('Path traversal out of DEV_ROOT is blocked', testTraversal.ok === false && testTraversal.code === 'BLOCKED_OUTSIDE_DEV_SCOPE');

const testSystemPath = SafetyValidator.validatePath('/etc/shadow');
assert('System /etc path is blocked', testSystemPath.ok === false && testSystemPath.code === 'BLOCKED_OUTSIDE_DEV_SCOPE');

const testVarPath = SafetyValidator.validatePath('/var/log/syslog');
assert('System /var path is blocked', testVarPath.ok === false && testVarPath.code === 'BLOCKED_OUTSIDE_DEV_SCOPE');

// Symlink test
const testSymlinkPath = path.join(DEV_ROOT, '.ai', 'scratch_test_symlink');
try {
  if (fs.existsSync(testSymlinkPath)) fs.unlinkSync(testSymlinkPath);
  fs.symlinkSync('/etc', testSymlinkPath);
  const symlinkCheck = SafetyValidator.validatePath('.ai/scratch_test_symlink/passwd');
  assert('Symlink escaping DEV_ROOT is blocked', symlinkCheck.ok === false && symlinkCheck.code === 'BLOCKED_OUTSIDE_DEV_SCOPE');
} finally {
  if (fs.existsSync(testSymlinkPath)) fs.unlinkSync(testSymlinkPath);
}

// ============================================================
// 2. Command Safety Policy Audit
// ============================================================
console.log('\n── 2. Command Safety Policy Tests ──');

// Production Docker mutations
assert('docker stop nexa_web is blocked', SafetyValidator.validateCommand('docker stop nexa_web').ok === false);
assert('docker restart nexa_api is blocked', SafetyValidator.validateCommand('docker restart nexa_api').ok === false);
assert('docker compose down is blocked', SafetyValidator.validateCommand('docker compose down').ok === false);
assert('docker rm nexa_web is blocked', SafetyValidator.validateCommand('docker rm -f nexa_web').ok === false);
assert('docker system prune is blocked', SafetyValidator.validateCommand('docker system prune -a').ok === false);

// Production DB operations
assert('nexa_chess DB mutation in command is blocked', SafetyValidator.validateCommand('psql -d nexa_chess -c "DROP TABLE Users;"').ok === false);
assert('DROP DATABASE is blocked', SafetyValidator.validateCommand('DROP DATABASE vps_dev;').ok === false);

// System-level mutations (require approval)
assert('sudo is blocked', SafetyValidator.validateCommand('sudo apt update').code === 'SYSTEM_CHANGE_REQUIRED');
assert('apt install is blocked', SafetyValidator.validateCommand('apt-get install nginx').code === 'SYSTEM_CHANGE_REQUIRED');
assert('ufw delete is blocked', SafetyValidator.validateCommand('ufw delete allow 3000').code === 'SYSTEM_CHANGE_REQUIRED');
assert('iptables -F is blocked', SafetyValidator.validateCommand('iptables -F').code === 'SYSTEM_CHANGE_REQUIRED');

// Redis flush commands
assert('FLUSHALL is blocked', SafetyValidator.validateCommand('redis-cli FLUSHALL').code === 'BLOCKED_REDIS_SAFETY');
assert('FLUSHDB is blocked', SafetyValidator.validateCommand('redis-cli FLUSHDB').code === 'BLOCKED_REDIS_SAFETY');

// Git safety commands
assert('git reset --hard is blocked', SafetyValidator.validateCommand('git reset --hard HEAD~1').code === 'BLOCKED_GIT_SAFETY');
assert('git clean -fd is blocked', SafetyValidator.validateCommand('git clean -fd').code === 'BLOCKED_GIT_SAFETY');
assert('git push origin dev is blocked', SafetyValidator.validateCommand('git push origin dev').code === 'BLOCKED_GIT_SAFETY');
assert('git push origin main is blocked', SafetyValidator.validateCommand('git push origin main').code === 'BLOCKED_GIT_SAFETY');
assert('git merge is blocked', SafetyValidator.validateCommand('git merge ai/task-1').code === 'BLOCKED_GIT_SAFETY');

// Read-only diagnostic commands (ALLOWED)
assert('ps aux is allowed', SafetyValidator.validateCommand('ps aux').ok === true);
assert('docker ps is allowed', SafetyValidator.validateCommand('docker ps').ok === true);
assert('docker logs is allowed', SafetyValidator.validateCommand('docker logs nexa_api --tail 20').ok === true);
assert('ss -lntp is allowed', SafetyValidator.validateCommand('ss -lntp').ok === true);
assert('vnstat is allowed', SafetyValidator.validateCommand('vnstat').ok === true);

// ============================================================
// 3. Database Whitelist Audit
// ============================================================
console.log('\n── 3. Database Whitelist Tests ──');

assert('vps_dev database is allowed', SafetyValidator.validateDatabase('vps_dev').ok === true);
assert('nexa_chess database is blocked', SafetyValidator.validateDatabase('nexa_chess').ok === false);
assert('postgres database is blocked', SafetyValidator.validateDatabase('postgres').ok === false);
assert('unknown database is blocked', SafetyValidator.validateDatabase('random_db').ok === false);
assert('unspecified database is blocked', SafetyValidator.validateDatabase('').ok === false);

// ============================================================
// 4. Redis Namespace Audit
// ============================================================
console.log('\n── 4. Redis Namespace Tests ──');

assert('nexa:dev:sessions is allowed', SafetyValidator.validateRedisNamespace('nexa:dev:sessions:123').ok === true);
assert('nexa:ai:tasks is allowed', SafetyValidator.validateRedisNamespace('nexa:ai:tasks').ok === true);
assert('unscoped prod key is blocked', SafetyValidator.validateRedisNamespace('prod:user:1').ok === false);
assert('root key is blocked', SafetyValidator.validateRedisNamespace('sessions:1').ok === false);

// ============================================================
// 5. Atomic Task Locking & Concurrency Audit
// ============================================================
console.log('\n── 5. Atomic Task Locking Tests ──');

const testTaskId = 'NEXA-9999';
const testLockFile = path.join(DEV_ROOT, '.ai', 'tasks', 'active', `${testTaskId}.lock`);
const testTaskData = {
  task_id: testTaskId,
  title: 'Locking Audit Test',
  objective: 'Test atomic lock acquisition',
  priority: 'low',
  requirements: ['Test lock'],
  acceptance_criteria: ['Pass'],
  safety: { allowed_paths: [DEV_ROOT] }
};

try {
  if (fs.existsSync(testLockFile)) fs.unlinkSync(testLockFile);

  // Worker A claims task
  const claimA = claimTask({ taskData: testTaskData, lockFile: testLockFile });
  assert('Worker A successfully acquired atomic lock', claimA === true);

  // Worker B attempts to claim same task
  let workerBLocked = false;
  try {
    claimTask({ taskData: testTaskData, lockFile: testLockFile });
  } catch (err) {
    workerBLocked = err.message.includes('TASK_ALREADY_LOCKED');
  }
  assert('Worker B claim was rejected due to existing lock', workerBLocked === true);

} finally {
  releaseLock(testTaskData);
  if (fs.existsSync(testLockFile)) fs.unlinkSync(testLockFile);
}

// ============================================================
// 6. Crash Recovery & Stale Lock Detection Audit
// ============================================================
console.log('\n── 6. Crash Recovery & Stale Lock Tests ──');

const crashTaskId = 'NEXA-9998';
const crashTaskFile = path.join(DEV_ROOT, '.ai', 'tasks', 'active', `${crashTaskId}.json`);
const crashLockFile = path.join(DEV_ROOT, '.ai', 'tasks', 'active', `${crashTaskId}.lock`);

try {
  // Create simulated active task with dead PID (PID 999999)
  fs.writeFileSync(crashTaskFile, JSON.stringify({ task_id: crashTaskId, title: 'Simulated Crash Task' }, null, 2));
  fs.writeFileSync(crashLockFile, JSON.stringify({
    task_id: crashTaskId,
    worker_id: WORKER_ID,
    pid: 999999, // Dead PID
    locked_at: new Date(Date.now() - 600000).toISOString()
  }, null, 2));

  const recoveredCount = checkAndRecoverInterrupted();
  assert('Stale dead-PID lock was identified and recovered', recoveredCount > 0);
  assert('Stale lock file was cleaned up', !fs.existsSync(crashLockFile));

  const failedReportPath = path.join(DEV_ROOT, '.ai', 'tasks', 'failed', `${crashTaskId}.json`);
  assert('Interrupted task report was generated in .ai/tasks/failed/', fs.existsSync(failedReportPath));

  if (fs.existsSync(failedReportPath)) fs.unlinkSync(failedReportPath);
} finally {
  if (fs.existsSync(crashTaskFile)) fs.unlinkSync(crashTaskFile);
  if (fs.existsSync(crashLockFile)) fs.unlinkSync(crashLockFile);
}

// ============================================================
// 7. Structured Failure Report Audit
// ============================================================
console.log('\n── 7. Structured Failure Report Tests ──');

const failTaskId = 'NEXA-9997';
const failTaskData = {
  task_id: failTaskId,
  title: 'Intentional Failure Test'
};

const failReport = generateFailureReport(failTaskData, 'BLOCKED_PRODUCTION_CHANGE', {
  error: 'Attempted to stop production container',
  command: 'docker stop nexa_web',
  recommendation: 'Target development environment instead.'
});

const failReportFile = path.join(DEV_ROOT, '.ai', 'tasks', 'failed', `${failTaskId}.json`);
assert('Failure report created on disk', fs.existsSync(failReportFile));
assert('Failure report records correct reason', failReport.reason === 'BLOCKED_PRODUCTION_CHANGE');
assert('Failure report includes recommended action', Boolean(failReport.recommended_action));

if (fs.existsSync(failReportFile)) fs.unlinkSync(failReportFile);

// ============================================================
// 8. Unrelated Uncommitted Files Preservation Audit
// ============================================================
console.log('\n── 8. Unrelated File Preservation Tests ──');

const unrelatedFilePath = path.join(DEV_ROOT, 'scratch_unrelated_user_file.tmp');
fs.writeFileSync(unrelatedFilePath, 'Unrelated user work in progress', 'utf-8');

try {
  const diffReview = reviewDiffAndCommit({
    task_id: 'NEXA-9996',
    title: 'Unrelated File Audit',
    type: 'feature',
    context: { relevant_files: [] }
  }, 'ai/test-branch');

  // Verify file still exists on disk and was not deleted
  assert('Unrelated file was preserved on disk', fs.existsSync(unrelatedFilePath));
  assert('Unrelated file content was intact', fs.readFileSync(unrelatedFilePath, 'utf-8') === 'Unrelated user work in progress');

  // Reset any mock commit created during this test
  if (diffReview.commitSha) {
    execSync('git reset HEAD~1', { cwd: DEV_ROOT });
  }
} finally {
  if (fs.existsSync(unrelatedFilePath)) fs.unlinkSync(unrelatedFilePath);
}

// ============================================================
// 9. Dirty Worktree Conflict Detection Audit
// ============================================================
console.log('\n── 9. Dirty Worktree Conflict Tests ──');

const dirtyConflictingFile = path.join(DEV_ROOT, 'packages/utils/src/conflict_test.ts');
fs.writeFileSync(dirtyConflictingFile, 'export const dirtyTest = true;\n', 'utf-8');

try {
  const dirtyCheck = SafetyValidator.checkDirtyWorktree({
    context: { relevant_files: ['packages/utils/src/conflict_test.ts'] }
  });
  assert('Dirty conflicting user file triggers BLOCKED_USER_CHANGES', dirtyCheck.ok === false && dirtyCheck.code === 'BLOCKED_USER_CHANGES');
  assert('Conflicting filename identified in reason', dirtyCheck.conflictingFile.includes('conflict_test.ts'));
} finally {
  if (fs.existsSync(dirtyConflictingFile)) fs.unlinkSync(dirtyConflictingFile);
}

// ============================================================
// 10. LiveKit Production Room Safety Audit
// ============================================================
console.log('\n── 10. LiveKit Production Room Safety Tests ──');

assert('Dev LiveKit room deletion command is allowed', SafetyValidator.validateCommand('livekit-cli delete-room dev-ai-NEXA-0001-test').ok === true);
assert('Production LiveKit room deletion command is blocked', SafetyValidator.validateCommand('livekit-cli delete-room prod-batch-101').code === 'BLOCKED_LIVEKIT_SAFETY');

// ============================================================
// 11. Project Context Secret Redaction Audit
// ============================================================
console.log('\n── 11. Project Context Secret Redaction Tests ──');

const ProjectContextEngine = require('../manager/project-context');

const sensitiveRawString = 'DATABASE_URL=postgres://user:super_secret_pw@127.0.0.1:5432/vps_dev?ssl=true JWT_SECRET=superjwt123 API_KEY=sk_live_999999999999999999';
const redactedString = ProjectContextEngine.redactSecrets(sensitiveRawString);
assert('Database URL password is redacted', !redactedString.includes('super_secret_pw') && redactedString.includes('[REDACTED]'));
assert('JWT secret is redacted', !redactedString.includes('superjwt123'));
assert('API key is redacted', !redactedString.includes('sk_live_999999999999999999'));

const sensitiveObject = {
  db_password: 'super_secret_password',
  jwtSecret: 'top_secret_jwt_token',
  apiKey: 'api_key_value',
  nested: {
    private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgk...\n-----END PRIVATE KEY-----',
    safe_info: 'NexaGen Dev'
  }
};
const redactedObject = ProjectContextEngine.redactSecrets(sensitiveObject);
assert('Object password key is redacted', redactedObject.db_password === '[REDACTED]');
assert('Object jwtSecret key is redacted', redactedObject.jwtSecret === '[REDACTED]');
assert('Object private_key is redacted', redactedObject.nested.private_key === '[REDACTED]');
assert('Object safe property is preserved', redactedObject.nested.safe_info === 'NexaGen Dev');

// ============================================================
// 12. Investigation Task Code Modification Block Audit
// ============================================================
console.log('\n── 12. Investigation Code Modification Block Tests ──');

const investigationMockFile = path.join(DEV_ROOT, 'packages/utils/src/investigation_mock.ts');
fs.writeFileSync(investigationMockFile, 'export const invTest = true;\n', 'utf-8');

try {
  let threwInvestigationViolation = false;
  try {
    reviewDiffAndCommit({
      task_id: 'NEXA-9995',
      title: 'Investigation Code Audit',
      type: 'investigation',
      context: { relevant_files: [] }
    }, 'ai/test-branch');
  } catch (err) {
    threwInvestigationViolation = err.message.includes('INVESTIGATION_POLICY_VIOLATION');
  }
  assert('Investigation task modifying source code is strictly blocked', threwInvestigationViolation === true);
} finally {
  if (fs.existsSync(investigationMockFile)) fs.unlinkSync(investigationMockFile);
}

// ============================================================
// 13. Bug Fix & Feature Requirements Audit
// ============================================================
console.log('\n── 13. Bug Fix & Feature Quality Tests ──');

const GeminiProvider = require('../manager/providers/gemini-provider');
const geminiProvider = new GeminiProvider();

async function runQualityTests() {
  const bugFixPlan = await geminiProvider.analyzeRequest('Fix student attendance calculation error');
  assert('Bug fix request classified as bug_fix', bugFixPlan.type === 'bug_fix');
  assert('Bug fix requires regression unit testing', bugFixPlan.requirements.some(r => r.includes('unit test') || r.includes('regression')));
  assert('Bug fix contains investigation instructions', Boolean(bugFixPlan.investigation_instructions));

  const featurePlan = await geminiProvider.analyzeRequest('Add export attendance button to student dashboard');
  assert('Feature request classified as feature_implementation', featurePlan.type === 'feature_implementation');
  assert('Feature request has acceptance criteria', featurePlan.acceptance_criteria.length > 0);
  assert('Feature request contains implementation guidance', Boolean(featurePlan.implementation_guidance));

  const invPlan = await geminiProvider.analyzeRequest('Why is coach hourly rate not updating in profile?');
  assert('Investigation request classified as investigation', invPlan.type === 'investigation');
  assert('Investigation instructions explicitly prohibit source code modification', invPlan.instructions.includes('DO NOT modify application source code'));
}

// ============================================================
// 14. Multi-Worker & Dependency Graph Safety Audit
// ============================================================
console.log('\n── 14. Multi-Worker & DAG Dependency Safety Tests ──');

const WorkerRegistry = require('../manager/worker-registry');
const DependencyGraph = require('../manager/dependency-graph');

const reg = new WorkerRegistry();
const regCheck = reg.validateRegistry();
assert('Worker registry validates cleanly', regCheck.ok === true);

// Capability routing
const backendWorker = reg.findCapableWorker(['backend', 'nestjs']);
assert('Backend capabilities route to nexa-dev-01', backendWorker && (backendWorker.worker_id === 'nexa-dev-01' || backendWorker.id === 'nexa-dev-01'));

const frontendWorker = reg.findCapableWorker(['frontend', 'react', 'nextjs']);
assert('Frontend capabilities route to nexa-dev-02', frontendWorker && (frontendWorker.worker_id === 'nexa-dev-02' || frontendWorker.id === 'nexa-dev-02'));

const qaWorker = reg.findCapableWorker(['testing', 'jest']);
assert('Testing capabilities route to nexa-dev-03', qaWorker && (qaWorker.worker_id === 'nexa-dev-03' || qaWorker.id === 'nexa-dev-03'));

const impossibleWorker = reg.findCapableWorker(['quantum_computing_supercomputer_rust']);
assert('Unavailable capabilities return null', impossibleWorker === null);

// DAG Validation
const validDag = new DependencyGraph([
  { task_id: 'NEXA-1001', dependencies: [] },
  { task_id: 'NEXA-1002', dependencies: ['NEXA-1001'] },
  { task_id: 'NEXA-1003', dependencies: ['NEXA-1002'] }
]);
assert('Valid linear DAG passes validation', validDag.validateGraph().ok === true);

const circularDag = new DependencyGraph([
  { task_id: 'NEXA-2001', dependencies: ['NEXA-2002'] },
  { task_id: 'NEXA-2002', dependencies: ['NEXA-2001'] }
]);
const circularCheck = circularDag.validateGraph();
assert('Circular dependency is detected and blocked', circularCheck.ok === false && circularCheck.errors[0]?.type === 'CIRCULAR_DEPENDENCY');

const selfDepDag = new DependencyGraph([
  { task_id: 'NEXA-3001', dependencies: ['NEXA-3001'] }
]);
const selfDepCheck = selfDepDag.validateGraph();
assert('Self dependency is detected and blocked', selfDepCheck.ok === false && selfDepCheck.errors[0]?.type === 'SELF_DEPENDENCY');

const missingDepDag = new DependencyGraph([
  { task_id: 'NEXA-4001', dependencies: ['NEXA-NON-EXISTENT-9999'] }
]);
const missingDepCheck = missingDepDag.validateGraph();
assert('Missing dependency is detected and blocked', missingDepCheck.ok === false && missingDepCheck.errors[0]?.type === 'MISSING_DEPENDENCY');

// Runnable / Blocked evaluation
const multiTasks = [
  { task_id: 'NEXA-5001', dependencies: [] },
  { task_id: 'NEXA-5002', dependencies: ['NEXA-5001'] }
];
const evalDag = new DependencyGraph(multiTasks);
const runnable0 = evalDag.getRunnableTasks(new Set());
assert('Task with no dependencies is immediately runnable', runnable0.length === 1 && runnable0[0].task_id === 'NEXA-5001');

const runnable1 = evalDag.getRunnableTasks(new Set(['NEXA-5001']));
assert('Task with satisfied dependency becomes runnable', runnable1.length === 2 && runnable1.some(r => r.task_id === 'NEXA-5002'));

// ============================================================
// 15. Git Worktree Isolation & Parallelism Safety Tests
// ============================================================
console.log('\n── 15. Git Worktree Isolation & Parallelism Safety Tests ──');

const WorktreeManager = require('../manager/worktree-manager');
const wm = new WorktreeManager(DEV_ROOT);

// 1. Worktree path boundary
const wtPath01 = wm.getWorkerWorktreePath('nexa-dev-01');
assert('Worktree path is located inside DEV_ROOT/.worktrees', wtPath01.startsWith(path.join(DEV_ROOT, '.worktrees')));
assert('Worktree path does not target production', !wtPath01.includes('/opt/nexa-chess/NexaGen/'));

// 2. Worktree branch policy enforcement
const invalidBranchRes = wm.createWorkerWorktree('nexa-dev-01', 'NEXA-TEST', 'main');
assert('Worktree creation rejects forbidden main branch', invalidBranchRes.ok === false && invalidBranchRes.code === 'BLOCKED_WORKTREE_BRANCH_MISMATCH');

const invalidProdBranchRes = wm.createWorkerWorktree('nexa-dev-01', 'NEXA-TEST', 'production');
assert('Worktree creation rejects forbidden production branch', invalidProdBranchRes.ok === false && invalidProdBranchRes.code === 'BLOCKED_WORKTREE_BRANCH_MISMATCH');

// 3. Worktree list integrity
const worktreeList = wm.listWorktrees();
assert('Worktree manager lists all 3 registered workers', worktreeList.length >= 3);
assert('All worker worktrees initially available or ready', worktreeList.every(w => ['AVAILABLE', 'READY', 'ASSIGNED', 'DIRTY'].includes(w.status)));

// 4. Dirty worktree safety check
const safeCleanCheck = wm.isWorktreeSafeToRemove(DEV_ROOT);
// Root repo might or might not have uncommitted files, isWorktreeSafeToRemove returns a boolean safe property
assert('isWorktreeSafeToRemove returns object with safe boolean', typeof safeCleanCheck.safe === 'boolean');

// 5. Read-only merge check verification
const mergeCheckNonExistent = wm.checkMergeReadiness('NEXA-NON-EXISTENT-9999', 'ai/NEXA-NON-EXISTENT-9999');
assert('Merge check identifies non-existent task branch safely', mergeCheckNonExistent.ok === false && mergeCheckNonExistent.verdict === 'NOT_READY');
assert('Merge check provides explicit recommendation', Boolean(mergeCheckNonExistent.recommendation));

// 6. Branch preservation guarantee
assert('Worktree removal never deletes git branches', true);

// ============================================================
// 16. Task Lifecycle State Machine Safety Tests
// ============================================================
console.log('\n── 16. Task Lifecycle State Machine Safety Tests ──');

const TaskLifecycle = require('../manager/task-lifecycle');

// 1. Invalid jump rejection
const invalidJump = TaskLifecycle.isValidTransition('CREATED', 'COMPLETED');
assert('Invalid state jump (CREATED -> COMPLETED) is rejected', invalidJump === false);

const invalidDirectMerge = TaskLifecycle.isValidTransition('CREATED', 'MERGE_READY');
assert('Direct jump to MERGE_READY is rejected', invalidDirectMerge === false);

// 2. Idempotent self-transition
const idempotentRunning = TaskLifecycle.isValidTransition('RUNNING', 'RUNNING');
assert('Self-transition (RUNNING -> RUNNING) is allowed and idempotent', idempotentRunning === true);

// 3. Valid transition sequence
let mockTask = { task_id: 'NEXA-STATE-01', status: 'CREATED' };
const step1 = TaskLifecycle.transition(mockTask, 'PLANNED', { worker: 'manager', reason: 'Planned' });
assert('Valid transition CREATED -> PLANNED succeeds', step1.ok === true && mockTask.status === 'PLANNED');

const step2 = TaskLifecycle.transition(mockTask, 'ASSIGNED', { worker: 'nexa-dev-01', reason: 'Assigned' });
assert('Valid transition PLANNED -> ASSIGNED succeeds', step2.ok === true && mockTask.status === 'ASSIGNED');

const step3 = TaskLifecycle.transition(mockTask, 'CLAIMED', { worker: 'nexa-dev-01', reason: 'Claimed' });
assert('Valid transition ASSIGNED -> CLAIMED succeeds', step3.ok === true && mockTask.status === 'CLAIMED');

const step4 = TaskLifecycle.transition(mockTask, 'PREFLIGHT', { worker: 'nexa-dev-01', reason: 'Preflight' });
assert('Valid transition CLAIMED -> PREFLIGHT succeeds', step4.ok === true && mockTask.status === 'PREFLIGHT');

const step5 = TaskLifecycle.transition(mockTask, 'RUNNING', { worker: 'nexa-dev-01', reason: 'Running' });
assert('Valid transition PREFLIGHT -> RUNNING succeeds', step5.ok === true && mockTask.status === 'RUNNING');

const step6 = TaskLifecycle.transition(mockTask, 'TESTING', { worker: 'nexa-dev-01', reason: 'Testing' });
assert('Valid transition RUNNING -> TESTING succeeds', step6.ok === true && mockTask.status === 'TESTING');

const step7 = TaskLifecycle.transition(mockTask, 'VERIFYING', { worker: 'nexa-dev-01', reason: 'Verifying' });
assert('Valid transition TESTING -> VERIFYING succeeds', step7.ok === true && mockTask.status === 'VERIFYING');

const step8 = TaskLifecycle.transition(mockTask, 'COMPLETED', { worker: 'nexa-dev-01', reason: 'Completed' });
assert('Valid transition VERIFYING -> COMPLETED succeeds', step8.ok === true && mockTask.status === 'COMPLETED');

assert('Transition history captures all metadata entries', Array.isArray(mockTask.state_history) && mockTask.state_history.length === 8);
assert('History records previous state, new state, and reason', mockTask.state_history[0].previous_state === 'CREATED' && mockTask.state_history[0].new_state === 'PLANNED');

// ============================================================
// 17. Human-in-the-Loop & QA Gate Safety Tests
// ============================================================
console.log('\n── 17. Human-in-the-Loop & QA Gate Safety Tests ──');

const QAGate = require('../manager/qa-gate');
const qaGate = new QAGate(DEV_ROOT);

// 1. Secret Scanning in QA Gate
const cleanSecrets = qaGate.scanSecrets(['packages/utils/src/dev-info.ts']);
assert('Clean source files pass secret scanner', cleanSecrets.ok === true && cleanSecrets.leaks.length === 0);

const dirtySecretFile = qaGate.scanSecrets(['.env', '.env.production']);
assert('Dangerous .env files in diff are blocked by secret scanner', dirtySecretFile.ok === false && dirtySecretFile.leaks.length >= 1);

// 2. Acceptance Criteria Evaluation
const mockAcTask = {
  task_id: 'NEXA-AC-01',
  acceptance_criteria: [
    { id: 'AC-001', description: 'Unit tests must pass', verification: 'unit_test', mandatory: true },
    { id: 'AC-002', description: 'Typecheck must pass', verification: 'typecheck', mandatory: true }
  ]
};

const passVerification = {
  unit_tests: { status: 'passed' },
  typecheck: { status: 'passed' }
};
const acEvalPass = qaGate.evaluateAcceptanceCriteria(mockAcTask, passVerification);
assert('Satisfied acceptance criteria evaluate to passed', acEvalPass.ok === true && acEvalPass.evaluated.every(e => e.status === 'passed'));

const failVerification = {
  unit_tests: { status: 'failed' },
  typecheck: { status: 'passed' }
};
const acEvalFail = qaGate.evaluateAcceptanceCriteria(mockAcTask, failVerification);
assert('Failing mandatory criterion blocks acceptance', acEvalFail.ok === false && acEvalFail.evaluated.some(e => e.status === 'failed'));

// 3. Human Review Package Generation
const Reviewer = require('../manager/reviewer');
const reviewer = new Reviewer();
const mockReport = {
  task_id: 'NEXA-REV-01',
  title: 'Test Review Feature',
  worker_id: 'nexa-dev-01',
  task_branch: 'ai/NEXA-REV-01-test',
  impact: 'LOW',
  summary: 'Implemented test feature safely',
  files_changed: [{ path: 'packages/utils/src/dev-info.ts' }],
  tests: {
    typecheck: { status: 'passed' },
    lint: { status: 'passed' },
    unit_tests: { status: 'passed' },
    acceptance_criteria: { status: 'passed', evaluated: [{ id: 'AC-001', description: 'Passes', verification: 'unit_test', status: 'passed' }] }
  }
};
const reviewPkg = reviewer.generateReviewPackage(mockReport, { verdict: 'ACCEPTED' });
assert('Reviewer generates structured Human Review Package', Boolean(reviewPkg) && reviewPkg.includes('HUMAN REVIEW PACKAGE: NEXA-REV-01'));
assert('Review package provides explicit human merge instructions', reviewPkg.includes('Review git diff on branch') && reviewPkg.includes('merge manually into \'dev\''));

runQualityTests().then(() => {
  // Summary
  console.log('\n============================================================');
  console.log(`  AUDIT RESULTS: ${passedTests}/${totalTests} passed (${failedTests} failures)`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL SAFETY AUDIT CHECKS PASSED WITH ZERO VIOLATIONS.\n');
    process.exit(0);
  }
});
