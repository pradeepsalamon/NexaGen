/**
 * Nexa AI Development System — Phase 9 Regression Intelligence Engine
 * Deeply indexes and inspects historical tasks to surface past root causes,
 * detects regression risks, recurring bug hotspots, and file churn.
 */

const fs = require('fs');
const path = require('path');

const DEV_ROOT = path.resolve(__dirname, '../..');
const AI_DIR = path.join(DEV_ROOT, '.ai');
const COMPLETED_DIR = path.join(AI_DIR, 'tasks', 'completed');
const FAILED_DIR = path.join(AI_DIR, 'tasks', 'failed');

class RegressionEngine {
  constructor(tasksCompletedDir = COMPLETED_DIR, tasksFailedDir = FAILED_DIR) {
    this.completedDir = tasksCompletedDir;
    this.failedDir = tasksFailedDir;
  }

  /**
   * Loads all historical task documents from disk.
   */
  loadAllHistoricalTasks() {
    const tasks = [];

    const loadFrom = (dir, statusLabel) => {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(dir, file), 'utf-8');
          const data = JSON.parse(content);
          tasks.push({
            task_id: data.task_id || file.replace('.json', ''),
            status: statusLabel,
            title: data.title || data.summary || 'Untitled',
            objective: data.objective || data.problem_statement || '',
            summary: data.summary || '',
            root_cause: data.root_cause || (data.investigation_findings?.root_cause) || '',
            investigation: data.investigation_findings || null,
            files_changed: (data.files_changed || []).map(f => (typeof f === 'string' ? f : f.path)),
            acceptance_criteria: data.acceptance_criteria || [],
            tests: data.tests || {},
            error_details: data.error_details || data.reason || '',
            attempt: data.attempt || 1,
            completed_at: data.completed_at || data.failed_at || data.created_at || 'unknown'
          });
        } catch {}
      }
    };

    loadFrom(this.completedDir, 'COMPLETED');
    loadFrom(this.failedDir, 'FAILED');

    return tasks.sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
  }

  /**
   * Deep search across descriptions, changed files, root causes, and errors.
   */
  searchHistoricalKnowledge(query = '', limit = 5) {
    const tasks = this.loadAllHistoricalTasks();
    if (!query || query.trim() === '') return tasks.slice(0, limit);

    const tokens = query.toLowerCase().replace(/[^a-z0-9_\-\s]/g, '').split(/\s+/).filter(t => t.length >= 3);
    if (tokens.length === 0) return tasks.slice(0, limit);

    const scored = [];

    for (const t of tasks) {
      let score = 0;
      const titleLower = t.title.toLowerCase();
      const objLower = t.objective.toLowerCase();
      const summaryLower = t.summary.toLowerCase();
      const rootLower = t.root_cause.toLowerCase();
      const filesLower = t.files_changed.join(' ').toLowerCase();
      const errorLower = t.error_details.toLowerCase();

      for (const token of tokens) {
        if (titleLower.includes(token)) score += 5;
        if (objLower.includes(token)) score += 4;
        if (rootLower.includes(token)) score += 6;
        if (filesLower.includes(token)) score += 5;
        if (summaryLower.includes(token)) score += 3;
        if (errorLower.includes(token)) score += 3;
      }

      if (score > 0) {
        scored.push({ task: t, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.task);
  }

  /**
   * Analyzes potential regression risk for a new task against historical changes.
   */
  analyzeRegressionRisk(prompt = '', plannedFiles = []) {
    const history = this.searchHistoricalKnowledge(prompt, 10);
    const plannedFileSet = new Set(plannedFiles.map(f => (typeof f === 'string' ? f : f.path).toLowerCase()));

    const relatedPastBugs = [];
    const recurringHotspots = new Map();
    let pastFailureCount = 0;

    for (const h of history) {
      if (h.status === 'FAILED') {
        pastFailureCount++;
      }

      if (h.root_cause) {
        relatedPastBugs.push({
          task_id: h.task_id,
          title: h.title,
          root_cause: h.root_cause
        });
      }

      for (const f of h.files_changed) {
        const fLower = f.toLowerCase();
        recurringHotspots.set(fLower, (recurringHotspots.get(fLower) || 0) + 1);
      }
    }

    // Check overlap with planned files
    const overlappingFiles = [];
    for (const [file, count] of recurringHotspots.entries()) {
      if (plannedFileSet.has(file) || Array.from(plannedFileSet).some(pf => pf.includes(file) || file.includes(pf))) {
        overlappingFiles.push({ file, modification_count: count });
      }
    }

    let regressionRisk = 'LOW';
    const warnings = [];

    if (overlappingFiles.some(o => o.modification_count >= 3) || pastFailureCount >= 2) {
      regressionRisk = 'HIGH';
      warnings.push(`File hotspot churn detected: ${overlappingFiles.map(o => `${o.file} (${o.modification_count}x)`).join(', ')}`);
    } else if (overlappingFiles.length > 0 || relatedPastBugs.length > 0) {
      regressionRisk = 'MEDIUM';
      warnings.push(`Related historical tasks found with previous root cause context`);
    }

    return {
      regression_risk: regressionRisk,
      related_tasks: history.slice(0, 3).map(h => h.task_id),
      past_root_causes: relatedPastBugs.slice(0, 3),
      overlapping_files: overlappingFiles,
      warnings,
      context_summary: history.slice(0, 3).map(h => `[${h.task_id}] (${h.status}): ${h.title}${h.root_cause ? ` | Root cause: ${h.root_cause}` : ''}`).join('\n')
    };
  }
}

module.exports = RegressionEngine;
