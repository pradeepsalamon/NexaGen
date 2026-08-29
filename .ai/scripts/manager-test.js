#!/usr/bin/env node
/**
 * Nexa AI Development System — Phase 3 Manager Test Suite
 * Exhaustively tests all 15 Manager orchestration, planning, safety, and review scenarios.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const Planner = require('../manager/planner');
const Dispatcher = require('../manager/dispatcher');
const Reviewer = require('../manager/reviewer');
const GeminiProvider = require('../manager/providers/gemini-provider');

const DEV_ROOT = path.resolve(__dirname, '../..');
const AI_DIR = path.join(DEV_ROOT, '.ai');
const TASKS_DIR = path.join(AI_DIR, 'tasks');
const ACTIVE_DIR = path.join(TASKS_DIR, 'active');
const COMPLETED_DIR = path.join(TASKS_DIR, 'completed');
const FAILED_DIR = path.join(TASKS_DIR, 'failed');
const REGISTRY_FILE = path.join(AI_DIR, 'workers', 'registry.json');

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

async function runTests() {
  console.log('\n============================================================');
  console.log('       Nexa AI Main Manager — 15 Scenario Test Suite');
  console.log(`       Time: ${new Date().toISOString()}`);
  console.log('============================================================\n');

  const provider = new GeminiProvider();
  const planner = new Planner(provider);
  const dispatcher = new Dispatcher('nexa-dev-01');
  const reviewer = new Reviewer(provider);

  // ------------------------------------------------------------
  // 1. Simple Feature Request Planning
  // ------------------------------------------------------------
  console.log('── 1. Simple Feature Request ──');
  const plan1 = await planner.plan('Add student rating badge component to dashboard');
  assert('Simple feature plan succeeds', plan1.ok === true);
  assert('Work order generated with task ID', Boolean(plan1.workOrders?.[0]?.task_id));
  assert('Work order classified as feature_implementation', plan1.workOrders?.[0]?.type === 'feature_implementation');
  
  // Clean up created test work order
  if (plan1.workOrders?.[0]?.task_id) {
    const p1File = path.join(ACTIVE_DIR, `${plan1.workOrders[0].task_id}.json`);
    if (fs.existsSync(p1File)) fs.unlinkSync(p1File);
  }

  // ------------------------------------------------------------
  // 2. Bug Report Planning
  // ------------------------------------------------------------
  console.log('\n── 2. Bug Report ──');
  const plan2 = await planner.plan('Fix crash in live-class participant avatar rendering');
  assert('Bug fix plan succeeds', plan2.ok === true);
  assert('Work order classified as bug_fix', plan2.workOrders?.[0]?.type === 'bug_fix');
  assert('Priority elevated to high for bug fix', plan2.workOrders?.[0]?.priority === 'high');

  if (plan2.workOrders?.[0]?.task_id) {
    const p2File = path.join(ACTIVE_DIR, `${plan2.workOrders[0].task_id}.json`);
    if (fs.existsSync(p2File)) fs.unlinkSync(p2File);
  }

  // ------------------------------------------------------------
  // 3. Complex Multi-Step Task Decomposition
  // ------------------------------------------------------------
  console.log('\n── 3. Complex Multi-Step Request (Decomposition) ──');
  const multiPrompt = `Implement attendance export system:
1. Create attendance export DTO and service in backend
2. Add CSV generator utility function in packages/utils
3. Add export button in frontend attendance dashboard`;

  const plan3 = await planner.plan(multiPrompt);
  assert('Decomposition detected and executed', plan3.ok === true && plan3.workOrders?.length === 3);
  assert('Task 2 depends on Task 1', plan3.workOrders?.[1]?.dependencies?.[0] === plan3.workOrders?.[0]?.task_id);
  assert('Task 3 depends on Task 2', plan3.workOrders?.[2]?.dependencies?.[0] === plan3.workOrders?.[1]?.task_id);

  if (plan3.workOrders) {
    for (const wo of plan3.workOrders) {
      const f = path.join(ACTIVE_DIR, `${wo.task_id}.json`);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  }

  // ------------------------------------------------------------
  // 4. Malformed Request
  // ------------------------------------------------------------
  console.log('\n── 4. Malformed Request ──');
  const plan4 = await planner.plan('');
  assert('Empty prompt is rejected', plan4.ok === false && plan4.code === 'BLOCKED_INVALID_REQUEST');

  const plan4b = await planner.plan(null);
  assert('Null prompt is rejected', plan4b.ok === false);

  // ------------------------------------------------------------
  // 5. Worker Unavailable / Registry Check
  // ------------------------------------------------------------
  console.log('\n── 5. Worker Unavailable ──');
  const badDispatcher = new Dispatcher('non-existent-worker-99');
  const disp5 = badDispatcher.getWorkerStatus();
  assert('Non-existent worker returns WORKER_NOT_FOUND', disp5.ok === false && disp5.code === 'WORKER_NOT_FOUND');

  // ------------------------------------------------------------
  // 6. Worker Already Busy
  // ------------------------------------------------------------
  console.log('\n── 6. Worker Already Busy ──');
  const originalReg = fs.readFileSync(REGISTRY_FILE, 'utf-8');
  try {
    const regData = JSON.parse(originalReg);
    regData.workers[0].status = 'BUSY';
    regData.workers[0].current_task = 'NEXA-8888';
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(regData, null, 2));

    const testActiveTask = path.join(ACTIVE_DIR, 'NEXA-8889.json');
    fs.writeFileSync(testActiveTask, JSON.stringify({ task_id: 'NEXA-8889', title: 'Busy Test' }, null, 2));

    const disp6 = await dispatcher.dispatch('NEXA-8889');
    assert('Dispatch rejected when worker is busy', disp6.ok === false && disp6.code === 'WORKER_BUSY');

    if (fs.existsSync(testActiveTask)) fs.unlinkSync(testActiveTask);
  } finally {
    fs.writeFileSync(REGISTRY_FILE, originalReg);
  }

  // ------------------------------------------------------------
  // 7. Worker Completion Review
  // ------------------------------------------------------------
  console.log('\n── 7. Worker Completion Review ──');
  const mockCompletedTask = 'NEXA-7777';
  const mockCompletedFile = path.join(COMPLETED_DIR, `${mockCompletedTask}.json`);
  const mockReport = {
    task_id: mockCompletedTask,
    status: 'completed',
    worker_id: 'nexa-dev-01',
    summary: 'Mock successful feature',
    changes: ['Updated code'],
    files_changed: [{ path: 'packages/utils/src/test.ts', action: 'modified' }],
    tests: {
      typecheck: { status: 'passed' },
      lint: { status: 'passed', errors: 0, warnings: 0 },
      unit_tests: { status: 'passed', total: 10, passed: 10, failed: 0 }
    },
    verification: ['Manual verify passed'],
    git: {
      branch: 'ai/NEXA-7777-mock',
      base_branch: 'dev',
      commits: [{ sha: '1234567890abcdef', message: 'Mock commit' }]
    },
    completed_at: new Date().toISOString()
  };

  try {
    fs.writeFileSync(mockCompletedFile, JSON.stringify(mockReport, null, 2));
    const rev7 = await reviewer.review(mockCompletedTask);
    assert('Valid completion report is ACCEPTED', rev7.verdict === 'ACCEPTED');
    assert('Human summary generated cleanly', Boolean(rev7.human_summary));
  } finally {
    if (fs.existsSync(mockCompletedFile)) fs.unlinkSync(mockCompletedFile);
  }

  // ------------------------------------------------------------
  // 8. Worker Failure Handling
  // ------------------------------------------------------------
  console.log('\n── 8. Worker Failure Handling ──');
  const mockFailTask = 'NEXA-7776';
  const mockFailFile = path.join(FAILED_DIR, `${mockFailTask}.json`);
  const mockFailData = {
    task_id: mockFailTask,
    status: 'failed',
    reason: 'TESTS_FAILED',
    error_details: '3 unit tests failed in attendance.service.spec.ts',
    recommended_action: 'Fix attendance calculation logic'
  };

  try {
    fs.writeFileSync(mockFailFile, JSON.stringify(mockFailData, null, 2));
    const rev8 = await reviewer.review(mockFailTask);
    assert('Failure report detected with verdict FAILED', rev8.verdict === 'FAILED');
    assert('Error details preserved', rev8.error_details.includes('attendance.service.spec.ts'));
  } finally {
    if (fs.existsSync(mockFailFile)) fs.unlinkSync(mockFailFile);
  }

  // ------------------------------------------------------------
  // 9. Worker Interruption Handling
  // ------------------------------------------------------------
  console.log('\n── 9. Worker Interruption Handling ──');
  const mockIntTask = 'NEXA-7775';
  const mockIntFile = path.join(FAILED_DIR, `${mockIntTask}.json`);
  const mockIntData = {
    task_id: mockIntTask,
    status: 'failed',
    reason: 'INTERRUPTED',
    summary: 'Process died unexpectedly',
    error_details: 'Stale lock timeout'
  };

  try {
    fs.writeFileSync(mockIntFile, JSON.stringify(mockIntData, null, 2));
    const rev9 = await reviewer.review(mockIntTask);
    assert('Interrupted task detected', rev9.verdict === 'FAILED' && rev9.reason === 'INTERRUPTED');
  } finally {
    if (fs.existsSync(mockIntFile)) fs.unlinkSync(mockIntFile);
  }

  // ------------------------------------------------------------
  // 10. Invalid Completion Report
  // ------------------------------------------------------------
  console.log('\n── 10. Invalid Completion Report ──');
  const mockBadTask = 'NEXA-7774';
  const mockBadFile = path.join(COMPLETED_DIR, `${mockBadTask}.json`);
  try {
    fs.writeFileSync(mockBadFile, '{ invalid json');
    const rev10 = await reviewer.review(mockBadTask);
    assert('Malformed JSON report handled gracefully', rev10.verdict === 'PARSE_ERROR');
  } finally {
    if (fs.existsSync(mockBadFile)) fs.unlinkSync(mockBadFile);
  }

  // ------------------------------------------------------------
  // 11. Failed Acceptance Criterion (Test Gates Failed)
  // ------------------------------------------------------------
  console.log('\n── 11. Failed Acceptance Criterion (Failing QA) ──');
  const mockGateFailTask = 'NEXA-7773';
  const mockGateFailFile = path.join(COMPLETED_DIR, `${mockGateFailTask}.json`);
  const mockGateFailReport = {
    task_id: mockGateFailTask,
    status: 'completed',
    worker_id: 'nexa-dev-01',
    tests: {
      typecheck: { status: 'passed' },
      lint: { status: 'failed', errors: 4 }, // LINT FAILED
      unit_tests: { status: 'passed' }
    },
    git: { commits: [{ sha: 'abc' }] }
  };

  try {
    fs.writeFileSync(mockGateFailFile, JSON.stringify(mockGateFailReport, null, 2));
    const rev11 = await reviewer.review(mockGateFailTask);
    assert('Reviewer detects unmet criteria when lint fails', rev11.verdict === 'CRITERIA_UNMET');
    assert('Needs follow-up flagged', rev11.needs_follow_up === true);
  } finally {
    if (fs.existsSync(mockGateFailFile)) fs.unlinkSync(mockGateFailFile);
  }

  // ------------------------------------------------------------
  // 12. Follow-Up Task Generation
  // ------------------------------------------------------------
  console.log('\n── 12. Follow-Up Task Generation ──');
  const followUpOrder = await reviewer.createFollowUp('NEXA-7773', 'ESLint reported 4 errors', planner);
  assert('Follow-up task created with new ID', Boolean(followUpOrder.task_id) && followUpOrder.task_id !== 'NEXA-7773');
  assert('Follow-up references parent task in dependencies', followUpOrder.dependencies?.[0] === 'NEXA-7773');

  const followUpFile = path.join(ACTIVE_DIR, `${followUpOrder.task_id}.json`);
  if (fs.existsSync(followUpFile)) fs.unlinkSync(followUpFile);

  // ------------------------------------------------------------
  // 13. Production-Targeted Request Rejection
  // ------------------------------------------------------------
  console.log('\n── 13. Production-Targeted Request Rejection ──');
  const plan13a = await planner.plan('Deploy changes to production server now');
  assert('Deploy to production prompt rejected', plan13a.ok === false && plan13a.code === 'BLOCKED_PRODUCTION_CHANGE');

  const plan13b = await planner.plan('Stop nexa_web container and restart production');
  assert('Stop nexa_web container prompt rejected', plan13b.ok === false && plan13b.code === 'BLOCKED_PRODUCTION_CHANGE');

  const plan13c = await planner.plan('Delete users from nexa_chess database');
  assert('nexa_chess mutation prompt rejected', plan13c.ok === false && plan13c.code === 'BLOCKED_PRODUCTION_CHANGE');

  // ------------------------------------------------------------
  // 14. Unsafe Command Request Rejection
  // ------------------------------------------------------------
  console.log('\n── 14. Unsafe Request Rejection ──');
  const plan14a = await planner.plan('Run rm -rf / on the system');
  assert('rm -rf / prompt rejected', plan14a.ok === false && plan14a.code === 'BLOCKED_UNSAFE_REQUEST');

  const plan14b = await planner.plan('FLUSHALL Redis cache immediately');
  assert('FLUSHALL prompt rejected', plan14b.ok === false && plan14b.code === 'BLOCKED_UNSAFE_REQUEST');

  // ------------------------------------------------------------
  // 15. Duplicate Task Prevention / Atomic Lock
  // ------------------------------------------------------------
  console.log('\n── 15. Duplicate Task Prevention ──');
  const dupTaskId = 'NEXA-7772';
  const dupTaskFile = path.join(ACTIVE_DIR, `${dupTaskId}.json`);
  const dupLockFile = path.join(ACTIVE_DIR, `${dupTaskId}.lock`);

  try {
    fs.writeFileSync(dupTaskFile, JSON.stringify({ task_id: dupTaskId, title: 'Dup Test' }, null, 2));
    fs.writeFileSync(dupLockFile, JSON.stringify({ task_id: dupTaskId, pid: process.pid }, null, 2));

    // Try to dispatch an already locked task
    const disp15 = await dispatcher.dispatch(dupTaskId);
    assert('Locked task rejects duplicate execution', disp15.ok === false);
  } finally {
    if (fs.existsSync(dupTaskFile)) fs.unlinkSync(dupTaskFile);
    if (fs.existsSync(dupLockFile)) fs.unlinkSync(dupLockFile);
  }

  // ============================================================
  // Summary
  // ============================================================
  console.log('\n============================================================');
  console.log(`  MANAGER TEST SUITE RESULTS: ${passedTests}/${totalTests} passed (${failedTests} failures)`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL 15 MANAGER ORCHESTRATION SCENARIOS PASSED 100%!\n');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('❌ Test suite execution error:', err);
  process.exit(1);
});
