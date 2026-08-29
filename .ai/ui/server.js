#!/usr/bin/env node

/**
 * NexaGen AI Development Control Plane — Standalone Mobile-First Web Server
 * 
 * Port: 3012 (or process.env.PORT)
 * Serves the mobile-first Control Center UI and provides real-time REST endpoints
 * connecting directly to the existing .ai/ manager orchestration layer.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const url = require('url');

const DEV_ROOT = path.resolve(__dirname, '../../');
const AI_DIR = path.join(DEV_ROOT, '.ai');
const TASKS_DIR = path.join(AI_DIR, 'tasks');
const ACTIVE_DIR = path.join(TASKS_DIR, 'active');
const COMPLETED_DIR = path.join(TASKS_DIR, 'completed');
const FAILED_DIR = path.join(TASKS_DIR, 'failed');
const REVIEWS_DIR = path.join(AI_DIR, 'reviews');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Import existing .ai manager modules
const ProjectContextEngine = require(path.join(AI_DIR, 'manager', 'project-context.js'));
const WorkerRegistry = require(path.join(AI_DIR, 'manager', 'worker-registry.js'));
const WorktreeManager = require(path.join(AI_DIR, 'manager', 'worktree-manager.js'));
const MainManager = require(path.join(AI_DIR, 'manager', 'manager.js'));
const TaskLifecycle = require(path.join(AI_DIR, 'manager', 'task-lifecycle.js'));
const RegressionEngine = require(path.join(AI_DIR, 'manager', 'regression-engine.js'));
const Scheduler = require(path.join(AI_DIR, 'manager', 'scheduler.js'));
const Planner = require(path.join(AI_DIR, 'manager', 'planner.js'));

const contextEngine = new ProjectContextEngine(DEV_ROOT);
const registry = new WorkerRegistry();
const worktreeManager = new WorktreeManager(DEV_ROOT);
const manager = new MainManager();
const regressionEngine = new RegressionEngine();
const planner = new Planner(null, contextEngine, regressionEngine);
const scheduler = new Scheduler(registry);

const PORT = parseInt(process.env.PORT || '3012', 10);
const HOST = process.env.HOST || '0.0.0.0';

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function getAllTasks(filterStatus, search) {
  const tasks = [];
  const loadDir = (dir, defaultStatus) => {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
        const data = JSON.parse(raw);
        tasks.push({
          id: data.task_id || file.replace('.json', ''),
          taskId: data.task_id || file.replace('.json', ''),
          title: data.title || data.summary || 'Untitled Task',
          objective: data.objective || data.summary || '',
          status: (data.status || data.current_state || defaultStatus).toUpperCase(),
          impact: (data.impact || data.risk?.level || 'MEDIUM').toUpperCase(),
          risk: data.risk || { level: data.impact || 'MEDIUM', reasons: [] },
          workerId: data.assigned_worker || data.worker_id || null,
          worktreePath: data.worktree_path || null,
          branch: data.task_branch || data.git?.branch || null,
          attempt: data.attempt || 1,
          maxAttempts: data.max_attempts || 2,
          dependencies: data.dependencies || [],
          acceptanceCriteria: data.acceptance_criteria || [],
          tests: data.tests || null,
          filesChanged: (data.files_changed || []).map(f => typeof f === 'string' ? f : f.path),
          historical_context: data.historical_context || null,
          createdAt: data.created_at || 'unknown',
          updatedAt: data.updated_at || data.completed_at || data.failed_at || data.created_at || 'unknown'
        });
      } catch {}
    }
  };

  loadDir(ACTIVE_DIR, 'PLANNED');
  loadDir(COMPLETED_DIR, 'COMPLETED');
  loadDir(FAILED_DIR, 'FAILED');

  let result = tasks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  if (filterStatus && filterStatus !== 'ALL') {
    const fUpper = filterStatus.toUpperCase();
    if (fUpper === 'AWAITING_APPROVAL') {
      result = result.filter(t => t.status === 'AWAITING_APPROVAL' || t.status === 'PLANNED');
    } else if (fUpper === 'RUNNING') {
      result = result.filter(t => TaskLifecycle.isActive(t.status));
    } else {
      result = result.filter(t => t.status === fUpper);
    }
  }

  if (search && search.trim()) {
    const q = search.toLowerCase();
    result = result.filter(t =>
      t.id.toLowerCase().includes(q) ||
      t.title.toLowerCase().includes(q) ||
      t.objective.toLowerCase().includes(q) ||
      (t.workerId && t.workerId.toLowerCase().includes(q))
    );
  }

  return result;
}

function getTaskById(taskId) {
  const activeFile = path.join(ACTIVE_DIR, `${taskId}.json`);
  const completedFile = path.join(COMPLETED_DIR, `${taskId}.json`);
  const failedFile = path.join(FAILED_DIR, `${taskId}.json`);

  let targetFile = null;
  let defaultStatus = 'PLANNED';

  if (fs.existsSync(activeFile)) {
    targetFile = activeFile;
    defaultStatus = 'PLANNED';
  } else if (fs.existsSync(completedFile)) {
    targetFile = completedFile;
    defaultStatus = 'COMPLETED';
  } else if (fs.existsSync(failedFile)) {
    targetFile = failedFile;
    defaultStatus = 'FAILED';
  }

  if (!targetFile) return null;

  try {
    const data = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
    const reviewPath = path.join(REVIEWS_DIR, `${taskId}.md`);
    let reviewMarkdown = null;
    if (fs.existsSync(reviewPath)) {
      reviewMarkdown = fs.readFileSync(reviewPath, 'utf-8');
    }

    return {
      ...data,
      id: data.task_id || taskId,
      taskId: data.task_id || taskId,
      status: (data.status || data.current_state || defaultStatus).toUpperCase(),
      impact: (data.impact || data.risk?.level || 'MEDIUM').toUpperCase(),
      reviewMarkdown
    };
  } catch {
    return null;
  }
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  try {
    // -------------------------------------------------------------
    // REST API ENDPOINTS
    // -------------------------------------------------------------

    // 1. Dashboard Summary
    if (pathname === '/api/dashboard' && req.method === 'GET') {
      const summary = contextEngine.getProjectContextSummary();
      const worktrees = worktreeManager.listWorktrees();
      const tasks = getAllTasks();

      const awaitingApproval = tasks.filter(t => t.status === 'AWAITING_APPROVAL' || t.status === 'PLANNED').length;
      const running = tasks.filter(t => TaskLifecycle.isActive(t.status)).length;
      const completed = tasks.filter(t => t.status === 'COMPLETED' || t.status === 'MERGE_READY' || t.status === 'HUMAN_APPROVED' || t.status === 'MERGED').length;
      const failed = tasks.filter(t => t.status === 'FAILED' || t.status === 'ESCALATED').length;
      const blocked = tasks.filter(t => t.status === 'BLOCKED' || t.status === 'WAITING_DEPENDENCY').length;
      const highRisk = tasks.filter(t => (t.impact === 'HIGH' || t.impact === 'CRITICAL') && t.status !== 'COMPLETED').length;

      const workers = (summary.worker.workers_pool || []).map(w => {
        const wt = worktrees.find(item => item.worker_id === w.worker_id);
        return {
          id: w.worker_id,
          name: w.name || w.worker_id,
          status: w.status,
          capabilities: w.capabilities || [],
          currentTask: w.current_task || null,
          branch: w.branch || wt?.branch || null,
          worktreePath: w.worktree_path || wt?.worktree_path || null,
          pulseAgeSeconds: w.pulse_age_seconds
        };
      });

      return sendJson(res, 200, {
        system: {
          status: 'READY',
          mode: 'PLAN_APPROVE_EXECUTE_REVIEW',
          environment: 'DEVELOPMENT',
          managerReady: true,
          provider: summary.worker.provider || 'GEMINI'
        },
        devHealth: {
          web3010: Boolean(summary.services.web_3010),
          api3011: Boolean(summary.services.api_3011),
          postgresDev: Boolean(summary.services.postgres_dev),
          redisShared: Boolean(summary.services.redis_shared),
          livekitShared: Boolean(summary.services.livekit_shared),
          currentBranch: summary.git.current_branch || 'dev'
        },
        taskCounts: {
          total: tasks.length,
          active: tasks.filter(t => t.status !== 'COMPLETED' && t.status !== 'FAILED').length,
          awaitingApproval,
          running,
          completed,
          failed,
          blocked,
          highRisk
        },
        workers,
        safety: {
          productionAccess: 'BLOCKED',
          productionDb: 'BLOCKED (nexa_chess)',
          productionDocker: 'BLOCKED',
          devDatabase: 'vps_dev (ALLOWED)',
          redisScope: 'nexa:dev:*, nexa:ai:* (SAFE)',
          livekitScope: 'dev-ai-* (DEV ONLY)'
        },
        recentTasks: tasks.slice(0, 5)
      });
    }

    // 2. Tasks List
    if (pathname === '/api/tasks' && req.method === 'GET') {
      const tasks = getAllTasks(query.status, query.search);
      return sendJson(res, 200, tasks);
    }

    // 3. Single Task Details
    const taskMatch = pathname.match(/^\/api\/tasks\/([a-zA-Z0-9_-]+)$/);
    if (taskMatch && req.method === 'GET') {
      const taskId = taskMatch[1];
      const task = getTaskById(taskId);
      if (!task) {
        return sendJson(res, 404, { ok: false, error: `Task ${taskId} not found` });
      }
      return sendJson(res, 200, task);
    }

    // 4. Plan New Task
    if (pathname === '/api/tasks/plan' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.prompt || !body.prompt.trim()) {
        return sendJson(res, 400, { ok: false, reason: 'Prompt cannot be empty' });
      }
      const planResult = await planner.plan(body.prompt, { autoApprove: false });
      return sendJson(res, 200, planResult);
    }

    // 5. Approve Task
    const approveMatch = pathname.match(/^\/api\/tasks\/([a-zA-Z0-9_-]+)\/approve$/);
    if (approveMatch && req.method === 'POST') {
      const taskId = approveMatch[1];
      const result = manager.approveTask(taskId, 'HUMAN_OPERATOR');
      return sendJson(res, 200, result);
    }

    // 6. Approve Plan (DAG)
    const approvePlanMatch = pathname.match(/^\/api\/tasks\/([a-zA-Z0-9_-]+)\/approve-plan$/);
    if (approvePlanMatch && req.method === 'POST') {
      const rootTaskId = approvePlanMatch[1];
      const result = manager.approvePlan(rootTaskId, 'HUMAN_OPERATOR');
      return sendJson(res, 200, result);
    }

    // 7. Reject Task
    const rejectMatch = pathname.match(/^\/api\/tasks\/([a-zA-Z0-9_-]+)\/reject$/);
    if (rejectMatch && req.method === 'POST') {
      const taskId = rejectMatch[1];
      const result = manager.rejectTask(taskId, 'HUMAN_OPERATOR');
      return sendJson(res, 200, result);
    }

    // 8. Run Schedule Cycle
    if (pathname === '/api/schedule' && req.method === 'POST') {
      const cycle = await scheduler.runCycle();
      return sendJson(res, 200, cycle);
    }

    // 9. Workers Pool
    if (pathname === '/api/workers' && req.method === 'GET') {
      const summary = contextEngine.getProjectContextSummary();
      const worktrees = worktreeManager.listWorktrees();
      const workers = (summary.worker.workers_pool || []).map(w => {
        const wt = worktrees.find(item => item.worker_id === w.worker_id);
        return {
          id: w.worker_id,
          name: w.name || w.worker_id,
          status: w.status,
          capabilities: w.capabilities || [],
          currentTask: w.current_task || null,
          branch: w.branch || wt?.branch || null,
          worktreePath: w.worktree_path || wt?.worktree_path || `.worktrees/${w.worker_id}`,
          pulseAgeSeconds: w.pulse_age_seconds,
          tasksCompleted: w.tasks_completed || 0,
          tasksFailed: w.tasks_failed || 0
        };
      });
      return sendJson(res, 200, workers);
    }

    // 10. Reviews List
    if (pathname === '/api/reviews' && req.method === 'GET') {
      const tasks = getAllTasks().filter(t =>
        t.status === 'COMPLETED' ||
        t.status === 'REVIEW_REQUIRED' ||
        t.status === 'MERGE_READY' ||
        t.status === 'ESCALATED'
      );
      const reviews = tasks.map(t => {
        const mdPath = path.join(REVIEWS_DIR, `${t.id}.md`);
        let reviewContent = null;
        if (fs.existsSync(mdPath)) {
          reviewContent = fs.readFileSync(mdPath, 'utf-8');
        }
        return { ...t, reviewContent };
      });
      return sendJson(res, 200, reviews);
    }

    // 11. Environment Details
    if (pathname === '/api/environment' && req.method === 'GET') {
      const summary = contextEngine.getProjectContextSummary();
      return sendJson(res, 200, {
        dev: {
          path: DEV_ROOT,
          branch: summary.git.current_branch,
          webPort: 3010,
          webStatus: summary.services.web_3010 ? 'HEALTHY' : 'DOWN',
          apiPort: 3011,
          apiStatus: summary.services.api_3011 ? 'HEALTHY' : 'DOWN',
          database: 'vps_dev (PostgreSQL 127.0.0.1:5432)',
          dbStatus: summary.services.postgres_dev ? 'HEALTHY' : 'DOWN',
          redisNamespace: 'nexa:dev:*, nexa:ai:* (Active)',
          livekitRooms: 'dev-ai-* (Isolated DEV rooms)'
        },
        production: {
          path: '/opt/nexa-chess/NexaGen',
          branch: 'main',
          status: 'PROTECTED & BLOCKED',
          database: 'nexa_chess (STRICTLY BLOCKED)',
          dockerContainers: '5 Containers Running (UNTOUCHED)',
          webPort: 3000,
          apiPort: 3001
        },
        safetyBoundaries: summary.safety_boundaries
      });
    }

    // -------------------------------------------------------------
    // STATIC FILE SERVING
    // -------------------------------------------------------------
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

    // Normalize path to prevent directory traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // Fallback to index.html for SPA routing
    const fallbackPath = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(fallbackPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(fallbackPath).pipe(res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');

  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { ok: false, error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`============================================================`);
  console.log(`  NexaGen AI Control Center — Mobile-First Web Server`);
  console.log(`  Access URL: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`  Environment: DEVELOPMENT ONLY (/opt/nexa-chess/NexaGen-dev)`);
  console.log(`============================================================`);
});
