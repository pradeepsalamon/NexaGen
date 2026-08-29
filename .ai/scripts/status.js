#!/usr/bin/env node
/**
 * Nexa AI Development System — Phase 6 Observability CLI
 * Displays comprehensive multi-worker pool status, queues, dependency graph state, dev services, and safety.
 */

const fs = require('fs');
const path = require('path');
const ProjectContextEngine = require('../manager/project-context');
const DependencyGraph = require('../manager/dependency-graph');

const DEV_ROOT = path.resolve(__dirname, '../..');
const ACTIVE_DIR = path.join(DEV_ROOT, '.ai', 'tasks', 'active');
const COMPLETED_DIR = path.join(DEV_ROOT, '.ai', 'tasks', 'completed');
const FAILED_DIR = path.join(DEV_ROOT, '.ai', 'tasks', 'failed');

async function main() {
  const engine = new ProjectContextEngine(DEV_ROOT);
  const summary = engine.getProjectContextSummary();

  console.log('============================================================');
  console.log('               NEXAGEN AI DEVELOPMENT SYSTEM');
  console.log('============================================================');
  console.log(`Manager:       READY`);
  console.log(`Provider:      ${summary.worker.provider}`);
  console.log(`Scheduler:     READY (CLI / Filesystem DAG)`);

  console.log('\nWORKERS (Pool)');
  console.log('--------------------------------');
  const pool = summary.worker.workers_pool || [];
  if (pool.length === 0) {
    console.log('  No workers registered in pool.');
  } else {
    for (const w of pool) {
      const statusIcon = w.status === 'AVAILABLE' ? '🟢' : w.status === 'BUSY' ? '🟡' : '🔴';
      console.log(`  ${statusIcon} Worker:        ${w.worker_id} (${w.name || 'Coding Worker'})`);
      console.log(`     Status:        ${w.status}`);
      console.log(`     Current Task:  ${w.current_task || 'None'}`);
      console.log(`     Capabilities:  [${w.capabilities.join(', ')}]`);
      console.log(`     Workspace:     ${w.workspace}`);
      if (w.pulse_age_seconds !== null) {
        console.log(`     Heartbeat:     ${w.pulse_age_seconds}s ago`);
      }
      console.log('');
    }
  }

  // Load dependency graph details
  const activeTasks = [];
  if (fs.existsSync(ACTIVE_DIR)) {
    const files = fs.readdirSync(ACTIVE_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        activeTasks.push(JSON.parse(fs.readFileSync(path.join(ACTIVE_DIR, f), 'utf-8')));
      } catch {}
    }
  }

  const completedIds = fs.existsSync(COMPLETED_DIR)
    ? new Set(fs.readdirSync(COMPLETED_DIR).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')))
    : new Set();

  const failedIds = fs.existsSync(FAILED_DIR)
    ? new Set(fs.readdirSync(FAILED_DIR).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')))
    : new Set();

  const runningIds = fs.existsSync(ACTIVE_DIR)
    ? new Set(fs.readdirSync(ACTIVE_DIR).filter(f => f.endsWith('.lock')).map(f => f.replace('.lock', '')))
    : new Set();

  const graph = new DependencyGraph(activeTasks);
  const runnable = graph.getRunnableTasks(completedIds, runningIds);
  const blocked = graph.getBlockedTasks(completedIds, failedIds);
  const queued = activeTasks.filter(t => !runningIds.has(t.task_id) && !runnable.some(r => r.task_id === t.task_id));

  console.log('TASK QUEUE');
  console.log('--------------------------------');
  console.log(`Ready (Runnable):   ${runnable.length}`);
  console.log(`Queued (Waiting):   ${queued.length}`);
  console.log(`Running (Locked):   ${runningIds.size}`);
  console.log(`Blocked on Deps:    ${blocked.length}`);
  console.log(`Completed:          ${completedIds.size}`);
  console.log(`Failed:             ${failedIds.size}`);

  console.log('\nDEPENDENCIES');
  console.log('--------------------------------');
  console.log(`Runnable Tasks:       ${runnable.length > 0 ? runnable.map(r => r.task_id).join(', ') : 'None'}`);
  console.log(`Waiting Tasks:        ${queued.length > 0 ? queued.map(q => q.task_id).join(', ') : 'None'}`);
  console.log(`Blocked Dependencies: ${blocked.length > 0 ? blocked.map(b => `${b.task_id} (needs ${b.pending_dependencies.concat(b.failed_dependencies).join(', ')})`).join(', ') : 'None'}`);

  console.log('\nDEV ENVIRONMENT');
  console.log('--------------------------------');
  console.log(`Branch:        ${summary.git.current_branch}`);
  console.log(`Web:           :3010 ${summary.services.web_3010 ? 'UP ✅' : 'DOWN ❌'}`);
  console.log(`API:           :3011 ${summary.services.api_3011 ? 'UP ✅' : 'DOWN ❌'}`);
  console.log(`PostgreSQL:    vps_dev ${summary.services.postgres_dev ? 'UP ✅' : 'DOWN ❌'}`);
  console.log(`Redis:         ${summary.services.redis_shared ? 'UP ✅' : 'DOWN ❌'}`);
  console.log(`LiveKit:       ${summary.services.livekit_shared ? 'UP ✅' : 'DOWN ❌'}`);

  console.log('\nSAFETY');
  console.log('--------------------------------');
  console.log(`Production Access: ${summary.safety_boundaries.production_access}`);
  console.log(`Production DB:     ${summary.safety_boundaries.production_db}`);
  console.log(`Production Docker: ${summary.safety_boundaries.production_docker}`);
  console.log(`Redis Scope:       ${summary.safety_boundaries.redis_scope}`);
  console.log(`LiveKit Scope:     ${summary.safety_boundaries.livekit_scope}`);

  if (summary.tasks.last_task) {
    console.log('\nLast task:');
    console.log(`[${summary.tasks.last_task.task_id}] ${summary.tasks.last_task.title}`);
    console.log(`Status: ${summary.tasks.last_task.status}`);
  }

  console.log('============================================================\n');
}

main().catch(err => {
  console.error('❌ Status Error:', err.message);
  process.exit(1);
});
