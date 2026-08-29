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

  const failedReportPath = path.join(DEV_ROOT, '.ai', 'tasks', 'failed', `${crashTaskId}-interrupted.json`);
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
// Summary
// ============================================================
console.log('\n============================================================');
console.log(`  AUDIT RESULTS: ${passedTests}/${totalTests} passed (${failedTests} failures)`);
console.log('============================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL SAFETY AUDIT CHECKS PASSED WITH ZERO VIOLATIONS.\n');
  process.exit(0);
}
