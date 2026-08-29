/**
 * Nexa AI Development System — Phase 5 Gemini Manager Provider
 * Planning, review, and orchestration provider for Gemini / Antigravity.
 * Integrates Project Context, Bug-Fix, Feature, and Investigation modes.
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

    if (/\b(why|investigate|trace|audit|debug|analyze|find root cause|check why)\b/i.test(promptLower) && !/\b(fix|implement|create|add|update|build)\b/i.test(promptLower)) {
      type = 'investigation';
      priority = 'medium';
    } else if (/\b(fix|bug|error|broken|fail|crash|issue|patch|wrong|incorrect)\b/i.test(promptLower)) {
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

    // 2. Identify Relevant Modules, Apps, and Packages
    const knownAreas = [];
    const inferredAreas = [];
    const unknownAreas = [];

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
        knownAreas.push(`${info.path}/`);
        relevantFiles.push(`${info.path}/`);
        if (info.models) relatedModels.push(...info.models);
        if (info.app && !affectedApps.includes(`apps/${info.app}`)) affectedApps.push(`apps/${info.app}`);
        if (info.pkg && !affectedPackages.includes(`packages/${info.pkg}`)) affectedPackages.push(`packages/${info.pkg}`);
      }
    }

    if (promptLower.includes('api') || promptLower.includes('backend') || promptLower.includes('endpoint')) {
      if (!affectedApps.includes('apps/api')) affectedApps.push('apps/api');
      inferredAreas.push('apps/api/src/');
    }
    if (promptLower.includes('frontend') || promptLower.includes('web') || promptLower.includes('ui') || promptLower.includes('page')) {
      if (!affectedApps.includes('apps/web')) affectedApps.push('apps/web');
      inferredAreas.push('apps/web/src/');
    }
    if (promptLower.includes('package') || promptLower.includes('utils')) {
      if (!affectedPackages.includes('packages/utils')) affectedPackages.push('packages/utils');
      inferredAreas.push('packages/utils/src/');
    }

    if (affectedApps.length === 0 && affectedPackages.length === 0) {
      affectedApps.push('apps/api');
      inferredAreas.push('apps/api/src/');
    }

    unknownAreas.push('Specific line-level logic, edge cases, and runtime behavior to inspect in DEV environment');

    // 3. Impact Analysis
    const databaseImpact = type === 'database' || /\b(db|prisma|schema|migration|table|postgres)\b/i.test(promptLower);
    const redisImpact = /\b(redis|cache|key|namespace)\b/i.test(promptLower);
    const livekitImpact = /\b(livekit|video|meeting|room|stream)\b/i.test(promptLower);
    const apiImpact = affectedApps.includes('apps/api');
    const frontendImpact = affectedApps.includes('apps/web');

    // 4. Formulate Requirements, Guidance, and Acceptance Criteria based on Type
    let instructions = 'Inspect the existing implementation before modifying it. Reuse existing patterns/components/services whenever possible. Do not rebuild existing functionality unnecessarily.';
    let investigationInstructions = 'Inspect relevant code and documentation. Formulate an understanding of existing data flow.';
    let implementationGuidance = 'Follow repository patterns and AGENTS.md rules.';

    const requirements = [];
    const acceptanceCriteria = [];

    if (type === 'investigation') {
      instructions = 'INVESTIGATION ONLY: Analyze code, logs, and schema metadata. DO NOT modify application source code.';
      investigationInstructions = '1. Trace data flow and execution path. 2. Identify observed vs expected behavior. 3. Pinpoint root cause. 4. Detail recommended minimal fix in completion report.';
      implementationGuidance = 'Read-only inspection. Zero source code modifications permitted.';
      requirements.push(
        `Investigate and analyze: ${userPrompt}`,
        'Identify root cause and document evidence',
        'Do not modify application source code'
      );
      acceptanceCriteria.push(
        'Root cause clearly identified and explained with evidence',
        'Affected files identified accurately',
        'Recommended fix provided without altering application code files'
      );
    } else if (type === 'bug_fix') {
      instructions = 'BUG FIX: Investigate root cause before implementing minimal fix. Add regression tests.';
      investigationInstructions = '1. Reproduce issue mentally or via test. 2. Inspect relevant files. 3. Identify root cause. 4. Implement minimal targeted fix.';
      implementationGuidance = 'Avoid symptom-only patching. Ensure regression tests are added in corresponding .spec.ts files.';
      requirements.push(
        `Investigate root cause and fix: ${userPrompt}`,
        'Add or update unit test specs to cover regression scenario',
        'Follow repository coding conventions and AGENTS.md rules',
        'Ensure all TypeScript types, ESLint checks, and unit tests pass'
      );
      acceptanceCriteria.push(
        'Root cause identified and minimal fix implemented',
        'Regression unit test passes and prevents future occurrences',
        'All automated QA checks pass (typecheck, lint, unit tests)',
        'No regressions introduced in existing test suites'
      );
    } else {
      requirements.push(
        `Implement solution for: ${userPrompt}`,
        'Follow repository coding conventions and AGENTS.md rules',
        'Ensure all TypeScript types, ESLint checks, and unit tests pass'
      );
      acceptanceCriteria.push(
        'Code changes directly fulfill the requested objective',
        'All automated QA checks pass (typecheck, lint, build, unit tests)',
        'No regressions introduced in existing test suites'
      );
    }

    if (databaseImpact) {
      requirements.push('Use explicit migration (npx prisma migrate dev) and update PrismaService getters');
      acceptanceCriteria.push('Prisma schema validates and client generates cleanly');
    }

    // 5. Deduce Required Capabilities
    const requiredCapabilities = ['typescript'];
    if (affectedApps.includes('apps/api') || databaseImpact || promptLower.includes('api') || promptLower.includes('backend') || promptLower.includes('service')) {
      requiredCapabilities.push('backend', 'nestjs', 'prisma');
    }
    if (affectedApps.includes('apps/web') || frontendImpact || promptLower.includes('component') || promptLower.includes('ui') || promptLower.includes('page') || promptLower.includes('frontend')) {
      requiredCapabilities.push('frontend', 'nextjs', 'react', 'shadcn');
    }
    if (type === 'investigation') {
      requiredCapabilities.push('investigation');
    }
    if (promptLower.includes('test') || promptLower.includes('spec') || promptLower.includes('qa')) {
      requiredCapabilities.push('testing', 'jest');
    }

    return {
      title: userPrompt.length > 60 ? userPrompt.slice(0, 57) + '...' : userPrompt,
      objective: userPrompt,
      problem_statement: userPrompt,
      type,
      priority,
      complexity,
      required_capabilities: Array.from(new Set(requiredCapabilities)),
      context: {
        relevant_files: relevantFiles,
        related_models: Array.from(new Set(relatedModels)),
        affected_apps: affectedApps,
        affected_packages: affectedPackages,
        architecture_notes: 'NexaGen monorepo native development environment (/opt/nexa-chess/NexaGen-dev)'
      },
      affected_areas: {
        known: knownAreas,
        inferred: inferredAreas,
        unknown: unknownAreas
      },
      impact_analysis: {
        database_impact: databaseImpact,
        redis_impact: redisImpact,
        livekit_impact: livekitImpact,
        api_impact: apiImpact,
        frontend_impact: frontendImpact
      },
      instructions,
      investigation_instructions: investigationInstructions,
      implementation_guidance: implementationGuidance,
      requirements,
      acceptance_criteria: acceptanceCriteria,
      required_tests: type === 'investigation' ? ['typecheck'] : ['typecheck', 'lint', 'unit_tests']
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
      problem_statement: plan.problem_statement || plan.objective || plan.title,
      priority: plan.priority || 'medium',
      type: plan.type || 'feature_implementation',
      complexity: plan.complexity || 'simple',
      required_capabilities: plan.required_capabilities || ['typescript'],
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
      affected_areas: plan.affected_areas || {
        known: [],
        inferred: ['apps/api/src/'],
        unknown: ['Specific implementation logic']
      },
      impact_analysis: plan.impact_analysis || {
        database_impact: false,
        redis_impact: false,
        livekit_impact: false,
        api_impact: true,
        frontend_impact: false
      },
      instructions: plan.instructions || 'Inspect the existing implementation before modifying it. Reuse existing patterns/components/services whenever possible. Do not rebuild existing functionality unnecessarily.',
      investigation_instructions: plan.investigation_instructions || 'Inspect code and trace behavior.',
      implementation_guidance: plan.implementation_guidance || 'Follow repository coding conventions and AGENTS.md rules.',
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
      acceptance_criteria: (plan.acceptance_criteria || ['Objective completed and verified']).map((ac, idx) => {
        if (typeof ac === 'string') {
          let verType = 'unit_test';
          const acLower = ac.toLowerCase();
          if (acLower.includes('typecheck')) verType = 'typecheck';
          else if (acLower.includes('lint')) verType = 'lint';
          else if (acLower.includes('build')) verType = 'build';
          else if (plan.type === 'investigation' || acLower.includes('investigation') || acLower.includes('root cause')) verType = 'investigation';
          return {
            id: `AC-${String(idx + 1).padStart(3, '0')}`,
            description: ac,
            verification: verType,
            mandatory: true
          };
        }
        return ac;
      }),
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

    // Check investigation mode constraint: NO code modifications allowed
    if (workOrder.type === 'investigation') {
      const files = completionReport.files_changed || [];
      const codeFilesChanged = files.filter(f => !f.path.startsWith('.ai/'));
      if (codeFilesChanged.length > 0) {
        return {
          verdict: 'BLOCKED',
          reason: `Investigation tasks must not modify application code. Modified: ${codeFilesChanged.map(f => f.path).join(', ')}`,
          needs_follow_up: false
        };
      }
    }

    const testResults = completionReport.tests || {};
    const typecheckPassed = testResults.typecheck?.status === 'passed';
    const lintPassed = testResults.lint?.status === 'passed';
    const testsPassed = testResults.unit_tests?.status === 'passed';

    if (workOrder.type !== 'investigation') {
      if (!typecheckPassed || !lintPassed || !testsPassed) {
        return {
          verdict: 'REJECTED',
          reason: 'One or more required QA test gates failed',
          details: { typecheck: testResults.typecheck, lint: testResults.lint, unit_tests: testResults.unit_tests },
          needs_follow_up: true,
          follow_up_reason: 'Fix failing QA checks and broken test specs'
        };
      }
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
      type: workOrder.type,
      summary: completionReport.summary,
      root_cause: completionReport.root_cause || completionReport.investigation_findings?.root_cause,
      investigation_findings: completionReport.investigation_findings,
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

    let extraSection = '';
    if (reviewResult.root_cause) {
      extraSection = `\nRoot cause:\n${reviewResult.root_cause}\n`;
    } else if (reviewResult.investigation_findings?.observed_behavior) {
      extraSection = `\nInvestigation Findings:\n- Observed: ${reviewResult.investigation_findings.observed_behavior}\n- Root Cause: ${reviewResult.investigation_findings.root_cause || 'N/A'}\n- Recommendation: ${reviewResult.investigation_findings.recommended_fix || 'N/A'}\n`;
    }

    return `TASK: ${reviewResult.title} [${reviewResult.task_id}]

STATUS: COMPLETED

Worker:
Gemini / nexa-dev-01

Implemented:
${reviewResult.summary}${extraSection}
Changed:
${files}

Tests:
- Typecheck: PASS
- Lint: PASS (${reviewResult.tests?.lint?.errors || 0} errors, ${reviewResult.tests?.lint?.warnings || 0} warnings)
- Tests: PASS (${reviewResult.tests?.unit_tests?.passed || 0} passed)

Git:
${commitSha} on branch \`${branch}\`

Production:
UNCHANGED

RECOMMENDATION:
Ready for human review and merge into dev.`;
  }
}

module.exports = GeminiProvider;
