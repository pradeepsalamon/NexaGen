/**
 * Nexa AI Development System — Phase 9 Development Request Risk Engine
 * Classifies development requests and changes across production, database, security,
 * API compatibility, LiveKit, Redis, and scope dimensions.
 */

class RiskEngine {
  /**
   * Evaluates comprehensive risk profile for a request and affected context.
   */
  static assessRisk(prompt = '', context = {}) {
    const pLower = prompt.toLowerCase();
    const relevantFiles = (context.relevant_files || []).concat(context.files || []).map(f => (typeof f === 'string' ? f : f.path).toLowerCase());
    const filesStr = relevantFiles.join(' ');

    const factors = {
      production_target: false,
      production_db: false,
      destructive_operation: false,
      auth_security: false,
      database_schema: false,
      api_contract: false,
      livekit: false,
      redis: false,
      frontend: false,
      scope_size: 'NORMAL'
    };

    const reasons = [];

    // 1. Production Target & Production DB (CRITICAL / BLOCKED)
    if (
      /\b(production|prod|deploy to prod|nexa_web|nexa_api container|restart prod)\b/i.test(pLower) ||
      relevantFiles.some(f => f.startsWith('/opt/nexa-chess/nexagen/') && !f.startsWith('/opt/nexa-chess/nexagen-dev/'))
    ) {
      factors.production_target = true;
      reasons.push('Touches production infrastructure or deployment commands');
    }

    if (/\b(nexa_chess|production db|production database)\b/i.test(pLower)) {
      factors.production_db = true;
      reasons.push('Targets production database (nexa_chess)');
    }

    // 2. Destructive Operations (CRITICAL / BLOCKED)
    if (
      /\b(drop\s+database|truncate|rm\s+-rf|flushall|flushdb|drop\s+table|delete\s+from\s+users)\b/i.test(pLower) ||
      /\b(prisma\s+db\s+push\s+--force-reset)\b/i.test(pLower)
    ) {
      factors.destructive_operation = true;
      reasons.push('Contains destructive database or filesystem operations');
    }

    // 3. Auth & Security (HIGH)
    if (
      /\b(auth|jwt|password|token|secret|session|permission|guard|hash|login|logout)\b/i.test(pLower) ||
      filesStr.includes('auth.') ||
      filesStr.includes('jwt') ||
      filesStr.includes('guard')
    ) {
      factors.auth_security = true;
      reasons.push('Modifies authentication, authorization, or session logic');
    }

    // 4. Database Schema & Migrations (HIGH)
    if (
      /\b(prisma|schema|migration|table|relation|column|database)\b/i.test(pLower) ||
      filesStr.includes('schema.prisma') ||
      filesStr.includes('migrations')
    ) {
      factors.database_schema = true;
      reasons.push('Alters database schema, Prisma models, or migrations');
    }

    // 5. API Contracts (MEDIUM / HIGH)
    if (
      /\b(api|endpoint|controller|dto|route|rest|payload)\b/i.test(pLower) ||
      filesStr.includes('controller') ||
      filesStr.includes('dto')
    ) {
      factors.api_contract = true;
      reasons.push('Affects API endpoints, controllers, or request/response DTOs');
    }

    // 6. LiveKit & Video (MEDIUM)
    if (/\b(livekit|video|audio|meeting|room|stream|egress|ingress)\b/i.test(pLower) || filesStr.includes('live-class')) {
      factors.livekit = true;
      reasons.push('Interacts with LiveKit real-time communication infrastructure');
    }

    // 7. Redis Cache (LOW / MEDIUM)
    if (/\b(redis|cache|key|pubsub|ttl)\b/i.test(pLower)) {
      factors.redis = true;
      reasons.push('Uses Redis caching (must use nexa:dev:* or nexa:ai:* namespaces)');
    }

    // 8. Frontend & UI (LOW / MEDIUM)
    if (/\b(ui|frontend|page|component|css|style|tailwind|button|view|client)\b/i.test(pLower) || filesStr.includes('apps/web')) {
      factors.frontend = true;
    }

    // 9. Scope evaluation
    const wordCount = prompt.split(/\s+/).length;
    if (wordCount > 35 || relevantFiles.length > 5) {
      factors.scope_size = 'LARGE';
      reasons.push('Large scope size covering multiple modules or files');
    }

    // Determine overall level
    let level = 'MEDIUM';
    let isBlocked = false;

    if (factors.production_target || factors.production_db || factors.destructive_operation) {
      level = 'CRITICAL';
      isBlocked = true;
    } else if (factors.database_schema || factors.auth_security) {
      level = 'HIGH';
    } else if (
      !factors.api_contract &&
      !factors.database_schema &&
      !factors.auth_security &&
      (pLower.startsWith('docs:') || pLower.includes('readme') || pLower.includes('style') || pLower.includes('comment') || (relevantFiles.length > 0 && relevantFiles.every(f => f.endsWith('.md'))))
    ) {
      level = 'LOW';
    }

    return {
      level,
      is_blocked: isBlocked,
      requires_approval: true,
      factors,
      reasons: reasons.length > 0 ? reasons : ['Standard development feature within isolated development scope'],
      safety_rules: [
        'Development environment ONLY (/opt/nexa-chess/NexaGen-dev)',
        'Production environment (/opt/nexa-chess/NexaGen) is strictly BLOCKED',
        'PostgreSQL target is vps_dev only (nexa_chess is strictly BLOCKED)',
        'Redis keys must use nexa:dev:* or nexa:ai:* namespaces',
        'LiveKit rooms must follow dev-ai-<task-id>-<purpose> convention',
        'Human approval is mandatory before execution'
      ]
    };
  }

  /**
   * Formats risk analysis into a clean text block for CLI output.
   */
  static formatSummary(riskResult) {
    const icon = riskResult.level === 'CRITICAL' ? '🛑' : riskResult.level === 'HIGH' ? '⚠️' : riskResult.level === 'MEDIUM' ? '🔷' : '🟢';
    const lines = [
      `${icon} Risk Level:    ${riskResult.level}`,
      `   Status:        ${riskResult.is_blocked ? 'BLOCKED (Production Safety Violation)' : 'AWAITING_HUMAN_APPROVAL'}`,
      `   Reasons:`
    ];
    riskResult.reasons.forEach(r => lines.push(`     • ${r}`));
    return lines.join('\n');
  }
}

module.exports = RiskEngine;
