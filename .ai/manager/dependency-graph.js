/**
 * Nexa AI Development System — Phase 6 Dependency Graph Engine
 * Builds, validates, and evaluates DAG dependencies for multi-task orchestration.
 *
 * CRITICAL RULES:
 * - Prevent circular dependencies (A -> B -> A).
 * - Prevent self-dependencies (A -> A).
 * - Prevent execution of tasks with missing or failed dependencies.
 */

class DependencyGraph {
  constructor(tasks = []) {
    this.tasks = tasks;
    this.taskMap = new Map();
    for (const t of tasks) {
      if (t && t.task_id) {
        this.taskMap.set(t.task_id, t);
      }
    }
  }

  /**
   * Validates the graph for circular, self, and missing dependencies.
   */
  validateGraph(knownCompletedIds = new Set(), knownFailedIds = new Set()) {
    const errors = [];
    const taskIds = new Set(this.taskMap.keys());

    // 1. Self Dependency & Missing Dependency Check
    for (const [taskId, task] of this.taskMap.entries()) {
      const deps = task.dependencies || [];

      // Self dependency
      if (deps.includes(taskId)) {
        errors.push({
          type: 'SELF_DEPENDENCY',
          task_id: taskId,
          reason: `Task ${taskId} cannot depend on itself.`
        });
      }

      // Missing dependency
      for (const dep of deps) {
        if (!taskIds.has(dep) && !knownCompletedIds.has(dep) && !knownFailedIds.has(dep)) {
          errors.push({
            type: 'MISSING_DEPENDENCY',
            task_id: taskId,
            dependency: dep,
            reason: `Task ${taskId} depends on unknown task ${dep}.`
          });
        }
      }
    }

    // 2. Circular Dependency Detection via DFS
    const visited = new Set();
    const recursionStack = new Set();

    const dfs = (currentId, path = []) => {
      visited.add(currentId);
      recursionStack.add(currentId);
      path.push(currentId);

      const task = this.taskMap.get(currentId);
      const deps = task?.dependencies || [];

      for (const dep of deps) {
        if (!this.taskMap.has(dep)) continue; // External or completed

        if (!visited.has(dep)) {
          const cycle = dfs(dep, [...path]);
          if (cycle) return cycle;
        } else if (recursionStack.has(dep)) {
          const cyclePath = [...path, dep].join(' ➔ ');
          return cyclePath;
        }
      }

      recursionStack.delete(currentId);
      return null;
    };

    for (const taskId of taskIds) {
      if (!visited.has(taskId)) {
        const cycle = dfs(taskId, []);
        if (cycle) {
          errors.push({
            type: 'CIRCULAR_DEPENDENCY',
            cycle,
            reason: `Circular dependency detected: ${cycle}`
          });
          break;
        }
      }
    }

    return {
      ok: errors.length === 0,
      errors
    };
  }

  /**
   * Computes topological sorting order of the tasks.
   */
  topologicalSort() {
    const inDegree = new Map();
    const adj = new Map();

    for (const taskId of this.taskMap.keys()) {
      inDegree.set(taskId, 0);
      adj.set(taskId, []);
    }

    for (const [taskId, task] of this.taskMap.entries()) {
      const deps = task.dependencies || [];
      for (const dep of deps) {
        if (this.taskMap.has(dep)) {
          adj.get(dep).push(taskId);
          inDegree.set(taskId, (inDegree.get(taskId) || 0) + 1);
        }
      }
    }

    const queue = [];
    for (const [taskId, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(taskId);
    }

    const order = [];
    while (queue.length > 0) {
      const u = queue.shift();
      order.push(this.taskMap.get(u));

      for (const v of adj.get(u) || []) {
        inDegree.set(v, inDegree.get(v) - 1);
        if (inDegree.get(v) === 0) {
          queue.push(v);
        }
      }
    }

    return order;
  }

  /**
   * Returns list of tasks whose dependencies are 100% satisfied.
   */
  getRunnableTasks(completedTaskIds = new Set(), runningTaskIds = new Set()) {
    const runnable = [];

    for (const [taskId, task] of this.taskMap.entries()) {
      if (runningTaskIds.has(taskId)) continue;

      const deps = task.dependencies || [];
      const allSatisfied = deps.every(dep => completedTaskIds.has(dep));

      if (allSatisfied) {
        runnable.push(task);
      }
    }

    return runnable;
  }

  /**
   * Returns list of tasks currently waiting on dependencies.
   */
  getBlockedTasks(completedTaskIds = new Set(), failedTaskIds = new Set()) {
    const blocked = [];

    for (const [taskId, task] of this.taskMap.entries()) {
      const deps = task.dependencies || [];
      if (deps.length === 0) continue;

      const failedDeps = deps.filter(dep => failedTaskIds.has(dep));
      const pendingDeps = deps.filter(dep => !completedTaskIds.has(dep) && !failedTaskIds.has(dep));

      if (failedDeps.length > 0 || pendingDeps.length > 0) {
        blocked.push({
          task,
          task_id: taskId,
          failed_dependencies: failedDeps,
          pending_dependencies: pendingDeps,
          is_failed_blocked: failedDeps.length > 0
        });
      }
    }

    return blocked;
  }

  /**
   * Generates a clean ASCII tree representation of the task graph.
   */
  renderAsciiGraph(rootTaskId = null) {
    const lines = [];
    lines.push('── Task Dependency Graph ──');

    const tasksToRender = rootTaskId && this.taskMap.has(rootTaskId)
      ? [this.taskMap.get(rootTaskId)]
      : Array.from(this.taskMap.values());

    for (const task of tasksToRender) {
      const deps = task.dependencies || [];
      const depStr = deps.length > 0 ? ` (depends on: ${deps.join(', ')})` : ' (root)';
      const caps = task.required_capabilities?.length > 0 ? ` [caps: ${task.required_capabilities.join(', ')}]` : '';
      lines.push(`  • [${task.task_id}] ${task.title || task.objective}${depStr}${caps}`);
    }

    return lines.join('\n');
  }
}

module.exports = DependencyGraph;
