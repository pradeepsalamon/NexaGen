/**
 * Nexa AI Development System — Main Manager Reviewer
 * Reviews worker completion reports, validates acceptance criteria, and generates follow-up tasks if needed.
 */

const fs = require('fs');
const path = require('path');
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
   * Reviews task completion report.
   */
  async review(taskId) {
    const completedPath = path.join(COMPLETED_DIR, `${taskId}.json`);
    const failedPath = path.join(FAILED_DIR, `${taskId}.json`);

    // Check if task failed
    if (fs.existsSync(failedPath)) {
      const failData = JSON.parse(fs.readFileSync(failedPath, 'utf-8'));
      return {
        verdict: 'FAILED',
        task_id: taskId,
        status: 'failed',
        reason: failData.reason || 'Worker execution failed',
        error_details: failData.error_details || failData.summary,
        recommendation: failData.recommended_action || 'Review error logs and re-dispatch with corrected specifications.'
      };
    }

    if (!fs.existsSync(completedPath)) {
      return {
        verdict: 'NOT_FOUND',
        task_id: taskId,
        reason: `Completion report for ${taskId} not found in ${COMPLETED_DIR}`
      };
    }

    try {
      const report = JSON.parse(fs.readFileSync(completedPath, 'utf-8'));
      
      // Perform automated QA checks
      const tests = report.tests || {};
      const typecheckPassed = tests.typecheck?.status === 'passed';
      const lintPassed = tests.lint?.status === 'passed' && (tests.lint?.errors || 0) === 0;
      const unitTestsPassed = tests.unit_tests?.status === 'passed' && (tests.unit_tests?.failed || 0) === 0;

      if (!typecheckPassed || !lintPassed || !unitTestsPassed) {
        return {
          verdict: 'CRITERIA_UNMET',
          task_id: taskId,
          reason: 'Automated test gates did not pass 100%',
          details: { typecheck: tests.typecheck, lint: tests.lint, unit_tests: tests.unit_tests },
          needs_follow_up: true,
          follow_up_title: `Fix failing tests for ${report.summary || taskId}`
        };
      }

      // Check Git commits
      if (!report.git?.commits || report.git.commits.length === 0) {
        return {
          verdict: 'CRITERIA_UNMET',
          task_id: taskId,
          reason: 'No Git commit SHA recorded in completion report',
          needs_follow_up: true,
          follow_up_title: `Create git commit for ${report.summary || taskId}`
        };
      }

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
   * Generates a follow-up work order if review identified unresolved gaps.
   */
  async createFollowUp(parentTaskId, reason, planner) {
    const newTaskId = planner.getNextTaskId();
    console.log(`\n🔄 [FOLLOW-UP] Creating follow-up task ${newTaskId} for parent ${parentTaskId}...`);

    const plan = {
      title: `Resolve follow-up for ${parentTaskId}: ${reason}`,
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
        'Clean build and unit test passage'
      ],
      required_tests: ['typecheck', 'lint', 'unit_tests']
    };

    const workOrder = await this.provider.generateWorkOrder(plan, { taskId: newTaskId });
    workOrder.dependencies = [parentTaskId];

    const targetFile = path.join(ACTIVE_DIR, `${newTaskId}.json`);
    fs.writeFileSync(targetFile, JSON.stringify(workOrder, null, 2), 'utf-8');
    console.log(`📝 Follow-up work order persisted: ${targetFile}`);
    return workOrder;
  }
}

module.exports = Reviewer;
