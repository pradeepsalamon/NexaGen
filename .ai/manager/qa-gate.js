/**
 * Nexa AI Development System — Phase 9 Centralized QA Gate Engine
 * Implements tiered, automated verification across Git diffs, secrets, types, linter, tests, builds,
 * acceptance criteria, API contract safety, database safety, scope creep, and dependency safety.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const TestIntelligence = require('./test-intelligence');

const DEV_ROOT = path.resolve(__dirname, '../..');

// Patterns for detecting sensitive credentials in source code diffs
const SECRET_SCAN_PATTERNS = [
  /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"\s]{4,}['"]/i,
  /(?:secret|jwt_secret)\s*[:=]\s*['"][^'"\s]{8,}['"]/i,
  /(?:api_key|apikey|access_token)\s*[:=]\s*['"][a-zA-Z0-9_\-]{16,}['"]/i,
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/i,
  /postgres:\/\/[^:]+:[^@]+@/i
];

class QAGate {
  constructor(workspaceRoot = DEV_ROOT) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * 1. Inspects Git diff in workspace.
   */
  inspectDiff() {
    try {
      const gitEnv = { ...process.env, PAGER: 'cat', GIT_PAGER: 'cat' };
      const statusRaw = execSync('git status --porcelain', { cwd: this.workspaceRoot, encoding: 'utf-8', env: gitEnv }).trim();
      const files = statusRaw
        ? statusRaw.split('\n').map(l => l.trim().slice(3)).filter(Boolean)
        : [];

      const diffRaw = execSync('git diff HEAD', { cwd: this.workspaceRoot, encoding: 'utf-8', env: gitEnv }).trim();

      return {
        ok: true,
        filesChanged: files,
        filesCount: files.length,
        diffLength: diffRaw.length,
        hasChanges: files.length > 0 || diffRaw.length > 0
      };
    } catch (e) {
      return { ok: false, error: e.message, filesChanged: [] };
    }
  }

  /**
   * 2. Scans modified files for secret leaks.
   */
  scanSecrets(filesChanged = []) {
    const leaks = [];

    for (const relPath of filesChanged) {
      const fullPath = path.resolve(this.workspaceRoot, relPath);
      
      // Check for forbidden secret files
      const base = path.basename(relPath);
      if (base === '.env' || base === '.env.production' || base.endsWith('.pem') || base.endsWith('.key')) {
        leaks.push({ file: relPath, reason: `Forbidden secret configuration file in diff: ${base}` });
        continue;
      }

      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          for (const pattern of SECRET_SCAN_PATTERNS) {
            if (pattern.test(content)) {
              leaks.push({ file: relPath, reason: `Potential hardcoded secret matching pattern: ${pattern.toString()}` });
              break;
            }
          }
        } catch {}
      }
    }

    return {
      ok: leaks.length === 0,
      leaks
    };
  }

  /**
   * 3. Validates database migration safety (Prisma rules).
   */
  checkDatabaseSafety(filesChanged = []) {
    const violations = [];
    let classification = 'SAFE';

    const hasPrismaChange = filesChanged.some(f => f.includes('schema.prisma'));
    const hasMigrationChange = filesChanged.some(f => f.includes('migrations'));

    if (hasPrismaChange || hasMigrationChange) {
      classification = 'REQUIRES_REVIEW';

      // Check Prisma getters rule (AGENTS.md rule)
      const prismaServicePath = path.join(this.workspaceRoot, 'apps/api/src/prisma/prisma.service.ts');
      if (fs.existsSync(prismaServicePath)) {
        const pService = fs.readFileSync(prismaServicePath, 'utf-8');
        if (!pService.includes('PrismaService') || !pService.includes('softDeleteExtension')) {
          violations.push('PrismaService missing core configuration in apps/api/src/prisma/prisma.service.ts');
        }
      }
    }

    return {
      ok: violations.length === 0,
      classification,
      violations
    };
  }

  /**
   * 4. API Contract Safety: checks for breaking endpoint changes or modified DTOs.
   */
  checkApiContractSafety(filesChanged = []) {
    const apiFiles = filesChanged.filter(f => f.includes('apps/api') && (f.includes('controller.ts') || f.includes('dto.ts')));
    const warnings = [];

    if (apiFiles.length > 0) {
      warnings.push(`API surface touched in: ${apiFiles.join(', ')}. Review for breaking contract changes.`);
    }

    return {
      ok: true,
      has_api_changes: apiFiles.length > 0,
      warnings
    };
  }

  /**
   * 5. Scope Creep Detection: compares planned files vs actual files.
   */
  checkScopeCreep(taskData, filesChanged = []) {
    const planned = (taskData.context?.relevant_files || []).concat(taskData.affected_areas?.known || []).map(f => f.toLowerCase());
    
    if (planned.length === 0 || filesChanged.length === 0) {
      return { scope_creep: false, unrelated_files: [] };
    }

    const unrelated = [];
    for (const actual of filesChanged) {
      const actualLower = actual.toLowerCase();
      // Allow test files, markdown, or direct prefixes
      const isExpected = planned.some(p => actualLower.startsWith(p) || p.startsWith(actualLower) || actualLower.includes(path.basename(p, path.extname(p))));
      if (!isExpected && !actualLower.endsWith('.spec.ts') && !actualLower.endsWith('.test.ts') && !actualLower.endsWith('.md')) {
        unrelated.push(actual);
      }
    }

    return {
      scope_creep: unrelated.length > 0,
      unrelated_files: unrelated
    };
  }

  /**
   * 6. Dependency Safety: checks package.json modifications.
   */
  checkDependencySafety(filesChanged = []) {
    const pkgFiles = filesChanged.filter(f => path.basename(f) === 'package.json');
    const warnings = [];

    if (pkgFiles.length > 0) {
      warnings.push(`Dependencies modified in: ${pkgFiles.join(', ')}. Review package additions.`);
    }

    return {
      ok: true,
      has_dependency_changes: pkgFiles.length > 0,
      warnings
    };
  }

  /**
   * 7. Configuration Safety: checks .env, Docker, CI/CD, Nginx files.
   */
  checkConfigurationSafety(filesChanged = []) {
    const configFiles = filesChanged.filter(f =>
      f.includes('.env') ||
      f.includes('docker') ||
      f.includes('Dockerfile') ||
      f.includes('.github') ||
      f.includes('nginx') ||
      f.includes('scripts/deploy')
    );

    return {
      ok: !configFiles.some(f => f.includes('.env.production') || f.includes('production')),
      has_config_changes: configFiles.length > 0,
      config_files: configFiles
    };
  }

  /**
   * Evaluates machine-readable acceptance criteria against reported verification.
   */
  evaluateAcceptanceCriteria(taskData, verificationResults) {
    const criteria = Array.isArray(taskData.acceptance_criteria)
      ? taskData.acceptance_criteria
      : [];

    if (criteria.length === 0) {
      return { ok: true, evaluated: [] };
    }

    const evaluated = [];
    let allMandatoryPassed = true;

    for (let i = 0; i < criteria.length; i++) {
      const ac = typeof criteria[i] === 'string'
        ? { id: `AC-${String(i + 1).padStart(3, '0')}`, description: criteria[i], verification: 'unit_test', mandatory: true }
        : criteria[i];

      const mandatory = ac.mandatory !== false;
      let status = 'passed';
      let evidence = 'Verified via automated QA Gate';

      // Check against test results
      if (ac.verification === 'typecheck' && verificationResults.typecheck?.status !== 'passed') {
        status = 'failed';
        evidence = 'Typecheck suite failed';
      } else if (ac.verification === 'lint' && verificationResults.lint?.status !== 'passed') {
        status = 'failed';
        evidence = 'Lint suite failed';
      } else if ((ac.verification === 'unit_test' || ac.verification === 'test') && verificationResults.unit_tests?.status !== 'passed') {
        status = 'failed';
        evidence = 'Unit test suite failed';
      } else if (ac.verification === 'build' && verificationResults.build?.status !== 'passed') {
        status = 'failed';
        evidence = 'Build verification failed';
      }

      if (mandatory && status !== 'passed') {
        allMandatoryPassed = false;
      }

      evaluated.push({
        id: ac.id || `AC-${String(i + 1).padStart(3, '0')}`,
        description: ac.description,
        verification: ac.verification || 'unit_test',
        mandatory,
        status,
        evidence
      });
    }

    return {
      ok: allMandatoryPassed,
      evaluated
    };
  }

  /**
   * Executes the complete centralized QA verification pipeline with Test Intelligence.
   */
  run(taskData) {
    // 1. Diff Inspection
    const diff = this.inspectDiff();
    if (!diff.ok) {
      return { ok: false, code: 'DIFF_INSPECTION_FAILED', error: diff.error };
    }

    // Select dynamic test plan via TestIntelligence
    const testPlan = TestIntelligence.selectTestPlan(diff.filesChanged, taskData.impact || 'MEDIUM');
    const tier = taskData.qa_tier || testPlan.qa_tier;

    console.log(`\n🛡️ [QA GATE] Running verification (Tier: ${tier.toUpperCase()}) in workspace:`);
    console.log(`   📁 ${this.workspaceRoot}`);
    if (testPlan.rationale) console.log(`   ℹ️ ${testPlan.rationale}`);

    const testResults = {
      tier,
      diff_inspection: { status: 'passed', filesChanged: diff.filesChanged },
      secret_scan: { status: 'passed' },
      database_safety: { status: 'passed' },
      api_contract: { status: 'passed' },
      scope_creep: { status: 'passed' },
      dependency_safety: { status: 'passed' },
      config_safety: { status: 'passed' },
      typecheck: { status: 'skipped' },
      lint: { status: 'skipped' },
      unit_tests: { status: 'skipped' },
      build: { status: 'skipped' },
      acceptance_criteria: { status: 'passed' }
    };

    // 2. Secret Scan
    const secrets = this.scanSecrets(diff.filesChanged);
    if (!secrets.ok) {
      testResults.secret_scan = { status: 'failed', leaks: secrets.leaks };
      return { ok: false, code: 'SECRET_SCAN_FAILED', reason: 'Secret credentials detected in code diff', testResults };
    }

    // 3. Database Safety
    const dbSafety = this.checkDatabaseSafety(diff.filesChanged);
    testResults.database_safety = { status: dbSafety.ok ? 'passed' : 'failed', classification: dbSafety.classification, violations: dbSafety.violations };
    if (!dbSafety.ok) {
      return { ok: false, code: 'DATABASE_SAFETY_FAILED', reason: dbSafety.violations.join('; '), testResults };
    }

    // 4. API Contract Safety
    const apiSafety = this.checkApiContractSafety(diff.filesChanged);
    testResults.api_contract = { status: 'passed', has_api_changes: apiSafety.has_api_changes, warnings: apiSafety.warnings };

    // 5. Scope Creep
    const scopeCheck = this.checkScopeCreep(taskData, diff.filesChanged);
    testResults.scope_creep = { status: scopeCheck.scope_creep ? 'review_required' : 'passed', scope_creep: scopeCheck.scope_creep, unrelated_files: scopeCheck.unrelated_files };

    // 6. Dependency & Config Safety
    const depSafety = this.checkDependencySafety(diff.filesChanged);
    testResults.dependency_safety = { status: 'passed', has_dependency_changes: depSafety.has_dependency_changes, warnings: depSafety.warnings };

    const configSafety = this.checkConfigurationSafety(diff.filesChanged);
    testResults.config_safety = { status: configSafety.ok ? 'passed' : 'failed', has_config_changes: configSafety.has_config_changes, config_files: configSafety.config_files };
    if (!configSafety.ok) {
      return { ok: false, code: 'CONFIG_SAFETY_FAILED', reason: 'Forbidden production configuration modification detected', testResults };
    }

    // 7. Dynamic Execution via TestIntelligence
    const gitEnv = { ...process.env, PAGER: 'cat', GIT_PAGER: 'cat' };

    // Typecheck
    if (tier !== 'docs_only') {
      try {
        console.log('   Running Typecheck...');
        execSync('npm run typecheck', { cwd: this.workspaceRoot, stdio: 'pipe', encoding: 'utf-8', env: gitEnv });
        testResults.typecheck = { status: 'passed', errors: 0 };
      } catch (err) {
        testResults.typecheck = { status: 'failed', error: err.message };
        return { ok: false, code: 'TYPECHECK_FAILED', reason: 'TypeScript compilation errors', testResults };
      }
    }

    // Lint
    if (tier !== 'docs_only') {
      try {
        console.log('   Running Lint...');
        execSync('npm run lint', { cwd: this.workspaceRoot, stdio: 'pipe', encoding: 'utf-8', env: gitEnv });
        testResults.lint = { status: 'passed', errors: 0 };
      } catch (err) {
        testResults.lint = { status: 'failed', error: err.message };
        return { ok: false, code: 'LINT_FAILED', reason: 'ESLint verification failed', testResults };
      }
    }

    // Unit / Integration Tests
    if (tier === 'backend_logic' || tier === 'database_schema' || tier === 'frontend_ui' || tier === 'high_risk_full') {
      try {
        console.log('   Running Unit Tests...');
        execSync('npm test', { cwd: this.workspaceRoot, stdio: 'pipe', encoding: 'utf-8', env: gitEnv });
        testResults.unit_tests = { status: 'passed', failed: 0 };
      } catch (err) {
        testResults.unit_tests = { status: 'failed', error: err.message };
        return { ok: false, code: 'UNIT_TESTS_FAILED', reason: 'Unit test suite failed', testResults };
      }
    }

    // Build (for frontend and high-risk tasks)
    if (tier === 'frontend_ui' || tier === 'high_risk_full') {
      try {
        console.log('   Running Build...');
        execSync('npm run build', { cwd: this.workspaceRoot, stdio: 'pipe', encoding: 'utf-8', env: gitEnv });
        testResults.build = { status: 'passed' };
      } catch (err) {
        testResults.build = { status: 'failed', error: err.message };
        return { ok: false, code: 'BUILD_FAILED', reason: 'Monorepo build failed', testResults };
      }
    }

    // 8. Acceptance Criteria Evaluation
    const acResult = this.evaluateAcceptanceCriteria(taskData, testResults);
    testResults.acceptance_criteria = {
      status: acResult.ok ? 'passed' : 'failed',
      evaluated: acResult.evaluated
    };

    if (!acResult.ok) {
      return {
        ok: false,
        code: 'ACCEPTANCE_CRITERIA_UNMET',
        reason: 'One or more mandatory acceptance criteria failed verification',
        testResults
      };
    }

    console.log('🛡️ [QA GATE] All verification gates PASSED successfully.\n');
    return { ok: true, testResults };
  }
}

module.exports = QAGate;
