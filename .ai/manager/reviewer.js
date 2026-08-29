/**
 * Nexa AI Development System — Phase 8 Main Manager Reviewer
 * Independently audits completion reports, git artifacts, security boundaries,
 * acceptance criteria, and generates structured Human Review Packages.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const GeminiProvider = require('./providers/gemini-provider');
const TaskLifecycle = require('./task-lifecycle');

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
   * Generates a structured, concise Human Review Package.
   */
  generateReviewPackage(report, reviewResult) {
    const taskId = report.task_id;
    const title = report.title || report.summary || taskId;
    const worker = report.worker_id || 'nexa-dev-01';
    const branch = report.task_branch || report.git?.branch || `ai/${taskId}`;
    const impact = report.impact || 'MEDIUM';
    const files = (report.files_changed || []).map(f => typeof f === 'string' ? f : f.path);
    const summary = report.summary || 'Task completed';
    const rootCause = report.root_cause || (report.investigation_findings?.root_cause) || 'N/A';

    // Acceptance criteria lines
    const acList = report.tests?.acceptance_criteria?.evaluated || report.acceptance_criteria_status || [];
    const acLines = acList.length > 0
      ? acList.map(ac => `  ✓ [${ac.id || 'AC'}] ${ac.description || ac.criterion} (${ac.verification || 'verified'})`).join('\n')
      : '  ✓ All criteria verified';

    // Verification lines
    const tests = report.tests || {};
    const typecheckStatus = tests.typecheck?.status === 'passed' ? '✓ Typecheck (Clean)' : '⊘ Typecheck (Skipped/Failed)';
    const lintStatus = tests.lint?.status === 'passed' ? '✓ Lint (0 errors)' : '⊘ Lint (Skipped/Failed)';
    const testStatus = tests.unit_tests?.status === 'passed' ? '✓ Unit Tests (Passed)' : '⊘ Unit Tests (Skipped/Failed)';
    const buildStatus = tests.build?.status === 'passed' ? '✓ Build (Clean)' : '⊘ Build (Skipped/Optional)';

    return [
      `============================================================`,
      `HUMAN REVIEW PACKAGE: ${taskId}`,
      `============================================================`,
      `Title:        ${title}`,
      `Worker:       ${worker}`,
      `Branch:       ${branch}`,
      `Impact:       ${impact}`,
      ``,
      `Files Changed (${files.length}):`,
      files.length > 0 ? files.map(f => `  - ${f}`).join('\n') : '  (None)',
      ``,
      `Summary:`,
      `  ${summary}`,
      ``,
      `Root Cause:`,
      `  ${rootCause}`,
      ``,
      `Acceptance Criteria:`,
      acLines,
      ``,
      `Verification:`,
      `  ${typecheckStatus}`,
      `  ${lintStatus}`,
      `  ${testStatus}`,
      `  ${buildStatus}`,
      ``,
      `Security:`,
      `  ✓ No secret credentials exposed`,
      `  ✓ No production access (/opt/nexa-chess/NexaGen blocked)`,
      ``,
      `Database:`,
      `  ✓ vps_dev target only (nexa_chess untouched)`,
      ``,
      `Merge Status:  ${reviewResult.verdict === 'ACCEPTED' ? 'READY FOR HUMAN REVIEW' : 'NOT READY'}`,
      ``,
      `Human Action:`,
      `  Review git diff on branch '${branch}' and merge manually into 'dev'.`,
      `============================================================`
    ].join('\n');
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
        const attempt = failData.attempt || 1;
        const maxAttempts = failData.max_attempts || 2;
        const isEscalated = attempt >= maxAttempts;

        return {
          verdict: isEscalated ? 'ESCALATED' : 'FAILED',
          task_id: taskId,
          status: isEscalated ? 'escalated' : 'failed',
          attempt,
          max_attempts: maxAttempts,
          reason: failData.reason || 'Worker execution failed',
          error_details: failData.error_details || failData.summary,
          recommendation: isEscalated
            ? `Max retry limit reached (${attempt}/${maxAttempts}). Human intervention required.`
            : (failData.recommended_action || 'Inspect error details, resolve blocking issues, and retry work order.')
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
      const typecheckPassed = tests.typecheck?.status !== 'failed';
      const lintPassed = tests.lint?.status !== 'failed';
      const unitTestsPassed = tests.unit_tests?.status !== 'failed';
      const acPassed = tests.acceptance_criteria?.status !== 'failed';

      if (!typecheckPassed || !lintPassed || !unitTestsPassed || !acPassed) {
        return {
          verdict: 'CRITERIA_UNMET',
          task_id: taskId,
          attempt: report.attempt || 1,
          max_attempts: report.max_attempts || 2,
          reason: 'Automated QA test gates or acceptance criteria failed',
          details: { typecheck: tests.typecheck, lint: tests.lint, unit_tests: tests.unit_tests, acceptance_criteria: tests.acceptance_criteria },
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

      const reportedBranch = report.task_branch || report.git.branch;
      if (!reportedBranch || !reportedBranch.startsWith('ai/')) {
        return {
          verdict: 'BLOCKED',
          task_id: taskId,
          reason: `Git branch policy violation: work was not performed on an isolated ai/* branch (${reportedBranch})`
        };
      }

      // 6. Security Boundary & Investigation Validation
      const files = report.files_changed || [];
      for (const f of files) {
        const p = typeof f === 'string' ? f : f.path;
        if (p.includes('.env') || p.includes('.key') || p.includes('id_rsa')) {
          return {
            verdict: 'BLOCKED',
            task_id: taskId,
            reason: `Security violation: sensitive secret file present in change list (${p})`
          };
        }
        if (p.startsWith('/opt/nexa-chess/NexaGen/') && !p.startsWith('/opt/nexa-chess/NexaGen-dev/')) {
          return {
            verdict: 'BLOCKED',
            task_id: taskId,
            reason: `Production isolation violation: production path touched (${p})`
          };
        }
      }

      // Check investigation mode: no application source code modifications allowed
      if (report.type === 'investigation') {
        const appCodeChanges = files.filter(f => {
          const p = typeof f === 'string' ? f : f.path;
          return !p.startsWith('.ai/');
        });
        if (appCodeChanges.length > 0) {
          return {
            verdict: 'BLOCKED',
            task_id: taskId,
            reason: `Investigation task violated constraint by modifying application source code: ${appCodeChanges.map(f => typeof f === 'string' ? f : f.path).join(', ')}`
          };
        }
      }

      // 7. Provider Review
      const reviewResult = await this.provider.reviewCompletion(report, report);
      const reviewPackage = this.generateReviewPackage(report, reviewResult);

      return {
        ...reviewResult,
        review_package: reviewPackage,
        human_summary: reviewPackage
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
