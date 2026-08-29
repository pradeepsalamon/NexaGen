/**
 * Nexa AI Development System — Phase 8 Main Manager Planner
 * Handles request analysis, safety pre-check, smart task decomposition,
 * acceptance criteria formulation, impact assessment, and work order creation.
 */

const fs = require('fs');
const path = require('path');
const GeminiProvider = require('./providers/gemini-provider');
const ProjectContextEngine = require('./project-context');
const TaskLifecycle = require('./task-lifecycle');

const DEV_ROOT = path.resolve(__dirname, '../..');
const AI_DIR = path.join(DEV_ROOT, '.ai');
const TASKS_DIR = path.join(AI_DIR, 'tasks');
const ACTIVE_DIR = path.join(TASKS_DIR, 'active');
const COUNTER_FILE = path.join(TASKS_DIR, 'counter.txt');

class Planner {
  constructor(provider = null, contextEngine = null) {
    this.provider = provider || new GeminiProvider();
    this.contextEngine = contextEngine || new ProjectContextEngine();
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

    const promptLower = userPrompt.toLowerCase();

    // Production targeting check
    if (
      /\b(production|prod|deploy to prod|nexa_chess|nexa_web|nexa_api container)\b/i.test(promptLower) &&
      /\b(deploy|drop|delete|restart|stop|modify|change|migrate)\b/i.test(promptLower)
    ) {
      return {
        ok: false,
        code: 'BLOCKED_PRODUCTION_CHANGE',
        reason: 'Manager cannot target or modify production infrastructure. Work is strictly restricted to development.'
      };
    }

    // System destruction check
    if (
      /\brm\s+-rf\s+(\/|~|\.\.)/i.test(promptLower) ||
      /\b(flushall|flushdb|drop database|truncate|iptables\s+-f|ufw\s+disable)\b/i.test(promptLower)
    ) {
      return {
        ok: false,
        code: 'BLOCKED_UNSAFE_REQUEST',
        reason: 'Requested action contains destructive database or system operations that are strictly prohibited.'
      };
    }

    return { ok: true };
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
   * impact analysis, and historical context.
   */
  async plan(userPrompt) {
    const safety = this.preCheckSafety(userPrompt);
    if (!safety.ok) {
      return { ok: false, code: safety.code, reason: safety.reason };
    }

    const subPrompts = this.detectDecomposition(userPrompt);
    const workOrders = [];

    // Retrieve relevant historical task context
    const historyInfo = this.contextEngine.getRelevantHistoryForPrompt(userPrompt);

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

        // Set DAG dependencies: Frontend and tests depend on earlier components
        if (i === 1) {
          // Frontend depends on Backend
          workOrder.dependencies = [workOrders[0].task_id];
        } else if (i > 1) {
          // Test/QA depends on all previous
          workOrder.dependencies = workOrders.map(w => w.task_id);
        }

        // Inject historical context
        if (historyInfo.matched) {
          workOrder.historical_context = {
            related_tasks: historyInfo.related_tasks,
            previous_learnings: `Previous related task(s) found: ${historyInfo.context_snippet}. Ensure new work avoids past regression patterns.`,
            warnings: []
          };
        }

        // Assess Impact
        const impact = this.contextEngine.analyzeImpact(subPrompt, workOrder.context?.relevant_files || []);
        workOrder.impact = impact.level;

        // Initialize state via TaskLifecycle
        TaskLifecycle.transition(workOrder, 'PLANNED', { worker: 'manager', reason: 'Task planned by Main Manager' });

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

      // Inject historical context
      if (historyInfo.matched) {
        workOrder.historical_context = {
          related_tasks: historyInfo.related_tasks,
          previous_learnings: `Previous related task(s) found: ${historyInfo.context_snippet}. Inspect previous context before changing.`,
          warnings: []
        };
      }

      // Assess Impact
      const impact = this.contextEngine.analyzeImpact(userPrompt, workOrder.context?.relevant_files || []);
      workOrder.impact = impact.level;

      // Initialize state via TaskLifecycle
      TaskLifecycle.transition(workOrder, 'PLANNED', { worker: 'manager', reason: 'Task planned by Main Manager' });

      workOrders.push(workOrder);
    }

    // Persist work orders to active queue
    for (const wo of workOrders) {
      const targetFile = path.join(ACTIVE_DIR, `${wo.task_id}.json`);
      fs.writeFileSync(targetFile, JSON.stringify(wo, null, 2), 'utf-8');
      console.log(`📝 Work order persisted: ${targetFile}`);
    }

    return { ok: true, workOrders };
  }
}

module.exports = Planner;
