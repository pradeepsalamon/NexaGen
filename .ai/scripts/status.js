#!/usr/bin/env node
/**
 * Nexa AI Development System — System Status & Observability CLI
 * Displays health across Manager, Worker, DEV Runtime, Shared Redis, Shared LiveKit, and Task Queues.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const http = require('http');

const DEV_ROOT = path.resolve(__dirname, '../..');
const AI_DIR = path.join(DEV_ROOT, '.ai');
const TASKS_DIR = path.join(AI_DIR, 'tasks');
const ACTIVE_DIR = path.join(TASKS_DIR, 'active');
const COMPLETED_DIR = path.join(TASKS_DIR, 'completed');
const FAILED_DIR = path.join(TASKS_DIR, 'failed');
const REGISTRY_FILE = path.join(AI_DIR, 'workers', 'registry.json');
const HEARTBEAT_FILE = path.join(AI_DIR, 'workers', 'heartbeat.json');
const STATE_FILE = path.join(AI_DIR, 'workers', 'state.json');

function checkHttpService(port, pathname = '/') {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: pathname, timeout: 1500 }, res => {
      resolve({ up: true, statusCode: res.statusCode });
    });
    req.on('error', () => resolve({ up: false }));
    req.on('timeout', () => { req.destroy(); resolve({ up: false }); });
  });
}

function checkPostgres() {
  try {
    const out = execSync('docker exec nexa_postgres psql -U postgres -d vps_dev -c "SELECT 1;" 2>&1', { timeout: 2000, encoding: 'utf-8' });
    return out.includes('1');
  } catch {
    return false;
  }
}

function checkRedis() {
  try {
    const out = execSync('docker exec nexa_redis redis-cli ping 2>&1', { timeout: 1500, encoding: 'utf-8' });
    return out.includes('PONG');
  } catch {
    return false;
  }
}

function checkLiveKit() {
  try {
    const out = execSync('nc -z 127.0.0.1 7880 2>&1', { timeout: 1500, encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('============================================================');
  console.log('            NEXA AI DEVELOPMENT SYSTEM STATUS');
  console.log('============================================================');

  let workerStatus = 'AVAILABLE';
  let currentTask = 'None';
  let tasksCompleted = 0;
  let tasksFailed = 0;
  let provider = 'GEMINI';

  if (fs.existsSync(REGISTRY_FILE)) {
    try {
      const reg = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
      const worker = reg.workers?.[0];
      if (worker) {
        workerStatus = worker.status || 'AVAILABLE';
        currentTask = worker.current_task || 'None';
        tasksCompleted = worker.tasks_completed || 0;
        tasksFailed = worker.tasks_failed || 0;
        provider = (worker.provider || 'gemini').toUpperCase();
      }
    } catch {}
  }

  // Check DEV services
  const webStatus = await checkHttpService(3010);
  const apiStatus = await checkHttpService(3011, '/api/health');
  const pgStatus = checkPostgres();
  const redisStatus = checkRedis();
  const lkStatus = checkLiveKit();

  console.log(`Manager:         READY`);
  console.log(`Worker:          ${workerStatus} (nexa-dev-01)`);
  console.log(`Provider:        ${provider}`);
  console.log(`DEV ROOT:        OK (${DEV_ROOT})`);
  console.log(`DEV WEB (:3010): ${webStatus.up ? 'UP ✅' : 'DOWN ⚠️'}`);
  console.log(`DEV API (:3011): ${apiStatus.up ? 'UP ✅' : 'DOWN ⚠️'}`);
  console.log(`DEV DB (vps_dev):${pgStatus ? 'OK ✅' : 'ERROR ❌'}`);
  console.log(`REDIS (shared):  ${redisStatus ? 'OK ✅' : 'ERROR ❌'}`);
  console.log(`LIVEKIT (shared):${lkStatus ? 'OK ✅' : 'DOWN ⚠️'}`);
  console.log('------------------------------------------------------------');

  // Task Queues
  const activeTasks = fs.existsSync(ACTIVE_DIR) ? fs.readdirSync(ACTIVE_DIR).filter(f => f.endsWith('.json')) : [];
  const completedTasks = fs.existsSync(COMPLETED_DIR) ? fs.readdirSync(COMPLETED_DIR).filter(f => f.endsWith('.json')) : [];
  const failedTasks = fs.existsSync(FAILED_DIR) ? fs.readdirSync(FAILED_DIR).filter(f => f.endsWith('.json')) : [];

  console.log(`Active Tasks (${activeTasks.length}):`);
  if (activeTasks.length === 0) {
    console.log('  (None)');
  } else {
    activeTasks.forEach(f => {
      try {
        const t = JSON.parse(fs.readFileSync(path.join(ACTIVE_DIR, f), 'utf-8'));
        const locked = fs.existsSync(path.join(ACTIVE_DIR, f.replace('.json', '.lock')));
        console.log(`  - [${t.task_id}] ${t.title} (${t.priority}) [${locked ? 'LOCKED 🔒' : 'QUEUED ⏳'}]`);
      } catch {
        console.log(`  - ${f}`);
      }
    });
  }

  console.log(`\nCompleted Tasks (${completedTasks.length}):`);
  if (completedTasks.length === 0) {
    console.log('  (None)');
  } else {
    completedTasks.slice(-3).forEach(f => {
      try {
        const t = JSON.parse(fs.readFileSync(path.join(COMPLETED_DIR, f), 'utf-8'));
        console.log(`  - [${t.task_id}] ${t.summary} (${t.completed_at})`);
      } catch {
        console.log(`  - ${f}`);
      }
    });
    if (completedTasks.length > 3) console.log(`  ... and ${completedTasks.length - 3} more`);
  }

  console.log(`\nFailed Tasks (${failedTasks.length}):`);
  if (failedTasks.length === 0) {
    console.log('  (None)');
  } else {
    failedTasks.slice(-3).forEach(f => {
      try {
        const t = JSON.parse(fs.readFileSync(path.join(FAILED_DIR, f), 'utf-8'));
        console.log(`  - [${t.task_id}] ${t.reason || t.summary} (${t.failed_at})`);
      } catch {
        console.log(`  - ${f}`);
      }
    });
  }

  console.log('------------------------------------------------------------');
  console.log('Worker Heartbeat:');
  if (fs.existsSync(HEARTBEAT_FILE)) {
    try {
      const hb = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf-8'));
      const ageSec = Math.floor((Date.now() - new Date(hb.timestamp).getTime()) / 1000);
      console.log(`  PID:       ${hb.pid}`);
      console.log(`  Task:      ${hb.task_id || 'None'}`);
      console.log(`  Phase:     ${hb.phase || 'IDLE'}`);
      console.log(`  Pulse Age: ${ageSec}s ago (${ageSec > 60 ? 'STALE ⚠️' : 'FRESH ✅'})`);
    } catch {
      console.log('  (Heartbeat file unreadable)');
    }
  } else {
    console.log('  (Worker idle, no active pulse)');
  }
  console.log('============================================================\n');
}

main().catch(err => {
  console.error('❌ Error retrieving status:', err.message);
  process.exit(1);
});
