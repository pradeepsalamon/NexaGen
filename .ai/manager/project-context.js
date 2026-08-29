/**
 * Nexa AI Development System — Phase 5 Project Context Engine
 * Collects safe, read-only metadata about the development environment,
 * services, git repository, task queues, and workspace architecture.
 *
 * CRITICAL RULE: NEVER EXPOSE SECRETS, CREDENTIALS, OR ENVIRONMENT TOKENS.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEV_ROOT = path.resolve(__dirname, '../..');
const AI_DIR = path.join(DEV_ROOT, '.ai');
const TASKS_ACTIVE_DIR = path.join(AI_DIR, 'tasks', 'active');
const TASKS_COMPLETED_DIR = path.join(AI_DIR, 'tasks', 'completed');
const TASKS_FAILED_DIR = path.join(AI_DIR, 'tasks', 'failed');
const WORKERS_DIR = path.join(AI_DIR, 'workers');
const REGISTRY_FILE = path.join(WORKERS_DIR, 'registry.json');
const HEARTBEAT_FILE = path.join(WORKERS_DIR, 'heartbeat.json');

// Secret patterns to redact
const SENSITIVE_PATTERNS = [
  /password\s*[:=]\s*['"]?[^'"\s]+['"]?/gi,
  /secret\s*[:=]\s*['"]?[^'"\s]+['"]?/gi,
  /jwt_?[a-z0-9_]*\s*[:=]\s*['"]?[^'"\s]+['"]?/gi,
  /api_?key\s*[:=]\s*['"]?[^'"\s]+['"]?/gi,
  /postgres:\/\/[^@]+@/gi,
  /postgresql:\/\/[^@]+@/gi,
  /bearer\s+[a-zA-Z0-9\-_.]+/gi,
  /PRIVATE KEY-----[\s\S]+?-----END/gi
];

class ProjectContextEngine {
  constructor(devRoot = DEV_ROOT) {
    this.devRoot = devRoot;
  }

  /**
   * Sanitizes text or object to prevent any secret exposure.
   */
  static redactSecrets(input) {
    if (typeof input === 'string') {
      let cleaned = input;
      for (const pattern of SENSITIVE_PATTERNS) {
        cleaned = cleaned.replace(pattern, (match) => {
          if (match.includes('://')) return 'postgres://[REDACTED]@';
          const parts = match.split(/[:=]/);
          return parts[0] + '=[REDACTED]';
        });
      }
      return cleaned;
    }
    if (input && typeof input === 'object') {
      const sanitized = Array.isArray(input) ? [] : {};
      for (const [k, v] of Object.entries(input)) {
        const lowerKey = k.toLowerCase();
        if (
          lowerKey.includes('secret') ||
          lowerKey.includes('password') ||
          lowerKey.includes('credential') ||
          lowerKey.includes('token') ||
          lowerKey.includes('apikey') ||
          lowerKey.includes('private_key')
        ) {
          sanitized[k] = '[REDACTED]';
        } else {
          sanitized[k] = ProjectContextEngine.redactSecrets(v);
        }
      }
      return sanitized;
    }
    return input;
  }

  /**
   * Collects Git repository status.
   */
  getGitContext() {
    const gitEnv = { ...process.env, PAGER: 'cat', GIT_PAGER: 'cat' };
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: this.devRoot, encoding: 'utf-8', env: gitEnv, timeout: 2000 }).trim();
      const commit = execSync('git --no-pager log -1 --format="%h %s (%cd)" --date=iso', { cwd: this.devRoot, encoding: 'utf-8', env: gitEnv, timeout: 2000 }).trim();
      const statusRaw = execSync('git status --porcelain', { cwd: this.devRoot, encoding: 'utf-8', env: gitEnv, timeout: 3000 }).trim();
      
      const modifiedFiles = statusRaw
        ? statusRaw.split('\n').map(l => l.trim()).filter(Boolean)
        : [];
      
      const taskBranchesRaw = execSync('git branch --list "ai/*"', { cwd: this.devRoot, encoding: 'utf-8', env: gitEnv, timeout: 2000 }).trim();
      const activeBranches = taskBranchesRaw
        ? taskBranchesRaw.split('\n').map(b => b.replace('*', '').trim()).filter(Boolean)
        : [];

      return {
        ok: true,
        current_branch: branch,
        latest_commit: commit,
        is_clean: modifiedFiles.length === 0,
        uncommitted_files_count: modifiedFiles.length,
        uncommitted_files: modifiedFiles.slice(0, 10),
        active_task_branches: activeBranches
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Checks DEV service availability (Web :3010, API :3011, PostgreSQL vps_dev, Redis, LiveKit :7880).
   */
  getDevServicesContext() {
    const services = {
      web_3010: false,
      api_3011: false,
      postgres_dev: false,
      redis_shared: false,
      livekit_shared: false
    };

    // 1. Web :3010
    try {
      execSync('nc -z 127.0.0.1 3010 2>/dev/null >/dev/null', { timeout: 1000, encoding: 'utf-8' });
      services.web_3010 = true;
    } catch {}

    // 2. API :3011
    try {
      execSync('nc -z 127.0.0.1 3011 2>/dev/null >/dev/null', { timeout: 1000, encoding: 'utf-8' });
      services.api_3011 = true;
    } catch {}

    // 3. PostgreSQL vps_dev
    try {
      const out = execSync('docker exec nexa_postgres psql -U postgres -d vps_dev -c "SELECT 1;" 2>&1', { timeout: 1500, encoding: 'utf-8' });
      services.postgres_dev = out.includes('1');
    } catch {}

    // 4. Redis Shared
    try {
      const out = execSync('docker exec nexa_redis redis-cli ping 2>&1', { timeout: 1500, encoding: 'utf-8' });
      services.redis_shared = out.includes('PONG');
    } catch {}

    // 5. LiveKit
    try {
      execSync('nc -z 127.0.0.1 7880 2>/dev/null >/dev/null', { timeout: 1000, encoding: 'utf-8' });
      services.livekit_shared = true;
    } catch {}

    return services;
  }

  /**
   * Collects task queue statistics and recent tasks.
   */
  getTaskQueueContext() {
    const active = fs.existsSync(TASKS_ACTIVE_DIR)
      ? fs.readdirSync(TASKS_ACTIVE_DIR).filter(f => f.endsWith('.json'))
      : [];

    const completed = fs.existsSync(TASKS_COMPLETED_DIR)
      ? fs.readdirSync(TASKS_COMPLETED_DIR).filter(f => f.endsWith('.json'))
      : [];

    const failed = fs.existsSync(TASKS_FAILED_DIR)
      ? fs.readdirSync(TASKS_FAILED_DIR).filter(f => f.endsWith('.json'))
      : [];

    // Get last completed task
    let lastTask = null;
    if (completed.length > 0) {
      try {
        const sorted = completed.sort((a, b) => {
          const statA = fs.statSync(path.join(TASKS_COMPLETED_DIR, a)).mtimeMs;
          const statB = fs.statSync(path.join(TASKS_COMPLETED_DIR, b)).mtimeMs;
          return statB - statA;
        });
        const latestFile = path.join(TASKS_COMPLETED_DIR, sorted[0]);
        const latestData = JSON.parse(fs.readFileSync(latestFile, 'utf-8'));
        lastTask = {
          task_id: latestData.task_id,
          title: latestData.title || latestData.summary,
          status: 'ACCEPTED',
          completed_at: latestData.completed_at
        };
      } catch {}
    }

    return {
      active_count: active.length,
      active_tasks: active.map(f => f.replace('.json', '')),
      completed_count: completed.length,
      failed_count: failed.length,
      last_task: lastTask
    };
  }

  /**
   * Collects worker pool status from registry and heartbeat.
   */
  getWorkerContext() {
    let workersList = [];
    let activeWorker = null;

    if (fs.existsSync(REGISTRY_FILE)) {
      try {
        const reg = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
        workersList = reg.workers || [];
      } catch {}
    }

    const pool = workersList.map(w => {
      let pulseAgeSeconds = null;
      let isStale = false;
      const hbFile = path.join(path.dirname(REGISTRY_FILE), `heartbeat_${w.worker_id || w.id}.json`);
      const checkFile = fs.existsSync(hbFile) ? hbFile : HEARTBEAT_FILE;

      if (fs.existsSync(checkFile)) {
        try {
          const hb = JSON.parse(fs.readFileSync(checkFile, 'utf-8'));
          if (hb.timestamp) {
            pulseAgeSeconds = Math.round((Date.now() - new Date(hb.timestamp).getTime()) / 1000);
            if (pulseAgeSeconds > 60 && w.status === 'BUSY') {
              isStale = true;
            }
          }
        } catch {}
      }

      return {
        worker_id: w.worker_id || w.id,
        name: w.name,
        status: isStale ? 'STALE' : w.status,
        capabilities: w.capabilities || [],
        current_task: w.current_task,
        workspace: w.workspace || DEV_ROOT,
        heartbeat: w.heartbeat,
        pulse_age_seconds: pulseAgeSeconds
      };
    });

    const primary = pool.find(w => w.worker_id === 'nexa-dev-01') || pool[0] || {
      worker_id: 'nexa-dev-01',
      status: 'AVAILABLE',
      capabilities: ['backend', 'frontend', 'testing']
    };

    return {
      provider: 'GEMINI',
      worker_id: primary.worker_id,
      status: primary.status,
      current_task: primary.current_task,
      pulse_age_seconds: primary.pulse_age_seconds,
      workers_pool: pool
    };
  }

  /**
   * Scans monorepo workspace apps and packages.
   */
  getWorkspaceStructure() {
    const apps = ['apps/api', 'apps/web'];
    const packages = ['packages/config', 'packages/tsconfig', 'packages/types', 'packages/ui', 'packages/utils'];

    return {
      root: this.devRoot,
      apps: apps.filter(a => fs.existsSync(path.join(this.devRoot, a))),
      packages: packages.filter(p => fs.existsSync(path.join(this.devRoot, p)))
    };
  }

  /**
   * Checks overall environment health before task dispatch.
   */
  checkEnvironmentHealth() {
    const missing = [];

    if (!fs.existsSync(this.devRoot)) {
      missing.push(`DEV_ROOT does not exist at ${this.devRoot}`);
    }

    const git = this.getGitContext();
    if (!git.ok) {
      missing.push(`Git repository invalid: ${git.error}`);
    }

    const services = this.getDevServicesContext();
    if (!services.api_3011) {
      missing.push('DEV API (:3011) is unreachable (ensure dev tmux session is running)');
    }
    if (!services.web_3010) {
      missing.push('DEV Web (:3010) is unreachable (ensure dev tmux session is running)');
    }
    if (!services.postgres_dev) {
      missing.push('PostgreSQL dev database (vps_dev) is unreachable');
    }
    if (!services.redis_shared) {
      missing.push('Redis shared service is unreachable');
    }

    const worker = this.getWorkerContext();
    if (worker.status === 'BUSY' && worker.pulse_age_seconds !== null && worker.pulse_age_seconds < 60) {
      missing.push(`Worker is currently busy with task ${worker.current_task}`);
    }

    if (missing.length > 0) {
      return {
        ok: false,
        code: 'BLOCKED_ENVIRONMENT',
        reason: missing.join('; '),
        details: missing
      };
    }

    return {
      ok: true,
      services,
      git,
      worker
    };
  }

  /**
   * Searches historical tasks (completed and failed) for relevant context.
   */
  searchTaskHistory(query = '') {
    const results = [];
    const lowerQuery = query.toLowerCase().trim();

    const scanDir = (dir, statusLabel) => {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(dir, file), 'utf-8');
          const data = JSON.parse(content);
          const searchable = JSON.stringify({
            task_id: data.task_id,
            title: data.title || '',
            objective: data.objective || '',
            summary: data.summary || '',
            changes: data.changes || [],
            files_changed: data.files_changed || []
          }).toLowerCase();

          if (!lowerQuery || searchable.includes(lowerQuery)) {
            results.push({
              task_id: data.task_id,
              title: data.title || data.summary || data.objective || file.replace('.json', ''),
              status: statusLabel,
              type: data.type || (data.reason ? 'failure' : 'feature_implementation'),
              attempt: data.attempt || 1,
              date: data.completed_at || data.failed_at || data.created_at || 'unknown',
              files_changed: (data.files_changed || []).map(f => typeof f === 'string' ? f : f.path),
              summary: ProjectContextEngine.redactSecrets(data.summary || data.error_details || data.reason || 'No summary provided')
            });
          }
        } catch {}
      }
    };

    scanDir(TASKS_COMPLETED_DIR, 'COMPLETED');
    scanDir(TASKS_FAILED_DIR, 'FAILED');

    return results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  /**
   * Analyzes impact classification and coupled areas for a given prompt and file list.
   */
  analyzeImpact(prompt = '', affectedFiles = []) {
    const pLower = prompt.toLowerCase();
    const filesStr = affectedFiles.join(' ').toLowerCase();

    // 1. Critical boundary check
    if (
      /\b(production|nexa_chess|docker\s+stop|drop\s+database|truncate|rm\s+-rf)\b/i.test(pLower) ||
      /\b(jwt_secret|private_key|auth\.guard|credentials)\b/i.test(filesStr)
    ) {
      return {
        level: 'CRITICAL',
        requires_escalation: true,
        reason: 'Touches critical security boundaries, production database, or deployment infrastructure',
        database_impact: /\b(database|migration|prisma|schema)\b/i.test(pLower) || filesStr.includes('prisma'),
        security_impact: true
      };
    }

    // 2. High impact check
    if (
      filesStr.includes('schema.prisma') ||
      filesStr.includes('migrations') ||
      filesStr.includes('packages/types') ||
      filesStr.includes('auth.service') ||
      /\b(database migration|schema change|auth|payment|security)\b/i.test(pLower)
    ) {
      return {
        level: 'HIGH',
        requires_escalation: false,
        reason: 'Modifies core database schema, shared types, or authentication services',
        database_impact: filesStr.includes('prisma') || /\b(database|migration|prisma)\b/i.test(pLower),
        security_impact: filesStr.includes('auth') || pLower.includes('auth')
      };
    }

    // 3. Low impact check
    if (
      filesStr.endsWith('.md') ||
      pLower.startsWith('docs:') ||
      pLower.includes('readme') ||
      pLower.includes('comment') ||
      pLower.includes('format')
    ) {
      return {
        level: 'LOW',
        requires_escalation: false,
        reason: 'Documentation, comment, formatting, or isolated utility helper',
        database_impact: false,
        security_impact: false
      };
    }

    // 4. Default: Medium
    return {
      level: 'MEDIUM',
      requires_escalation: false,
      reason: 'Standard application feature, bug fix, or UI enhancement within development boundary',
      database_impact: false,
      security_impact: false
    };
  }

  /**
   * Retrieves relevant historical task context for a user prompt to prevent regression loops.
   */
  getRelevantHistoryForPrompt(prompt = '') {
    const words = prompt.toLowerCase().replace(/[^a-z0-9_\-\s]/g, '').split(/\s+/).filter(w => w.length >= 4);
    if (words.length === 0) return { matched: false, related_tasks: [] };

    const history = this.searchTaskHistory();
    const matches = [];

    for (const item of history) {
      const itemText = (item.title + ' ' + item.summary + ' ' + (item.files_changed || []).join(' ')).toLowerCase();
      const matchedWords = words.filter(w => itemText.includes(w));
      if (matchedWords.length > 0) {
        matches.push({
          task_id: item.task_id,
          title: item.title,
          status: item.status,
          score: matchedWords.length,
          files_changed: item.files_changed,
          summary: item.summary
        });
      }
    }

    matches.sort((a, b) => b.score - a.score);
    const topMatches = matches.slice(0, 3);

    return {
      matched: topMatches.length > 0,
      related_tasks: topMatches.map(m => m.task_id),
      top_matches: topMatches,
      context_snippet: topMatches.map(m => `[${m.task_id}] (${m.status}): ${m.title}`).join('\n')
    };
  }

  /**
   * Builds complete sanitized metadata summary for Main Manager.
   */
  getProjectContextSummary() {
    return ProjectContextEngine.redactSecrets({
      dev_root: this.devRoot,
      git: this.getGitContext(),
      services: this.getDevServicesContext(),
      tasks: this.getTaskQueueContext(),
      worker: this.getWorkerContext(),
      workspace: this.getWorkspaceStructure(),
      safety_boundaries: {
        production_access: 'BLOCKED',
        production_db: 'BLOCKED',
        production_docker: 'BLOCKED',
        redis_scope: 'nexa:dev:*, nexa:ai:* (SAFE)',
        livekit_scope: 'dev-ai-* (DEV ONLY)'
      }
    });
  }
}

module.exports = ProjectContextEngine;

