/**
 * Nexa AI Development System — Phase 4 Main Manager Reviewer
 * Independently audits completion reports, git artifacts, security boundaries, and generates controlled follow-ups/retries.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const GeminiProvider = require('./providers/gemini-provider');

const DEV_ROOT = path.resolve(__dirname, '../..');
const AI_DIR = path.join(DEV_ROOT, '.ai');
const TASKS_DIR = path.join(AI_DIR, 'tasks');
const COMPLETED_DIR = path.join(TASKS_DIR, 'completed');
const FAILED_DIR = path.join(TASKS_DIR, 'failed');
const ACTIVE_DIR = path.join(TASKS_DIR, 'active');

class Reviewer {
  constructor(provider = null) {
    this.provider = provider || new GeminiProvider();
  }

  /**
   * Independently reviews task completion report and git state.
   */
  async review(taskId) {
    const completedPath = path.join(COMPLETED_DIR, `${taskId}.json`);
    const failedPath = path.join(FAILED_DIR, `${taskId}.json`);

    // 1. Check if task recorded failure
    if (fs.existsSync(failedPath)) {
      try {
        const failData = JSON.parse(fs.readFileSync(failedPath, 'utf-8'));
        return {
          verdict: 'FAILED',
          task_id: taskId,
          status: 'failed',
          attempt: failData.attempt || 1,
          max_attempts: failData.max_attempts || 2,
          reason: failData.reason || 'Worker execution failed',
          error_details: failData.error_details || failData.summary,
          recommendation: failData.recommended_action || 'Inspect error details, resolve blocking issues, and retry work order.'
        };
      } catch (err) {
        return { verdict: 'FAILED', task_id: taskId, reason: 'Malformed failure report' };
      }
    }

    // 2. Check if completion report exists
    if (!fs.existsSync(completedPath)) {
      return {
        verdict: 'NOT_FOUND',
        task_id: taskId,
        reason: `Completion report for ${taskId} not found in ${COMPLETED_DIR}`
      };
    }

    try {
      const report = JSON.parse(fs.readFileSync(completedPath, 'utf-8'));
      
      // 3. Schema & Field Validation
      const requiredFields = ['task_id', 'status', 'worker_id', 'summary', 'files_changed', 'tests', 'git'];
      for (const field of requiredFields) {
        if (!report[field]) {
          return {
            verdict: 'PARSE_ERROR',
            task_id: taskId,
            reason: `Completion report missing required field '${field}'`
          };
        }
      }

      // 4. Automated QA Test Gates
      const tests = report.tests || {};
      const typecheckPassed = tests.typecheck?.status === 'passed';
      const lintPassed = tests.lint?.status === 'passed' && (tests.lint?.errors || 0) === 0;
      const unitTestsPassed = tests.unit_tests?.status === 'passed' && (tests.unit_tests?.failed || 0) === 0;

      if (!typecheckPassed || !lintPassed || !unitTestsPassed) {
        return {
          verdict: 'CRITERIA_UNMET',
          task_id: taskId,
          attempt: report.attempt || 1,
          max_attempts: report.max_attempts || 2,
          reason: 'Automated QA test gates failed (must pass 100% with 0 errors)',
          details: { typecheck: tests.typecheck, lint: tests.lint, unit_tests: tests.unit_tests },
          needs_follow_up: true,
          follow_up_title: `Fix failing QA tests for ${report.summary || taskId}`
        };
      }

      // 5. Git Commit & Branch Independent Validation
      if (!report.git?.commits || report.git.commits.length === 0 || !report.git.commits[0]?.sha) {
        return {
          verdict: 'CRITERIA_UNMET',
          task_id: taskId,
          reason: 'No Git commit SHA recorded in completion report',
          needs_follow_up: true,
          follow_up_title: `Create git commit for ${report.summary || taskId}`
        };
      }

      const reportedBranch = report.git.branch;
      if (!reportedBranch || !reportedBranch.startsWith('ai/')) {
        return {
          verdict: 'BLOCKED',
          task_id: taskId,
          reason: `Git branch policy violation: work was not performed on an isolated ai/* branch (${reportedBranch})`
        };
      }

      // 6. Security Boundary Validation
      const files = report.files_changed || [];
      for (const f of files) {
        if (f.path.includes('.env') || f.path.includes('.key') || f.path.includes('id_rsa')) {
          return {
            verdict: 'BLOCKED',
            task_id: taskId,
            reason: `Security violation: sensitive secret file present in change list (${f.path})`
          };
        }
        if (f.path.startsWith('/opt/nexa-chess/NexaGen/') && !f.path.startsWith('/opt/nexa-chess/NexaGen-dev/')) {
          return {
            verdict: 'BLOCKED',
            task_id: taskId,
            reason: `Production isolation violation: production path touched (${f.path})`
          };
        }
      }

      // 7. Provider Review
      const reviewResult = await this.provider.reviewCompletion(report, report);
      return {
        ...reviewResult,
        human_summary: this.provider.summarizeForHuman(reviewResult)
      };
    } catch (err) {
      return {
        verdict: 'PARSE_ERROR',
        task_id: taskId,
        reason: `Failed to parse completion report: ${err.message}`
      };
    }
  }

  /**
   * Generates a controlled follow-up or retry work order.
   */
  async createFollowUp(parentTaskId, reason, planner, isRetry = false) {
    const parentFile = path.join(TASKS_DIR, 'completed', `${parentTaskId}.json`);
    let parentAttempt = 1;
    let maxAttempts = 2;

    if (fs.existsSync(parentFile)) {
      try {
        const parentData = JSON.parse(fs.readFileSync(parentFile, 'utf-8'));
        parentAttempt = parentData.attempt || 1;
        maxAttempts = parentData.max_attempts || 2;
      } catch {}
    }

    if (isRetry && parentAttempt >= maxAttempts) {
      console.log(`\n🛑 [RETRY LIMIT] Task ${parentTaskId} reached max retry limit (${parentAttempt}/${maxAttempts}). Escalating to human.`);
      return null;
    }

    const newTaskId = planner.getNextTaskId();
    const nextAttempt = isRetry ? parentAttempt + 1 : 1;

    console.log(`\n🔄 [FOLLOW-UP] Creating task ${newTaskId} (Attempt ${nextAttempt}/${maxAttempts}) for parent ${parentTaskId}...`);

    const plan = {
      title: `${isRetry ? 'Retry' : 'Follow-up'} for ${parentTaskId}: ${reason}`,
      objective: `Address incomplete criteria or failed checks from ${parentTaskId}: ${reason}`,
      type: 'bug_fix',
      priority: 'high',
      complexity: 'simple',
      requirements: [
        `Fix issues from ${parentTaskId}: ${reason}`,
        'Verify with full test suite'
      ],
      acceptance_criteria: [
        'All failed checks from parent task pass',
        'Clean build, typecheck, and unit test passage'
      ],
      required_tests: ['typecheck', 'lint', 'unit_tests']
    };

    const workOrder = await this.provider.generateWorkOrder(plan, {
      taskId: newTaskId,
      attempt: nextAttempt,
      max_attempts: maxAttempts
    });
    workOrder.dependencies = [parentTaskId];

    const targetFile = path.join(ACTIVE_DIR, `${newTaskId}.json`);
    fs.writeFileSync(targetFile, JSON.stringify(workOrder, null, 2), 'utf-8');
    console.log(`📝 Work order persisted: ${targetFile}`);
    return workOrder;
  }
}

module.exports = Reviewer;
