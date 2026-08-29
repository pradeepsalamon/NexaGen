#!/usr/bin/env node
/**
 * Nexa AI Development System — Phase 3 Main AI Manager
 * Central orchestration, planning, task dispatch, and completion review coordinator.
 */

const fs = require('fs');
const path = require('path');
const Planner = require('./planner');
const Dispatcher = require('./dispatcher');
const Reviewer = require('./reviewer');
const GeminiProvider = require('./providers/gemini-provider');

const DEV_ROOT = path.resolve(__dirname, '../..');
const AI_DIR = path.join(DEV_ROOT, '.ai');
const STATE_DIR = path.join(AI_DIR, 'manager', 'state');
const SESSION_FILE = path.join(STATE_DIR, 'session.json');

class MainManager {
  constructor() {
    this.provider = new GeminiProvider();
    this.planner = new Planner(this.provider);
    this.dispatcher = new Dispatcher('nexa-dev-01');
    this.reviewer = new Reviewer(this.provider);

    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
  }

  /**
   * Records session state to disk.
   */
  saveSession(data) {
    try {
      const existing = fs.existsSync(SESSION_FILE) ? JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8')) : {};
      const updated = {
        ...existing,
        ...data,
        last_updated: new Date().toISOString()
      };
      fs.writeFileSync(SESSION_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    } catch {}
  }

  /**
   * Displays status banner.
   */
  showBanner() {
    console.log('============================================================');
    console.log('       Nexa AI Development System — Main AI Manager');
    console.log('       Role:        PLANNER • DISPATCHER • REVIEWER');
    console.log('       Worker:      nexa-dev-01 (Gemini)');
    console.log('       Environment: DEVELOPMENT ONLY (/opt/nexa-chess/NexaGen-dev)');
    console.log('============================================================\n');
  }

  /**
   * Shows manager and system status.
   */
  showStatus() {
    this.showBanner();
    const workerStatus = this.dispatcher.getWorkerStatus();
    console.log('── Manager & Worker Status ──');
    console.log(`  Manager Status:  READY`);
    console.log(`  Worker ID:       ${this.dispatcher.workerId}`);
    console.log(`  Worker State:    ${workerStatus.status || 'UNKNOWN'}`);
    console.log(`  Active Task:     ${workerStatus.current_task || 'None'}`);

    const activeTasks = fs.existsSync(path.join(AI_DIR, 'tasks', 'active'))
      ? fs.readdirSync(path.join(AI_DIR, 'tasks', 'active')).filter(f => f.endsWith('.json'))
      : [];
    console.log(`  Active Queue:    ${activeTasks.length} task(s)`);

    if (fs.existsSync(SESSION_FILE)) {
      try {
        const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
        console.log(`  Last Handled:    ${session.last_task_id || 'None'}`);
      } catch {}
    }
    console.log('');
  }

  /**
   * Orchestrates a complete user request lifecycle:
   * Request -> Plan -> Work Order -> Dispatch -> Review -> Summary
   */
  async handleUserRequest(userPrompt) {
    this.showBanner();
    console.log(`👤 User Request:\n   "${userPrompt}"\n`);

    // 1. Planning Phase
    console.log('── [PHASE 1: PLANNING] Analyzing Request & Formulating Work Orders ──');
    const planResult = await this.planner.plan(userPrompt);
    if (!planResult.ok) {
      console.error(`\n❌ Request Rejected: [${planResult.code}]`);
      console.error(`   ${planResult.reason}\n`);
      return { ok: false, code: planResult.code, reason: planResult.reason };
    }

    const { workOrders } = planResult;
    console.log(`\n✅ Generated ${workOrders.length} work order(s).`);

    const results = [];

    // 2. Dispatch & Execution Phase
    for (const wo of workOrders) {
      console.log(`\n── [PHASE 2: DISPATCH] Task ${wo.task_id}: "${wo.title}" ──`);
      
      this.saveSession({
        current_task_id: wo.task_id,
        current_title: wo.title,
        status: 'DISPATCHED'
      });

      const dispatchResult = await this.dispatcher.dispatch(wo.task_id);
      if (!dispatchResult.ok) {
        console.error(`\n❌ Dispatch failed for ${wo.task_id}: ${dispatchResult.reason || dispatchResult.error}`);
        return { ok: false, task_id: wo.task_id, code: dispatchResult.code, error: dispatchResult.error };
      }

      // In Phase 3: Worker execution was triggered; now we perform the manager review
      console.log(`\n── [PHASE 3: REVIEW] Auditing Completion for ${wo.task_id} ──`);
      const reviewResult = await this.reviewer.review(wo.task_id);
      results.push(reviewResult);

      if (reviewResult.verdict === 'ACCEPTED') {
        console.log(`\n` + reviewResult.human_summary);
      } else if (reviewResult.verdict === 'FAILED') {
        console.log(`\n### ❌ Task ${wo.task_id} Failed\n**Reason:** ${reviewResult.reason}\n**Details:** ${reviewResult.error_details}\n**Recommendation:** ${reviewResult.recommendation}`);
      } else if (reviewResult.needs_follow_up) {
        console.log(`\n⚠️ Task ${wo.task_id} completed with unmet criteria. Creating follow-up task...`);
        const followUpOrder = await this.reviewer.createFollowUp(wo.task_id, reviewResult.reason, this.planner);
        console.log(`   Follow-up queued: ${followUpOrder.task_id}`);
      }

      this.saveSession({
        last_task_id: wo.task_id,
        status: reviewResult.verdict
      });
    }

    return { ok: true, results };
  }
}

// CLI handler
async function main() {
  const manager = new MainManager();
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    manager.showBanner();
    console.log('Usage:');
    console.log('  npm run ai:manager -- "<user_request>"       Execute full planning & orchestration workflow');
    console.log('  npm run ai:manager -- --status               Display manager & worker queue status');
    console.log('  npm run ai:manager -- --plan "<request>"     Plan and generate work order without executing');
    console.log('  npm run ai:manager -- --dispatch <TASK_ID>   Dispatch specific task to worker');
    console.log('  npm run ai:manager -- --review <TASK_ID>     Review completed task report');
    console.log('');
    return;
  }

  if (args.includes('--status')) {
    manager.showStatus();
    return;
  }

  if (args.includes('--plan')) {
    manager.showBanner();
    const promptIdx = args.indexOf('--plan') + 1;
    const prompt = args[promptIdx] || args[args.length - 1];
    const planResult = await manager.planner.plan(prompt);
    if (!planResult.ok) {
      console.error(`❌ Planning failed: [${planResult.code}] ${planResult.reason}`);
      process.exit(1);
    }
    console.log('\n✅ Plan generated successfully:');
    console.log(JSON.stringify(planResult.workOrders, null, 2));
    return;
  }

  if (args.includes('--dispatch')) {
    manager.showBanner();
    const taskIdx = args.indexOf('--dispatch') + 1;
    const taskId = args[taskIdx];
    if (!taskId) {
      console.error('❌ Error: Task ID required for --dispatch');
      process.exit(1);
    }
    const result = await manager.dispatcher.dispatch(taskId);
    if (!result.ok) {
      console.error(`❌ Dispatch failed: ${result.reason || result.error}`);
      process.exit(1);
    }
    console.log('✅ Task dispatched successfully.');
    return;
  }

  if (args.includes('--review')) {
    manager.showBanner();
    const taskIdx = args.indexOf('--review') + 1;
    const taskId = args[taskIdx];
    if (!taskId) {
      console.error('❌ Error: Task ID required for --review');
      process.exit(1);
    }
    const reviewResult = await manager.reviewer.review(taskId);
    console.log('\n' + (reviewResult.human_summary || JSON.stringify(reviewResult, null, 2)));
    return;
  }

  // Treat remaining string as user prompt
  const userPrompt = args.filter(a => !a.startsWith('--')).join(' ');
  if (!userPrompt) {
    console.error('❌ Error: Please provide a valid user request.');
    process.exit(1);
  }

  await manager.handleUserRequest(userPrompt);
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Main Manager Error:', err.message);
    process.exit(1);
  });
}

module.exports = MainManager;
