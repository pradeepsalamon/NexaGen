/**
 * Nexa AI Development System — Phase 9 Test Intelligence Engine
 * Dynamically selects targeted, impact-aware test suites and verification commands
 * based on modified files and change risk.
 */

class TestIntelligence {
  /**
   * Evaluates optimal test suite selection for a given set of changed or planned files.
   */
  static selectTestPlan(filesChanged = [], riskLevel = 'MEDIUM') {
    const files = filesChanged.map(f => (typeof f === 'string' ? f : f.path).toLowerCase());
    const filesStr = files.join(' ');

    const plan = {
      qa_tier: 'backend_logic',
      run_full_suite: false,
      run_build: false,
      targeted_commands: [],
      affected_modules: [],
      rationale: ''
    };

    // 1. High Risk or Core Shared Types or Schema Changes -> Full Suite
    if (
      riskLevel === 'CRITICAL' ||
      riskLevel === 'HIGH' ||
      filesStr.includes('schema.prisma') ||
      filesStr.includes('packages/types') ||
      filesStr.includes('packages/config')
    ) {
      plan.qa_tier = filesStr.includes('schema.prisma') ? 'database_schema' : 'high_risk_full';
      plan.run_full_suite = true;
      plan.run_build = filesStr.includes('apps/web');
      plan.targeted_commands = [
        'npm run typecheck',
        'npm run lint',
        'npm test',
        ...(plan.run_build ? ['npm run build'] : [])
      ];
      plan.rationale = `High-impact or core schema/type modification detected. Executing full test suite and typechecks.`;
      return plan;
    }

    // 2. Documentation Only
    if (files.length > 0 && files.every(f => f.endsWith('.md') || f.startsWith('.ai/'))) {
      plan.qa_tier = 'docs_only';
      plan.run_full_suite = false;
      plan.targeted_commands = [
        'git diff HEAD'
      ];
      plan.rationale = `Documentation-only changes. Running secret scanning and diff verification.`;
      return plan;
    }

    // 3. Frontend Web Changes
    if (filesStr.includes('apps/web') || filesStr.includes('packages/ui')) {
      plan.qa_tier = 'frontend_ui';
      plan.run_build = true;
      plan.targeted_commands = [
        'npm run typecheck',
        'npm run lint',
        'npm run build -w apps/web'
      ];
      plan.rationale = `Frontend UI modification. Executing Next.js compilation, linting, and typecheck.`;
      return plan;
    }

    // 4. Targeted Backend API Modules
    const moduleMap = {
      attendance: 'npm run test -w apps/api -- -t attendance',
      auth: 'npm run test -w apps/api -- -t auth',
      admin: 'npm run test -w apps/api -- -t admin',
      user: 'npm run test -w apps/api -- -t user',
      coach: 'npm run test -w apps/api -- -t coach',
      student: 'npm run test -w apps/api -- -t student',
      mail: 'npm run test -w apps/api -- -t mail',
      prisma: 'npm run test -w apps/api -- -t prisma'
    };

    const detectedTargets = [];
    for (const [mod, cmd] of Object.entries(moduleMap)) {
      if (filesStr.includes(`src/${mod}`) || filesStr.includes(`${mod}.`)) {
        detectedTargets.push(cmd);
        plan.affected_modules.push(mod);
      }
    }

    if (detectedTargets.length > 0) {
      plan.qa_tier = 'backend_logic';
      plan.targeted_commands = [
        'npm run typecheck',
        'npm run lint',
        ...detectedTargets
      ];
      plan.rationale = `Targeted backend API module tests for: ${plan.affected_modules.join(', ')}.`;
      return plan;
    }

    // 5. Default: Standard Backend Logic
    plan.qa_tier = 'backend_logic';
    plan.targeted_commands = [
      'npm run typecheck',
      'npm run lint',
      'npm test'
    ];
    plan.rationale = `Standard application test tier: monorepo typecheck, ESLint, and Jest unit tests.`;
    return plan;
  }
}

module.exports = TestIntelligence;
