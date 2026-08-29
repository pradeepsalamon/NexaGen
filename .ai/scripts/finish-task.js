#!/usr/bin/env node
/**
 * Nexa AI Development System — Task Completion & Verification CLI
 * Runs QA checks, reviews diff, commits changes, and writes completion report.
 */

const fs = require('fs');
const path = require('path');
const {
  validateEnvironment,
  runVerification,
  reviewDiffAndCommit,
  generateCompletionReport,
  generateFailureReport,
  releaseLock,
  stopHeartbeat
} = require('./worker');

const DEV_ROOT = path.resolve(__dirname, '../..');
const AI_DIR = path.join(DEV_ROOT, '.ai');
const ACTIVE_DIR = path.join(AI_DIR, 'tasks', 'active');
const STATE_FILE = path.join(AI_DIR, 'workers', 'state.json');

async function main() {
  validateEnvironment();
  const args = process.argv.slice(2);

  let taskId = args[0];
  if (!taskId && fs.existsSync(STATE_FILE)) {
    try {
      const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      if (state.task_id) taskId = state.task_id;
    } catch {}
  }

  if (!taskId) {
    // Check if there's an active locked task
    const files = fs.readdirSync(ACTIVE_DIR).filter(f => f.endsWith('.json'));
    if (files.length === 1) {
      taskId = files[0].replace('.json', '');
    }
  }

  if (!taskId) {
    console.error('❌ Error: Task ID required (e.g. node .ai/scripts/finish-task.js NEXA-0001)');
    process.exit(1);
  }

  const taskPath = path.join(ACTIVE_DIR, `${taskId}.json`);
  if (!fs.existsSync(taskPath)) {
    console.error(`❌ Task ${taskId} not found in active directory (${taskPath})`);
    process.exit(1);
  }

  const taskData = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
  console.log(`\n============================================================`);
  console.log(`  Finishing Task: ${taskData.task_id} — "${taskData.title}"`);
  console.log(`============================================================\n`);

  // 1. Run Verification Pipeline
  const { ok, testResults } = runVerification(taskData);
  if (!ok) {
    console.error('\n❌ QA Verification failed. Task cannot be marked completed.');
    console.error('   Fix lint/typecheck/test errors and try again.');
    process.exit(1);
  }

  // 2. Review Diff & Create Commit
  const branchName = taskData.environment?.branch || 'ai/task-branch';
  const { filesChanged, commitSha, diffSummary } = reviewDiffAndCommit(taskData, branchName);

  // 3. Generate Completion Report
  const startTime = taskData.created_at ? new Date(taskData.created_at).getTime() : Date.now();
  const durationMinutes = Math.max(1, Math.round((Date.now() - startTime) / 60000));

  const report = generateCompletionReport(taskData, {
    filesChanged,
    commitSha,
    diffSummary,
    testResults,
    summary: taskData.objective,
    durationMinutes
  });

  // 4. Release lock and reset state
  releaseLock(taskData);
  stopHeartbeat();

  console.log(`\n============================================================`);
  console.log(`  🎉 Task ${taskData.task_id} COMPLETED SUCCESSFULLY!`);
  console.log(`  Branch: ${report.git.branch}`);
  console.log(`  Commit: ${commitSha ? commitSha.slice(0, 7) : 'None'}`);
  console.log(`============================================================\n`);
}

main().catch(err => {
  console.error('❌ Error finishing task:', err.message);
  stopHeartbeat();
  process.exit(1);
});
