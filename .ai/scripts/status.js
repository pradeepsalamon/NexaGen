#!/usr/bin/env node
/**
 * Nexa AI Development System — Phase 5 Observability CLI
 * Displays clean, comprehensive status of Manager, Worker, DEV environment, queues, and safety.
 */

const ProjectContextEngine = require('../manager/project-context');

async function main() {
  const engine = new ProjectContextEngine();
  const summary = engine.getProjectContextSummary();

  console.log('============================================================');
  console.log('               NEXAGEN AI DEVELOPMENT SYSTEM');
  console.log('============================================================');
  console.log(`Manager:       READY`);
  console.log(`Provider:      ${summary.worker.provider}`);
  console.log(`Worker:        ${summary.worker.status} (${summary.worker.worker_id})`);

  console.log('\nDEV ENVIRONMENT');
  console.log('--------------------------------');
  console.log(`Branch:        ${summary.git.current_branch}`);
  console.log(`Web:           :3010 ${summary.services.web_3010 ? 'UP ✅' : 'DOWN ❌'}`);
  console.log(`API:           :3011 ${summary.services.api_3011 ? 'UP ✅' : 'DOWN ❌'}`);
  console.log(`PostgreSQL:    vps_dev ${summary.services.postgres_dev ? 'UP ✅' : 'DOWN ❌'}`);
  console.log(`Redis:         ${summary.services.redis_shared ? 'UP ✅' : 'DOWN ❌'}`);
  console.log(`LiveKit:       ${summary.services.livekit_shared ? 'UP ✅' : 'DOWN ❌'}`);

  console.log('\nTASK QUEUE');
  console.log('--------------------------------');
  console.log(`Active:        ${summary.tasks.active_count}`);
  console.log(`Completed:     ${summary.tasks.completed_count}`);
  console.log(`Failed:        ${summary.tasks.failed_count}`);

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
