/**
 * Nexa AI Development System — Phase 4 Gemini Manager Provider
 * Planning, review, and orchestration provider for Gemini / Antigravity.
 */

const BaseProvider = require('./base-provider');

class GeminiProvider extends BaseProvider {
  constructor(config = {}) {
    super({
      name: 'Gemini (AI Pro)',
      model: config.model || 'gemini-2.5-pro',
      ...config
    });
  }

  /**
   * Analyzes user request and project context to determine task strategy and impact.
   */
  async analyzeRequest(userPrompt, projectContext = {}) {
    const promptLower = userPrompt.toLowerCase();

    // 1. Classification
    let type = 'feature_implementation';
    let priority = 'medium';
    let complexity = 'simple';

    if (/\b(fix|bug|error|broken|fail|crash|issue|patch)\b/i.test(promptLower)) {
      type = 'bug_fix';
      priority = 'high';
    } else if (/\b(refactor|clean|cleanup|reorganize|restructure)\b/i.test(promptLower)) {
      type = 'refactor';
      priority = 'low';
    } else if (/\b(test|e2e|coverage|spec|mock)\b/i.test(promptLower)) {
      type = 'testing';
    } else if (/\b(docker|nginx|vps|deploy|cron|port|process|tmux)\b/i.test(promptLower)) {
      type = 'devops';
    } else if (/\b(prisma|schema|database|table|migration|postgres|sql)\b/i.test(promptLower)) {
      type = 'database';
    } else if (/\b(investigate|trace|audit|debug|analyze|find)\b/i.test(promptLower)) {
      type = 'investigation';
    } else if (/\b(doc|readme|architecture|guide|explain)\b/i.test(promptLower)) {
      type = 'documentation';
    }

    if (/\b(urgent|critical|emergency|fatal|outage)\b/i.test(promptLower)) {
      priority = 'critical';
    }

    // Determine complexity
    const wordCount = userPrompt.split(/\s+/).length;
    if (wordCount > 30 || /\b(and|then|also|multiple|full|complete)\b/i.test(promptLower)) {
      complexity = 'medium';
    }

    // 2. Identify Relevant Modules, Apps, and Packages
    const relevantFiles = [];
    const relatedModels = [];
    const affectedApps = [];
    const affectedPackages = [];

    const moduleKeywords = {
      attendance: { path: 'apps/api/src/attendance', app: 'api', models: ['ClassAttendance', 'AttendanceLog', 'CoachAttendance'] },
      auth: { path: 'apps/api/src/auth', app: 'api', models: ['User', 'AuthSession', 'PasswordResetToken'] },
      admin: { path: 'apps/api/src/admin', app: 'api', models: ['User'] },
      batch: { path: 'apps/api/src/batch', app: 'api', models: ['Batch', 'BatchStudent', 'BatchCoach'] },
      coach: { path: 'apps/api/src/coach', app: 'api', models: ['CoachProfile', 'CoachClass'] },
      student: { path: 'apps/api/src/student', app: 'api', models: ['StudentProfile', 'StudentActivity'] },
      'live-class': { path: 'apps/api/src/live-class', app: 'api', models: ['LiveSession', 'LiveChatMessage'] },
      stockfish: { path: 'apps/api/src/stockfish', app: 'api', models: [] },
      chessboard: { path: 'apps/web/src/features/chessboard', app: 'web', models: ['Practice'] },
      dashboard: { path: 'apps/web/src/features/student-dashboard', app: 'web', models: [] },
      utils: { path: 'packages/utils/src', pkg: 'utils', models: [] },
      types: { path: 'packages/types/src', pkg: 'types', models: [] },
      ui: { path: 'packages/ui/src', pkg: 'ui', models: [] }
    };

    for (const [mod, info] of Object.entries(moduleKeywords)) {
      if (promptLower.includes(mod) || promptLower.includes(mod.replace('-', ' '))) {
        relevantFiles.push(`${info.path}/`);
        if (info.models) relatedModels.push(...info.models);
        if (info.app && !affectedApps.includes(`apps/${info.app}`)) affectedApps.push(`apps/${info.app}`);
        if (info.pkg && !affectedPackages.includes(`packages/${info.pkg}`)) affectedPackages.push(`packages/${info.pkg}`);
      }
    }

    if (promptLower.includes('api') || promptLower.includes('backend') || promptLower.includes('endpoint')) {
      if (!affectedApps.includes('apps/api')) affectedApps.push('apps/api');
    }
    if (promptLower.includes('frontend') || promptLower.includes('web') || promptLower.includes('ui') || promptLower.includes('page')) {
      if (!affectedApps.includes('apps/web')) affectedApps.push('apps/web');
    }
    if (promptLower.includes('package') || promptLower.includes('utils')) {
      if (!affectedPackages.includes('packages/utils')) affectedPackages.push('packages/utils');
    }

    if (affectedApps.length === 0 && affectedPackages.length === 0) {
      affectedApps.push('apps/api');
    }

    // 3. Impact Analysis
    const databaseImpact = type === 'database' || /\b(db|prisma|schema|migration|table|postgres)\b/i.test(promptLower);
    const redisImpact = /\b(redis|cache|key|namespace)\b/i.test(promptLower);
    const livekitImpact = /\b(livekit|video|meeting|room|stream)\b/i.test(promptLower);
    const apiImpact = affectedApps.includes('apps/api');
    const frontendImpact = affectedApps.includes('apps/web');

    // 4. Formulate Requirements & Acceptance Criteria
    const requirements = [
      `Implement solution for: ${userPrompt}`,
      'Follow repository coding conventions and AGENTS.md rules',
      'Ensure all TypeScript types, ESLint checks, and unit tests pass'
    ];

    const acceptanceCriteria = [
      'Code changes directly fulfill the requested objective',
      'All automated QA checks pass (typecheck, lint, build, unit tests)',
      'No regressions introduced in existing test suites'
    ];

    if (databaseImpact) {
      requirements.push('Use explicit migration (npx prisma migrate dev) and update PrismaService getters');
      acceptanceCriteria.push('Prisma schema validates and client generates cleanly');
    }

    return {
      title: userPrompt.length > 60 ? userPrompt.slice(0, 57) + '...' : userPrompt,
      objective: userPrompt,
      type,
      priority,
      complexity,
      context: {
        relevant_files: relevantFiles,
        related_models: Array.from(new Set(relatedModels)),
        affected_apps: affectedApps,
        affected_packages: affectedPackages,
        architecture_notes: 'NexaGen monorepo native development environment (/opt/nexa-chess/NexaGen-dev)'
      },
      impact_analysis: {
        database_impact: databaseImpact,
        redis_impact: redisImpact,
        livekit_impact: livekitImpact,
        api_impact: apiImpact,
        frontend_impact: frontendImpact
      },
      instructions: 'Inspect the existing implementation before modifying it. Reuse existing patterns/components/services whenever possible. Do not rebuild existing functionality unnecessarily.',
      requirements,
      acceptance_criteria: acceptanceCriteria,
      required_tests: ['typecheck', 'lint', 'unit_tests']
    };
  }

  /**
   * Generates a schema-compliant work order with full engineering context.
   */
  async generateWorkOrder(plan, metadata = {}) {
    const taskId = metadata.taskId || 'NEXA-0001';
    const slug = (plan.title || 'task').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
    const branchName = `ai/${taskId}-${slug}`;

    return {
      task_id: taskId,
      title: plan.title || 'Untitled Task',
      objective: plan.objective || plan.title,
      priority: plan.priority || 'medium',
      type: plan.type || 'feature_implementation',
      complexity: plan.complexity || 'simple',
      attempt: metadata.attempt || 1,
      max_attempts: metadata.max_attempts || 2,
      dependencies: plan.dependencies || [],
      environment: {
        server: 'nexa-vcn',
        environment: 'development',
        project_path: '/opt/nexa-chess/NexaGen-dev',
        branch: branchName
      },
      context: plan.context || {
        relevant_files: [],
        related_models: [],
        affected_apps: ['apps/api'],
        affected_packages: [],
        architecture_notes: 'NexaGen monorepo'
      },
      impact_analysis: plan.impact_analysis || {
        database_impact: false,
        redis_impact: false,
        livekit_impact: false,
        api_impact: true,
        frontend_impact: false
      },
      instructions: plan.instructions || 'Inspect the existing implementation before modifying it. Reuse existing patterns/components/services whenever possible. Do not rebuild existing functionality unnecessarily.',
      requirements: plan.requirements || [plan.objective],
      constraints: [
        'Development environment ONLY (/opt/nexa-chess/NexaGen-dev)',
        'Do not touch or target production (/opt/nexa-chess/NexaGen)',
        'PostgreSQL target is vps_dev only (nexa_chess is strictly blocked)',
        'Redis keys must use nexa:dev:* or nexa:ai:* namespaces',
        'LiveKit rooms must follow dev-ai-<task-id>-<purpose> convention',
        'Must pass QA verify.sh before marking completed',
        'Do not auto-merge into dev/main; remain on task branch'
      ],
      acceptance_criteria: plan.acceptance_criteria || ['Objective completed and verified'],
      required_tests: plan.required_tests || ['typecheck', 'lint', 'unit_tests'],
      verification_commands: [
        'npm run typecheck',
        'npm run lint',
        'npm test'
      ],
      safety: {
        allowed_paths: ['/opt/nexa-chess/NexaGen-dev/'],
        blocked_paths: ['/opt/nexa-chess/NexaGen/', '/etc/', '/var/', '/usr/', '/root/'],
        allowed_databases: ['vps_dev'],
        blocked_databases: ['nexa_chess', 'postgres'],
        requires_approval: false
      },
      state_history: [
        { state: 'CREATED', timestamp: new Date().toISOString() }
      ],
      assigned_worker: 'nexa-dev-01',
      provider: 'gemini',
      model: this.config.model,
      created_at: new Date().toISOString(),
      timeout_minutes: 30
    };
  }

  /**
   * Reviews worker completion report against requirements and criteria.
   */
  async reviewCompletion(workOrder, completionReport) {
    if (!completionReport || typeof completionReport !== 'object') {
      return {
        verdict: 'REJECTED',
        reason: 'Missing or malformed completion report',
        needs_follow_up: true
      };
    }

    const testResults = completionReport.tests || {};
    const typecheckPassed = testResults.typecheck?.status === 'passed';
    const lintPassed = testResults.lint?.status === 'passed';
    const testsPassed = testResults.unit_tests?.status === 'passed';

    if (!typecheckPassed || !lintPassed || !testsPassed) {
      return {
        verdict: 'REJECTED',
        reason: 'One or more required QA test gates failed',
        details: { typecheck: testResults.typecheck, lint: testResults.lint, unit_tests: testResults.unit_tests },
        needs_follow_up: true,
        follow_up_reason: 'Fix failing QA checks and broken test specs'
      };
    }

    if (!completionReport.git?.commits || completionReport.git.commits.length === 0) {
      return {
        verdict: 'REJECTED',
        reason: 'No git commit recorded in completion report',
        needs_follow_up: true
      };
    }

    // Safety audit on changed files: ensure no production path or secrets
    const files = completionReport.files_changed || [];
    for (const f of files) {
      if (f.path.includes('.env') || f.path.includes('.key') || f.path.includes('id_rsa')) {
        return {
          verdict: 'BLOCKED',
          reason: `Security violation: sensitive file detected in completion report (${f.path})`,
          needs_follow_up: false
        };
      }
      if (f.path.startsWith('/opt/nexa-chess/NexaGen/') && !f.path.startsWith('/opt/nexa-chess/NexaGen-dev/')) {
        return {
          verdict: 'BLOCKED',
          reason: `Production violation: production file touched (${f.path})`,
          needs_follow_up: false
        };
      }
    }

    return {
      verdict: 'ACCEPTED',
      task_id: workOrder.task_id,
      title: workOrder.title,
      summary: completionReport.summary,
      files_changed: files,
      git: completionReport.git,
      tests: testResults,
      attempt: completionReport.attempt || 1,
      max_attempts: completionReport.max_attempts || 2,
      verification: completionReport.verification || [],
      recommendations: completionReport.recommendations || []
    };
  }

  /**
   * Formats a clean, professional summary for the user.
   */
  summarizeForHuman(reviewResult) {
    if (reviewResult.verdict === 'REJECTED' || reviewResult.verdict === 'FAILED') {
      return `### ❌ Task ${reviewResult.task_id || 'Task'}: FAILED (Attempt ${reviewResult.attempt || 1}/${reviewResult.max_attempts || 2})

**Reason:** ${reviewResult.reason}
${reviewResult.error_details ? `**Details:** ${reviewResult.error_details}\n` : ''}
${reviewResult.recommendation ? `**Recommended Action:** ${reviewResult.recommendation}\n` : ''}`;
    }

    if (reviewResult.verdict === 'BLOCKED') {
      return `### 🛑 Task ${reviewResult.task_id || 'Task'}: BLOCKED

**Reason:** ${reviewResult.reason}`;
    }

    const files = (reviewResult.files_changed || []).map(f => `  - \`[${f.action?.toUpperCase() || 'MOD'}]\` ${f.path}`).join('\n') || '  - None';
    const commitSha = reviewResult.git?.commits?.[0]?.sha ? reviewResult.git.commits[0].sha.slice(0, 7) : 'None';
    const branch = reviewResult.git?.branch || 'unknown';

    return `TASK: ${reviewResult.title} [${reviewResult.task_id}]

STATUS: COMPLETED

Worker:
Gemini / nexa-dev-01

Implemented:
${reviewResult.summary}

Changed:
${files}

Verification:
- Typecheck: PASS
- Lint: PASS (${reviewResult.tests?.lint?.errors || 0} errors, ${reviewResult.tests?.lint?.warnings || 0} warnings)
- Tests: PASS (${reviewResult.tests?.unit_tests?.passed || 0} passed)

Commit:
${commitSha} on branch \`${branch}\`

RECOMMENDATION:
Ready for human review and merge into dev.`;
  }
}

module.exports = GeminiProvider;
