/**
 * Nexa AI Development System — Phase 9 Main Manager Planner
 * Handles request analysis, risk assessment, regression intelligence, smart task decomposition,
 * acceptance criteria formulation, test intelligence, and approval-ready work order creation.
 */

const fs = require('fs');
const path = require('path');
const GeminiProvider = require('./providers/gemini-provider');
const ProjectContextEngine = require('./project-context');
const TaskLifecycle = require('./task-lifecycle');
const RiskEngine = require('./risk-engine');
const RegressionEngine = require('./regression-engine');
const TestIntelligence = require('./test-intelligence');

const DEV_ROOT = path.resolve(__dirname, '../..');
const AI_DIR = path.join(DEV_ROOT, '.ai');
const TASKS_DIR = path.join(AI_DIR, 'tasks');
const ACTIVE_DIR = path.join(TASKS_DIR, 'active');
const COUNTER_FILE = path.join(TASKS_DIR, 'counter.txt');

class Planner {
  constructor(provider = null, contextEngine = null, regressionEngine = null) {
    this.provider = provider || new GeminiProvider();
    this.contextEngine = contextEngine || new ProjectContextEngine();
    this.regressionEngine = regressionEngine || new RegressionEngine();
    this.projectContext = this.loadProjectContext();
  }

  /**
   * Loads high-level markdown context from .ai docs and live workspace metadata.
   */
  loadProjectContext() {
    const context = {
      live_metadata: this.contextEngine.getProjectContextSummary()
    };
    const docFiles = ['ARCHITECTURE.md', 'DATABASE.md', 'DEVELOPMENT.md', 'SECURITY.md', 'TESTING.md', 'VPS.md'];
    for (const doc of docFiles) {
      const docPath = path.join(AI_DIR, doc);
      if (fs.existsSync(docPath)) {
        context[doc.replace('.md', '').toLowerCase()] = fs.readFileSync(docPath, 'utf-8').slice(0, 4000);
      }
    }
    return context;
  }

  /**
   * Generates next monotonic task ID.
   */
  getNextTaskId() {
    let counter = 1;
    if (fs.existsSync(COUNTER_FILE)) {
      const raw = fs.readFileSync(COUNTER_FILE, 'utf-8').trim();
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed > 0) counter = parsed;
    }
    const taskId = `NEXA-${String(counter).padStart(4, '0')}`;
    fs.writeFileSync(COUNTER_FILE, String(counter + 1) + '\n', 'utf-8');
    return taskId;
  }

  /**
   * Safety pre-check against production modifications, dangerous SQL, or unsafe requests.
   */
  preCheckSafety(userPrompt) {
    if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim().length === 0) {
      return { ok: false, code: 'BLOCKED_INVALID_REQUEST', reason: 'User prompt cannot be empty' };
    }

    const risk = RiskEngine.assessRisk(userPrompt, {});
    if (risk.is_blocked) {
      return {
        ok: false,
        code: 'BLOCKED_PRODUCTION_CHANGE',
        reason: risk.reasons.join('; ')
      };
    }

    return { ok: true, risk };
  }

  /**
   * Intelligently detects if a request should be decomposed into a multi-task DAG.
   * Small / focused tasks remain single tasks.
   */
  detectDecomposition(userPrompt) {
    const subTasks = [];
    const promptLower = userPrompt.toLowerCase();

    // 1. Explicit numbered or bulleted sub-requests
    const numberedMatch = userPrompt.match(/(?:^|\n)\s*(?:\d+[\.\)]|\-|\*)\s*(.+)/g);
    if (numberedMatch && numberedMatch.length >= 2) {
      for (const item of numberedMatch) {
        const cleaned = item.replace(/^\s*(?:\d+[\.\)]|\-|\*)\s*/, '').trim();
        if (cleaned.length > 5) subTasks.push(cleaned);
      }
      if (subTasks.length >= 2) return subTasks;
    }

    // 2. Broad multi-tier request pattern (e.g. "Build complete attendance analytics for students, coaches and admin")
    if (
      (/\bbuild complete\b/i.test(promptLower) || /\bfull stack\b/i.test(promptLower) || /\bcomplete feature\b/i.test(promptLower)) &&
      (/\band\b/i.test(promptLower) || /,\s*/.test(promptLower))
    ) {
      // Decompose into logical backend, frontend, and QA integration tasks
      const baseTopic = userPrompt.replace(/^build complete\s+/i, '').replace(/^implement\s+/i, '').trim();
      return [
        `Implement backend API and service logic for ${baseTopic}`,
        `Build frontend UI components and dashboard for ${baseTopic}`,
        `Add integration and regression test coverage for ${baseTopic}`
      ];
    }

    return subTasks;
  }

  /**
   * Plans and creates structured work orders with machine-readable acceptance criteria,
   * risk analysis, regression intelligence, and approval gates.
   */
  async plan(userPrompt, options = {}) {
    const safety = this.preCheckSafety(userPrompt);
    if (!safety.ok) {
      return { ok: false, code: safety.code, reason: safety.reason };
    }

    const subPrompts = this.detectDecomposition(userPrompt);
    const workOrders = [];

    // Regression analysis
    const regressionInfo = this.regressionEngine.analyzeRegressionRisk(userPrompt, []);

    if (subPrompts.length >= 2) {
      console.log(`\n🧩 Complex request detected. Decomposing into ${subPrompts.length} DAG tasks:`);
      for (let i = 0; i < subPrompts.length; i++) {
        const subPrompt = subPrompts[i];
        const taskId = this.getNextTaskId();
        console.log(`   Task ${i + 1}/${subPrompts.length}: [${taskId}] ${subPrompt}`);

        const plan = await this.provider.analyzeRequest(subPrompt, this.projectContext);
        const workOrder = await this.provider.generateWorkOrder(plan, {
          taskId,
          attempt: 1,
          max_attempts: 2
        });

        // Set DAG dependencies
        if (i === 1) {
          workOrder.dependencies = [workOrders[0].task_id];
        } else if (i > 1) {
          workOrder.dependencies = workOrders.map(w => w.task_id);
        }

        // Assess Risk
        const risk = RiskEngine.assessRisk(subPrompt, workOrder.context || {});
        workOrder.impact = risk.level;
        workOrder.risk = risk;

        // Test Intelligence
        const testPlan = TestIntelligence.selectTestPlan(workOrder.context?.relevant_files || [], risk.level);
        workOrder.qa_tier = testPlan.qa_tier;
        workOrder.test_plan = testPlan;
        workOrder.verification_commands = testPlan.targeted_commands;

        // Inject Regression & Historical context
        workOrder.historical_context = {
          related_tasks: regressionInfo.related_tasks,
          previous_learnings: regressionInfo.context_summary || 'No direct prior failure hotspots identified.',
          past_root_causes: regressionInfo.past_root_causes,
          warnings: regressionInfo.warnings,
          regression_risk: regressionInfo.regression_risk
        };

        // Initialize state via TaskLifecycle (Plan -> AWAITING_APPROVAL)
        const initialState = options.autoApprove ? 'APPROVED' : 'AWAITING_APPROVAL';
        TaskLifecycle.transition(workOrder, initialState, {
          worker: 'manager',
          reason: options.autoApprove ? 'Auto-approved for execution' : 'Planned by Main Manager (Awaiting human approval)'
        });

        workOrders.push(workOrder);
      }
    } else {
      const taskId = this.getNextTaskId();
      const plan = await this.provider.analyzeRequest(userPrompt, this.projectContext);
      const workOrder = await this.provider.generateWorkOrder(plan, {
        taskId,
        attempt: 1,
        max_attempts: 2
      });

      // Assess Risk
      const risk = RiskEngine.assessRisk(userPrompt, workOrder.context || {});
      workOrder.impact = risk.level;
      workOrder.risk = risk;

      // Test Intelligence
      const testPlan = TestIntelligence.selectTestPlan(workOrder.context?.relevant_files || [], risk.level);
      workOrder.qa_tier = testPlan.qa_tier;
      workOrder.test_plan = testPlan;
      workOrder.verification_commands = testPlan.targeted_commands;

      // Inject Regression & Historical context
      workOrder.historical_context = {
        related_tasks: regressionInfo.related_tasks,
        previous_learnings: regressionInfo.context_summary || 'No direct prior failure hotspots identified.',
        past_root_causes: regressionInfo.past_root_causes,
        warnings: regressionInfo.warnings,
        regression_risk: regressionInfo.regression_risk
      };

      // Initialize state via TaskLifecycle (Plan -> AWAITING_APPROVAL)
      const initialState = options.autoApprove ? 'APPROVED' : 'AWAITING_APPROVAL';
      TaskLifecycle.transition(workOrder, initialState, {
        worker: 'manager',
        reason: options.autoApprove ? 'Auto-approved for execution' : 'Planned by Main Manager (Awaiting human approval)'
      });

      workOrders.push(workOrder);
    }

    // Persist work orders to active queue
    for (const wo of workOrders) {
      const targetFile = path.join(ACTIVE_DIR, `${wo.task_id}.json`);
      fs.writeFileSync(targetFile, JSON.stringify(wo, null, 2), 'utf-8');
      console.log(`📝 Work order persisted: ${targetFile}`);
    }

    return {
      ok: true,
      workOrders,
      risk: workOrders[0]?.risk || { level: 'MEDIUM', reasons: [] },
      regression: regressionInfo,
      status: options.autoApprove ? 'APPROVED' : 'AWAITING_APPROVAL'
    };
  }
}

module.exports = Planner;
