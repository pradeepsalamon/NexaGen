/**
 * Nexa AI Development System — Phase 4 Main Manager Planner
 * Handles request analysis, safety pre-check, task decomposition, and work order creation.
 */

const fs = require('fs');
const path = require('path');
const GeminiProvider = require('./providers/gemini-provider');
const ProjectContextEngine = require('./project-context');

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
   * Safety pre-check against production modifications or unsafe requests.
   */
  preCheckSafety(userPrompt) {
    if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim().length === 0) {
      return { ok: false, code: 'BLOCKED_INVALID_REQUEST', reason: 'User prompt cannot be empty' };
    }

    const promptLower = userPrompt.toLowerCase();

    // Production targeting check
    if (/\b(production|prod|deploy to prod|nexa_chess|nexa_web|nexa_api container)\b/i.test(promptLower) &&
        /\b(deploy|drop|delete|restart|stop|modify|change|migrate)\b/i.test(promptLower)) {
      return {
        ok: false,
        code: 'BLOCKED_PRODUCTION_CHANGE',
        reason: 'Manager cannot target or modify production infrastructure. Work is strictly restricted to development.'
      };
    }

    // System destruction check
    if (/\brm\s+-rf\s+(\/|~|\.\.)/i.test(promptLower) ||
        /\b(flushall|flushdb|drop database|iptables\s+-f|ufw\s+disable)\b/i.test(promptLower)) {
      return {
        ok: false,
        code: 'BLOCKED_UNSAFE_REQUEST',
        reason: 'Requested action contains destructive system operations that are strictly prohibited.'
      };
    }

    return { ok: true };
  }

  /**
   * Determines if a complex request should be decomposed into multiple tasks.
   */
  detectDecomposition(userPrompt) {
    const subTasks = [];
    const numberedMatch = userPrompt.match(/(?:^|\n)\s*(?:\d+[\.\)]|\-|\*)\s*(.+)/g);

    if (numberedMatch && numberedMatch.length >= 2) {
      for (const item of numberedMatch) {
        const cleaned = item.replace(/^\s*(?:\d+[\.\)]|\-|\*)\s*/, '').trim();
        if (cleaned.length > 5) subTasks.push(cleaned);
      }
    }

    return subTasks;
  }

  /**
   * Creates one or more work orders from a user prompt.
   */
  async plan(userPrompt) {
    const safety = this.preCheckSafety(userPrompt);
    if (!safety.ok) {
      return { ok: false, code: safety.code, reason: safety.reason };
    }

    const subPrompts = this.detectDecomposition(userPrompt);
    const workOrders = [];

    if (subPrompts.length >= 2) {
      console.log(`\n🧩 Complex request detected. Decomposing into ${subPrompts.length} sequential tasks:`);
      for (let i = 0; i < subPrompts.length; i++) {
        const subPrompt = subPrompts[i];
        const taskId = this.getNextTaskId();
        console.log(`   Task ${i + 1}/${subPrompts.length}: [${taskId}] ${subPrompt}`);

        const plan = await this.provider.analyzeRequest(subPrompt, this.projectContext);
        const workOrder = await this.provider.generateWorkOrder(plan, { taskId, attempt: 1, max_attempts: 2 });
        
        if (i > 0) {
          workOrder.dependencies = [workOrders[i - 1].task_id];
        }

        workOrders.push(workOrder);
      }
    } else {
      const taskId = this.getNextTaskId();
      const plan = await this.provider.analyzeRequest(userPrompt, this.projectContext);
      const workOrder = await this.provider.generateWorkOrder(plan, { taskId, attempt: 1, max_attempts: 2 });
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
