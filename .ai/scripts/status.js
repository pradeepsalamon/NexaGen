#!/usr/bin/env node
/**
 * Nexa AI Development System — Phase 9 Observability CLI (Status Dashboard V2)
 * Displays comprehensive multi-worker pool status, approval state, risk breakdown,
 * worktrees, queues, dependency graph state, dev services, and safety boundaries.
 */

const fs = require('fs');
const path = require('path');
const ProjectContextEngine = require('../manager/project-context');
const DependencyGraph = require('../manager/dependency-graph');
const WorktreeManager = require('../manager/worktree-manager');

const DEV_ROOT = path.resolve(__dirname, '../..');
const ACTIVE_DIR = path.join(DEV_ROOT, '.ai', 'tasks', 'active');
const COMPLETED_DIR = path.join(DEV_ROOT, '.ai', 'tasks', 'completed');
const FAILED_DIR = path.join(DEV_ROOT, '.ai', 'tasks', 'failed');
const REVIEWS_DIR = path.join(DEV_ROOT, '.ai', 'reviews');

async function main() {
  const engine = new ProjectContextEngine(DEV_ROOT);
  const summary = engine.getProjectContextSummary();
  const wm = new WorktreeManager(DEV_ROOT);
  const worktrees = wm.listWorktrees();

  console.log('============================================================');
  console.log('               NEXAGEN AI DEVELOPMENT SYSTEM');
  console.log('============================================================');
  console.log(`Manager:       READY`);
  console.log(`Provider:      ${summary.worker.provider}`);
  console.log(`Scheduler:     READY (CLI / Filesystem DAG Worktree Parallelism)`);
  console.log(`Mode:          PLAN -> APPROVE -> EXECUTE -> REVIEW (Human Authority)`);

  // Load active tasks
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

  const reviewDocsCount = fs.existsSync(REVIEWS_DIR)
    ? fs.readdirSync(REVIEWS_DIR).filter(f => f.endsWith('.md')).length
    : 0;

  // Approval breakdowns
  const awaitingApproval = activeTasks.filter(t => t.status === 'AWAITING_APPROVAL' || t.status === 'PLANNED').length;
  const approvedTasks = activeTasks.filter(t => t.status === 'APPROVED' || t.status === 'READY').length;
  const reviewRequired = activeTasks.filter(t => t.status === 'REVIEW_REQUIRED').length;
  const mergeReady = activeTasks.filter(t => t.status === 'MERGE_READY').length;

  console.log('\nHUMAN APPROVAL GATES');
  console.log('--------------------------------');
  console.log(`Awaiting Approval: ${awaitingApproval}`);
  console.log(`Approved:          ${approvedTasks}`);
  console.log(`Review Required:   ${reviewRequired}`);
  console.log(`Merge Ready:       ${mergeReady}`);
  console.log(`Review Packages:   ${reviewDocsCount} (.ai/reviews/*.md)`);

  console.log('\nWORKERS (Pool & Worktrees)');
  console.log('--------------------------------');
  const pool = summary.worker.workers_pool || [];
  if (pool.length === 0) {
    console.log('  No workers registered in pool.');
  } else {
    for (const w of pool) {
      const statusIcon = w.status === 'AVAILABLE' ? '🟢' : w.status === 'BUSY' ? '🟡' : '🔴';
      const wtInfo = worktrees.find(wt => wt.worker_id === w.worker_id);
      console.log(`  ${statusIcon} Worker:        ${w.worker_id} (${w.name || 'Coding Worker'})`);
      console.log(`     Status:        ${w.status}`);
      console.log(`     Current Task:  ${w.current_task || 'None'}`);
      console.log(`     Worktree:      ${w.worktree_path || wtInfo?.worktree_path || `.worktrees/${w.worker_id}`}`);
      console.log(`     Branch:        ${w.branch || wtInfo?.branch || 'None'}`);
      console.log(`     Capabilities:  [${w.capabilities.join(', ')}]`);
      if (w.pulse_age_seconds !== null) {
        console.log(`     Heartbeat:     ${w.pulse_age_seconds}s ago`);
      }
      console.log('');
    }
  }

  // Worktree Pool Summary
  const wtTotal = worktrees.length;
  const wtAvailable = worktrees.filter(wt => wt.status === 'AVAILABLE' || wt.status === 'READY').length;
  const wtAssigned = worktrees.filter(wt => wt.status === 'ASSIGNED' || wt.status === 'RUNNING').length;
  const wtDirty = worktrees.filter(wt => wt.status === 'DIRTY').length;
  const wtOrphaned = worktrees.filter(wt => wt.status === 'ORPHANED').length;
  const wtInvalid = worktrees.filter(wt => wt.status === 'INVALID').length;

  console.log('WORKTREES');
  console.log('--------------------------------');
  console.log(`Total:         ${wtTotal}`);
  console.log(`Available:     ${wtAvailable}`);
  console.log(`Assigned:      ${wtAssigned}`);
  console.log(`Dirty:         ${wtDirty}`);
  console.log(`Orphaned:      ${wtOrphaned}`);
  console.log(`Invalid:       ${wtInvalid}`);

  const graph = new DependencyGraph(activeTasks);
  const runnable = graph.getRunnableTasks(completedIds, runningIds);
  const blocked = graph.getBlockedTasks(completedIds, failedIds);
  const queued = activeTasks.filter(t => !runningIds.has(t.task_id) && !runnable.some(r => r.task_id === t.task_id));

  console.log('\nTASK QUEUE');
  console.log('--------------------------------');
  console.log(`Runnable:      ${runnable.length}`);
  console.log(`Waiting:       ${queued.length}`);
  console.log(`Running:       ${runningIds.size}`);
  console.log(`Completed:     ${completedIds.size}`);
  console.log(`Failed:        ${failedIds.size}`);

  // Risk breakdown
  const riskLow = activeTasks.filter(t => (t.impact || t.risk?.level) === 'LOW').length;
  const riskMed = activeTasks.filter(t => (t.impact || t.risk?.level) === 'MEDIUM').length;
  const riskHigh = activeTasks.filter(t => (t.impact || t.risk?.level) === 'HIGH').length;
  const riskCrit = activeTasks.filter(t => (t.impact || t.risk?.level) === 'CRITICAL').length;

  console.log('\nRISK BREAKDOWN');
  console.log('--------------------------------');
  console.log(`Low:           ${riskLow}`);
  console.log(`Medium:        ${riskMed}`);
  console.log(`High:          ${riskHigh}`);
  console.log(`Critical:      ${riskCrit}`);

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
  console.log(`Shared Repository: PROTECTED (Isolated Git Worktrees)`);
  console.log(`Production Access: ${summary.safety_boundaries.production_access}`);
  console.log(`Production DB:     ${summary.safety_boundaries.production_db}`);
  console.log(`Production Docker: ${summary.safety_boundaries.production_docker}`);
  console.log(`Redis Scope:       ${summary.safety_boundaries.redis_scope}`);
  console.log(`LiveKit Scope:     ${summary.safety_boundaries.livekit_scope}`);

  console.log('============================================================\n');
}

main().catch(err => {
  console.error('❌ Status Error:', err.message);
  process.exit(1);
});
