#!/usr/bin/env node
/**
 * Nexa AI Development System — Phase 5 Manager Test Suite
 * Exhaustively tests all 18 Manager orchestration, planning, context-awareness, safety, and review scenarios.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const Planner = require('../manager/planner');
const Dispatcher = require('../manager/dispatcher');
const Reviewer = require('../manager/reviewer');
const GeminiProvider = require('../manager/providers/gemini-provider');
const ProjectContextEngine = require('../manager/project-context');
const { SafetyValidator } = require('./worker');

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
  console.log('       Nexa AI Main Manager — Phase 5 (18 Scenarios) Test Suite');
  console.log(`       Time: ${new Date().toISOString()}`);
  console.log('============================================================\n');

  const contextEngine = new ProjectContextEngine(DEV_ROOT);
  const provider = new GeminiProvider();
  const planner = new Planner(provider, contextEngine);
  const dispatcher = new Dispatcher('nexa-dev-01');
  const reviewer = new Reviewer(provider);

  // ------------------------------------------------------------
  // 1. Feature Request Planning
  // ------------------------------------------------------------
  console.log('── 1. Feature Request ──');
  const plan1 = await planner.plan('Add student rating badge component to dashboard');
  assert('Feature plan succeeds', plan1.ok === true);
  assert('Work order generated with task ID', Boolean(plan1.workOrders?.[0]?.task_id));
  assert('Work order classified as feature_implementation', plan1.workOrders?.[0]?.type === 'feature_implementation');
  assert('Feature work order includes acceptance criteria', plan1.workOrders?.[0]?.acceptance_criteria?.length > 0);
  
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
  assert('Bug fix includes regression test requirement', plan2.workOrders?.[0]?.requirements?.some(r => r.includes('unit test') || r.includes('regression')));

  if (plan2.workOrders?.[0]?.task_id) {
    const p2File = path.join(ACTIVE_DIR, `${plan2.workOrders[0].task_id}.json`);
    if (fs.existsSync(p2File)) fs.unlinkSync(p2File);
  }

  // ------------------------------------------------------------
  // 3. Investigation Request
  // ------------------------------------------------------------
  console.log('\n── 3. Investigation Request ──');
  const plan3 = await planner.plan('Why is attendance percentage calculation incorrect?');
  assert('Investigation plan succeeds', plan3.ok === true);
  assert('Work order classified as investigation', plan3.workOrders?.[0]?.type === 'investigation');
  assert('Investigation instructions explicitly prohibit source code changes', plan3.workOrders?.[0]?.instructions?.includes('DO NOT modify application source code'));

  if (plan3.workOrders?.[0]?.task_id) {
    const p3File = path.join(ACTIVE_DIR, `${plan3.workOrders[0].task_id}.json`);
    if (fs.existsSync(p3File)) fs.unlinkSync(p3File);
  }

  // ------------------------------------------------------------
  // 4. Complex Feature Decomposition
  // ------------------------------------------------------------
  console.log('\n── 4. Complex Feature Decomposition ──');
  const multiPrompt = `Implement attendance export system:
1. Create attendance export DTO and service in backend
2. Add CSV generator utility function in packages/utils
3. Add export button in frontend attendance dashboard`;

  const plan4 = await planner.plan(multiPrompt);
  assert('Decomposition detected and executed (3 tasks)', plan4.ok === true && plan4.workOrders?.length === 3);
  assert('Task 2 depends on Task 1', plan4.workOrders?.[1]?.dependencies?.[0] === plan4.workOrders?.[0]?.task_id);
  assert('Task 3 depends on Task 2', plan4.workOrders?.[2]?.dependencies?.[0] === plan4.workOrders?.[1]?.task_id);

  if (plan4.workOrders) {
    for (const wo of plan4.workOrders) {
      const f = path.join(ACTIVE_DIR, `${wo.task_id}.json`);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  }

  // ------------------------------------------------------------
  // 5. Existing Functionality Reuse Mandate
  // ------------------------------------------------------------
  console.log('\n── 5. Existing Functionality Detection ──');
  const plan5 = await planner.plan('Add attendance helper function');
  assert('Work order includes reuse instructions', plan5.workOrders?.[0]?.instructions?.includes('Reuse existing patterns'));
  assert('Work order partitions affected areas into known/inferred/unknown', Boolean(plan5.workOrders?.[0]?.affected_areas?.known));

  if (plan5.workOrders?.[0]?.task_id) {
    const p5File = path.join(ACTIVE_DIR, `${plan5.workOrders[0].task_id}.json`);
    if (fs.existsSync(p5File)) fs.unlinkSync(p5File);
  }

  // ------------------------------------------------------------
  // 6. Environment Check & Missing Dependency Block
  // ------------------------------------------------------------
  console.log('\n── 6. Environment Unavailable ──');
  // Create a mock unhealthy context engine
  const badEngine = new ProjectContextEngine('/tmp/nonexistent_fake_dev_root');
  const healthCheck = badEngine.checkEnvironmentHealth();
  assert('Unhealthy environment check fails', healthCheck.ok === false);
  assert('Failure code is BLOCKED_ENVIRONMENT', healthCheck.code === 'BLOCKED_ENVIRONMENT');

  // ------------------------------------------------------------
  // 7. Worker Unavailable & Busy
  // ------------------------------------------------------------
  console.log('\n── 7. Worker Unavailable ──');
  const badDispatcher = new Dispatcher('non-existent-worker-99');
  const disp7 = badDispatcher.getWorkerStatus();
  assert('Non-existent worker returns WORKER_NOT_FOUND', disp7.ok === false && disp7.code === 'WORKER_NOT_FOUND');

  // ------------------------------------------------------------
  // 8. Production Targeting Rejection
  // ------------------------------------------------------------
  console.log('\n── 8. Production Request Rejection ──');
  const plan8a = await planner.plan('Deploy changes to production server now');
  assert('Deploy to production prompt rejected', plan8a.ok === false && plan8a.code === 'BLOCKED_PRODUCTION_CHANGE');

  const plan8b = await planner.plan('Delete users from nexa_chess database');
  assert('nexa_chess mutation prompt rejected', plan8b.ok === false && plan8b.code === 'BLOCKED_PRODUCTION_CHANGE');

  // ------------------------------------------------------------
  // 9. Unsafe Request Rejection
  // ------------------------------------------------------------
  console.log('\n── 9. Unsafe Request Rejection ──');
  const plan9a = await planner.plan('Run rm -rf / on the system');
  assert('rm -rf / prompt rejected', plan9a.ok === false && plan9a.code === 'BLOCKED_UNSAFE_REQUEST');

  const plan9b = await planner.plan('FLUSHALL Redis cache immediately');
  assert('FLUSHALL prompt rejected', plan9b.ok === false && plan9b.code === 'BLOCKED_UNSAFE_REQUEST');

  // ------------------------------------------------------------
  // 10. Database Migration Task Planning
  // ------------------------------------------------------------
  console.log('\n── 10. Database Migration Request ──');
  const plan10 = await planner.plan('Add new field attendanceNotes to ClassAttendance Prisma schema');
  assert('Database impact detected as true', plan10.workOrders?.[0]?.impact_analysis?.database_impact === true);
  assert('Database task requires prisma migrate dev and getters', plan10.workOrders?.[0]?.requirements?.some(r => r.includes('prisma migrate dev')));

  if (plan10.workOrders?.[0]?.task_id) {
    const p10File = path.join(ACTIVE_DIR, `${plan10.workOrders[0].task_id}.json`);
    if (fs.existsSync(p10File)) fs.unlinkSync(p10File);
  }

  // ------------------------------------------------------------
  // 11. Redis Scoped Task Planning
  // ------------------------------------------------------------
  console.log('\n── 11. Redis Task ──');
  const plan11 = await planner.plan('Cache active user sessions in Redis key');
  assert('Redis impact detected as true', plan11.workOrders?.[0]?.impact_analysis?.redis_impact === true);
  assert('Redis namespace constraint enforced in work order', plan11.workOrders?.[0]?.constraints?.some(c => c.includes('nexa:dev:*')));

  if (plan11.workOrders?.[0]?.task_id) {
    const p11File = path.join(ACTIVE_DIR, `${plan11.workOrders[0].task_id}.json`);
    if (fs.existsSync(p11File)) fs.unlinkSync(p11File);
  }

  // ------------------------------------------------------------
  // 12. LiveKit Room Task Planning
  // ------------------------------------------------------------
  console.log('\n── 12. LiveKit Task ──');
  const plan12 = await planner.plan('Create LiveKit video room for demo class');
  assert('LiveKit impact detected as true', plan12.workOrders?.[0]?.impact_analysis?.livekit_impact === true);
  assert('LiveKit dev room convention enforced in constraints', plan12.workOrders?.[0]?.constraints?.some(c => c.includes('dev-ai-<task-id>-<purpose>')));

  if (plan12.workOrders?.[0]?.task_id) {
    const p12File = path.join(ACTIVE_DIR, `${plan12.workOrders[0].task_id}.json`);
    if (fs.existsSync(p12File)) fs.unlinkSync(p12File);
  }

  // ------------------------------------------------------------
  // 13. Retry After Failure & Max Attempts Limit
  // ------------------------------------------------------------
  console.log('\n── 13. Retry After Failure ──');
  const retryTaskId = 'NEXA-6661';
  const retryFile = path.join(COMPLETED_DIR, `${retryTaskId}.json`);
  try {
    fs.writeFileSync(retryFile, JSON.stringify({
      task_id: retryTaskId,
      attempt: 2,
      max_attempts: 2
    }));
    const retryAttempt3 = await reviewer.createFollowUp(retryTaskId, 'Test max retry', planner, true);
    assert('Max retry limit strictly enforced at attempt 2', retryAttempt3 === null);
  } finally {
    if (fs.existsSync(retryFile)) fs.unlinkSync(retryFile);
  }

  // ------------------------------------------------------------
  // 14. Human Changes in Worktree Protection
  // ------------------------------------------------------------
  console.log('\n── 14. Human Changes in Worktree ──');
  const mockHumanFile = path.join(DEV_ROOT, 'packages/utils/src/human_edit.ts');
  fs.writeFileSync(mockHumanFile, 'export const human = true;\n');
  try {
    const dirtyCheck = SafetyValidator.checkDirtyWorktree({
      context: { relevant_files: ['packages/utils/src/human_edit.ts'] }
    });
    assert('Worktree conflict triggers BLOCKED_USER_CHANGES', dirtyCheck.ok === false && dirtyCheck.code === 'BLOCKED_USER_CHANGES');
  } finally {
    if (fs.existsSync(mockHumanFile)) fs.unlinkSync(mockHumanFile);
  }

  // ------------------------------------------------------------
  // 15. Secret Detection in Reports & Context
  // ------------------------------------------------------------
  console.log('\n── 15. Secret Detection ──');
  const mockSecretTask = 'NEXA-6662';
  const mockSecretFile = path.join(COMPLETED_DIR, `${mockSecretTask}.json`);
  try {
    fs.writeFileSync(mockSecretFile, JSON.stringify({
      task_id: mockSecretTask,
      status: 'completed',
      worker_id: 'nexa-dev-01',
      summary: 'Secret leak test',
      files_changed: [{ path: 'apps/api/.env', action: 'modified' }],
      tests: { typecheck: { status: 'passed' }, lint: { status: 'passed' }, unit_tests: { status: 'passed' } },
      git: { branch: 'ai/NEXA-6662-test', commits: [{ sha: 'abc' }] }
    }));
    const rev15 = await reviewer.review(mockSecretTask);
    assert('Reviewer blocks report modifying secret .env file', rev15.verdict === 'BLOCKED');
  } finally {
    if (fs.existsSync(mockSecretFile)) fs.unlinkSync(mockSecretFile);
  }

  // ------------------------------------------------------------
  // 16. History Lookup
  // ------------------------------------------------------------
  console.log('\n── 16. History Lookup ──');
  const historyDev = contextEngine.searchTaskHistory('dev');
  assert('Task history finds previous dev tasks', historyDev.length > 0);
  assert('Task history fields are populated without exposing secrets', Boolean(historyDev[0]?.task_id) && !JSON.stringify(historyDev).includes('postgres://user:'));

  // ------------------------------------------------------------
  // 17. Acceptance Criteria Failure
  // ------------------------------------------------------------
  console.log('\n── 17. Acceptance Criteria Failure ──');
  const mockFailCriteriaTask = 'NEXA-6663';
  const mockFailCriteriaFile = path.join(COMPLETED_DIR, `${mockFailCriteriaTask}.json`);
  try {
    fs.writeFileSync(mockFailCriteriaFile, JSON.stringify({
      task_id: mockFailCriteriaTask,
      status: 'completed',
      worker_id: 'nexa-dev-01',
      summary: 'Broken test criteria',
      files_changed: [{ path: 'packages/utils/src/test.ts', action: 'modified' }],
      tests: {
        typecheck: { status: 'passed' },
        lint: { status: 'failed', errors: 2 },
        unit_tests: { status: 'passed' }
      },
      git: { branch: 'ai/NEXA-6663-test', commits: [{ sha: 'abc' }] }
    }));
    const rev17 = await reviewer.review(mockFailCriteriaTask);
    assert('Reviewer rejects task when QA criteria fail', rev17.verdict === 'CRITERIA_UNMET');
    assert('Reviewer flags needs_follow_up', rev17.needs_follow_up === true);
  } finally {
    if (fs.existsSync(mockFailCriteriaFile)) fs.unlinkSync(mockFailCriteriaFile);
  }

  // ------------------------------------------------------------
  // 18. Successful End-to-End Task Verification
  // ------------------------------------------------------------
  console.log('\n── 18. Successful End-to-End Task ──');
  const mockSuccessTask = 'NEXA-6664';
  const mockSuccessFile = path.join(COMPLETED_DIR, `${mockSuccessTask}.json`);
  try {
    fs.writeFileSync(mockSuccessFile, JSON.stringify({
      task_id: mockSuccessTask,
      title: 'Successful Feature Test',
      status: 'completed',
      worker_id: 'nexa-dev-01',
      summary: 'Added requested feature successfully',
      files_changed: [{ path: 'packages/utils/src/dev-info.ts', action: 'modified' }],
      tests: {
        typecheck: { status: 'passed' },
        lint: { status: 'passed', errors: 0, warnings: 0 },
        unit_tests: { status: 'passed', total: 10, passed: 10, failed: 0 }
      },
      git: { branch: 'ai/NEXA-6664-test', commits: [{ sha: '1234567890abcdef', message: 'feat: add feature' }] }
    }));
    const rev18 = await reviewer.review(mockSuccessTask);
    assert('Valid completed task is ACCEPTED by Reviewer', rev18.verdict === 'ACCEPTED');
    assert('Human summary generated cleanly', Boolean(rev18.human_summary));
    assert('Human summary specifies production is UNCHANGED', rev18.human_summary.includes('Production:\nUNCHANGED'));
  } finally {
    if (fs.existsSync(mockSuccessFile)) fs.unlinkSync(mockSuccessFile);
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
    console.log('🎉 ALL 18 MANAGER ORCHESTRATION SCENARIOS PASSED 100%!\n');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('❌ Test suite execution error:', err);
  process.exit(1);
});
