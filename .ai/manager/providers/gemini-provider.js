/**
 * Nexa AI Development System — Gemini Manager Provider
 * Primary planning, review, and orchestration provider for Gemini / Antigravity.
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
   * Analyzes user request and project context to determine task strategy.
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

    // 2. Identify Relevant Modules & Files
    const relevantFiles = [];
    const relatedModels = [];

    const moduleKeywords = {
      attendance: { path: 'apps/api/src/attendance', models: ['ClassAttendance', 'AttendanceLog', 'CoachAttendance'] },
      auth: { path: 'apps/api/src/auth', models: ['User', 'AuthSession', 'PasswordResetToken'] },
      admin: { path: 'apps/api/src/admin', models: ['User'] },
      batch: { path: 'apps/api/src/batch', models: ['Batch', 'BatchStudent', 'BatchCoach'] },
      coach: { path: 'apps/api/src/coach', models: ['CoachProfile', 'CoachClass'] },
      student: { path: 'apps/api/src/student', models: ['StudentProfile', 'StudentActivity'] },
      'live-class': { path: 'apps/api/src/live-class', models: ['LiveSession', 'LiveChatMessage'] },
      stockfish: { path: 'apps/api/src/stockfish', models: [] },
      chessboard: { path: 'apps/web/src/features/chessboard', models: ['Practice'] },
      utils: { path: 'packages/utils/src', models: [] }
    };

    for (const [mod, info] of Object.entries(moduleKeywords)) {
      if (promptLower.includes(mod) || promptLower.includes(mod.replace('-', ' '))) {
        relevantFiles.push(`${info.path}/`);
        relatedModels.push(...info.models);
      }
    }

    // 3. Formulate Requirements & Acceptance Criteria
    const requirements = [
      `Implement solution for: ${userPrompt}`,
      'Follow repository coding conventions and AGENTS.md rules',
      'Ensure all TypeScript types and ESLint rules pass'
    ];

    const acceptanceCriteria = [
      'Code changes directly fulfill the requested objective',
      'All automated QA checks pass (typecheck, lint, build, unit tests)',
      'No regression in existing test suites'
    ];

    if (type === 'database') {
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
        architecture_notes: 'NexaGen monorepo dev environment (/opt/nexa-chess/NexaGen-dev)'
      },
      requirements,
      acceptance_criteria: acceptanceCriteria,
      required_tests: ['typecheck', 'lint', 'unit_tests']
    };
  }

  /**
   * Generates a schema-compliant work order.
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
      environment: {
        server: 'nexa-vcn',
        environment: 'development',
        project_path: '/opt/nexa-chess/NexaGen-dev',
        branch: branchName
      },
      context: plan.context || {
        relevant_files: [],
        related_models: [],
        architecture_notes: 'NexaGen monorepo'
      },
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
      safety: {
        allowed_paths: ['/opt/nexa-chess/NexaGen-dev/'],
        blocked_paths: ['/opt/nexa-chess/NexaGen/', '/etc/', '/var/', '/usr/', '/root/'],
        allowed_databases: ['vps_dev'],
        blocked_databases: ['nexa_chess', 'postgres'],
        requires_approval: false
      },
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

    return {
      verdict: 'ACCEPTED',
      task_id: workOrder.task_id,
      title: workOrder.title,
      summary: completionReport.summary,
      files_changed: completionReport.files_changed || [],
      git: completionReport.git,
      tests: testResults,
      verification: completionReport.verification || [],
      recommendations: completionReport.recommendations || []
    };
  }

  /**
   * Formats a clean, professional summary for the user.
   */
  summarizeForHuman(reviewResult) {
    if (reviewResult.verdict === 'REJECTED') {
      return `### ❌ Task ${reviewResult.task_id || 'Task'} Rejected / Incomplete\n\n**Reason:** ${reviewResult.reason}\n${reviewResult.follow_up_reason ? `**Follow-up required:** ${reviewResult.follow_up_reason}\n` : ''}`;
    }

    const files = (reviewResult.files_changed || []).map(f => `  - \`[${f.action?.toUpperCase() || 'MOD'}]\` ${f.path}`).join('\n') || '  - None';
    const commitSha = reviewResult.git?.commits?.[0]?.sha ? reviewResult.git.commits[0].sha.slice(0, 7) : 'None';
    const branch = reviewResult.git?.branch || 'unknown';

    return `### ✅ Completed Task: ${reviewResult.task_id} — ${reviewResult.title}

**Summary:**
${reviewResult.summary}

**Changes:**
${files}

**Verification:**
- Typecheck: \`PASSED\`
- Lint: \`PASSED\` (${reviewResult.tests?.lint?.errors || 0} errors, ${reviewResult.tests?.lint?.warnings || 0} warnings)
- Tests: \`PASSED\` (${reviewResult.tests?.unit_tests?.passed || 0} passed)

**Git Isolation:**
- **Branch:** \`${branch}\`
- **Commit:** \`${commitSha}\`
- **Merge Status:** Changes are committed to the task branch and have **NOT** been merged into \`dev\` or \`main\` (awaiting human review).`;
  }
}

module.exports = GeminiProvider;
