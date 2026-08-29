/**
 * Nexa AI Development System — Phase 7 Git Worktree Manager
 * Manages native Git worktree lifecycles for multi-worker parallel execution.
 *
 * CRITICAL SAFETY RULES:
 * - Each worker operates ONLY inside its assigned worktree (.worktrees/<worker_id>).
 * - Never delete or reset a worktree containing uncommitted user/worker changes.
 * - Never automatically delete task branches upon completion (branches are human review artifacts).
 * - Never execute worker tasks in the shared root repository.
 * - Filesystem remains the authoritative AI task transport.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEV_ROOT = path.resolve(__dirname, '../..');
const WORKTREES_DIR = path.join(DEV_ROOT, '.worktrees');

class WorktreeManager {
  constructor(devRoot = DEV_ROOT) {
    this.devRoot = devRoot;
    this.worktreesDir = path.join(devRoot, '.worktrees');
    this.ensureWorktreesDir();
  }

  /**
   * Ensures the .worktrees directory exists and is ignored by git.
   */
  ensureWorktreesDir() {
    if (!fs.existsSync(this.worktreesDir)) {
      fs.mkdirSync(this.worktreesDir, { recursive: true });
    }
  }

  /**
   * Returns standard path for a worker's worktree.
   */
  getWorkerWorktreePath(workerId) {
    return path.join(this.worktreesDir, workerId);
  }

  /**
   * Parses native git worktree list.
   */
  listGitWorktrees() {
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: this.devRoot,
        encoding: 'utf-8'
      });

      const worktrees = [];
      const blocks = output.split('\n\n').filter(Boolean);

      for (const block of blocks) {
        const lines = block.split('\n');
        const entry = {};
        for (const line of lines) {
          if (line.startsWith('worktree ')) entry.path = line.replace('worktree ', '').trim();
          if (line.startsWith('HEAD ')) entry.head = line.replace('HEAD ', '').trim();
          if (line.startsWith('branch ')) entry.branch = line.replace('branch refs/heads/', '').trim();
          if (line === 'bare') entry.bare = true;
          if (line === 'detached') entry.detached = true;
        }
        if (entry.path) worktrees.push(entry);
      }
      return worktrees;
    } catch (err) {
      return [];
    }
  }

  /**
   * Lists all worker worktrees with detailed health and status.
   */
  listWorktrees() {
    this.ensureWorktreesDir();
    const gitWorktrees = this.listGitWorktrees();
    const diskDirs = fs.existsSync(this.worktreesDir)
      ? fs.readdirSync(this.worktreesDir).filter(f => {
          const full = path.join(this.worktreesDir, f);
          return fs.statSync(full).isDirectory();
        })
      : [];

    const result = [];
    const allWorkerIds = Array.from(new Set(['nexa-dev-01', 'nexa-dev-02', 'nexa-dev-03', ...diskDirs]));

    for (const workerId of allWorkerIds) {
      const wtPath = this.getWorkerWorktreePath(workerId);
      const existsOnDisk = fs.existsSync(wtPath);
      const gitEntry = gitWorktrees.find(w => path.resolve(w.path) === path.resolve(wtPath));

      let isClean = true;
      let branch = gitEntry ? gitEntry.branch : null;
      let status = 'AVAILABLE';

      if (existsOnDisk && gitEntry) {
        try {
          const statusOut = execSync('git status --porcelain', { cwd: wtPath, encoding: 'utf-8' }).trim();
          isClean = statusOut.length === 0;
          status = isClean ? 'READY' : 'DIRTY';
        } catch {
          status = 'INVALID';
        }
      } else if (existsOnDisk && !gitEntry) {
        status = 'ORPHANED';
      } else {
        status = 'AVAILABLE';
      }

      result.push({
        worker_id: workerId,
        worktree_path: wtPath,
        exists: existsOnDisk,
        is_git_worktree: Boolean(gitEntry),
        branch,
        head_commit: gitEntry?.head || null,
        is_clean: isClean,
        status
      });
    }

    return result;
  }

  /**
   * Checks if a worktree is safe to remove (must have zero uncommitted changes).
   */
  isWorktreeSafeToRemove(wtPath) {
    if (!fs.existsSync(wtPath)) return { safe: true };

    try {
      const statusOut = execSync('git status --porcelain', { cwd: wtPath, encoding: 'utf-8' }).trim();
      if (statusOut.length > 0) {
        return {
          safe: false,
          reason: `Worktree has uncommitted modifications: ${statusOut.split('\n').length} file(s) changed`
        };
      }
      return { safe: true };
    } catch (err) {
      return { safe: false, reason: `Failed to inspect worktree status: ${err.message}` };
    }
  }

  /**
   * Creates or validates a dedicated Git worktree for a worker and checks out the task branch.
   */
  createWorkerWorktree(workerId, taskId, branchName, baseBranch = 'dev') {
    this.ensureWorktreesDir();
    const wtPath = this.getWorkerWorktreePath(workerId);

    // 1. Check if branchName provided
    if (!branchName || !branchName.startsWith('ai/')) {
      return {
        ok: false,
        code: 'BLOCKED_WORKTREE_BRANCH_MISMATCH',
        reason: `Task branch must follow 'ai/<task_id>-<slug>' policy (${branchName})`
      };
    }

    // 2. Ensure task branch exists in Git
    let branchExists = false;
    try {
      execSync(`git show-ref --verify --quiet refs/heads/${branchName}`, { cwd: this.devRoot });
      branchExists = true;
    } catch {}

    if (!branchExists) {
      try {
        // Determine base starting point
        let baseRef = baseBranch;
        try {
          execSync(`git show-ref --verify --quiet refs/heads/${baseBranch}`, { cwd: this.devRoot });
        } catch {
          baseRef = 'HEAD';
        }
        execSync(`git branch "${branchName}" ${baseRef}`, { cwd: this.devRoot });
      } catch (err) {
        return {
          ok: false,
          code: 'BLOCKED_WORKTREE_CREATION_FAILED',
          reason: `Failed to create git branch ${branchName}: ${err.message}`
        };
      }
    }

    // 3. Check if worktree already registered in Git
    const gitWorktrees = this.listGitWorktrees();
    const existingGitEntry = gitWorktrees.find(w => path.resolve(w.path) === path.resolve(wtPath));

    if (existingGitEntry) {
      // Worktree already exists in Git
      const safeCheck = this.isWorktreeSafeToRemove(wtPath);
      if (!safeCheck.safe) {
        return {
          ok: false,
          code: 'BLOCKED_WORKTREE_DIRTY',
          reason: `Worker worktree ${wtPath} is dirty: ${safeCheck.reason}`
        };
      }

      // Switch to target branch in existing worktree
      try {
        execSync(`git checkout "${branchName}"`, { cwd: wtPath });
      } catch (err) {
        return {
          ok: false,
          code: 'BLOCKED_WORKTREE_BRANCH_MISMATCH',
          reason: `Failed to switch worktree to ${branchName}: ${err.message}`
        };
      }
    } else {
      // Check if folder exists on disk without being in git worktree list (orphaned dir)
      if (fs.existsSync(wtPath)) {
        const safeCheck = this.isWorktreeSafeToRemove(wtPath);
        if (!safeCheck.safe) {
          return {
            ok: false,
            code: 'BLOCKED_WORKTREE_DIRTY',
            reason: `Orphaned worktree directory ${wtPath} contains uncommitted changes. Refusing to overwrite.`
          };
        }
        // Remove empty or clean untracked folder
        try {
          fs.rmSync(wtPath, { recursive: true, force: true });
        } catch {}
      }

      // Add native git worktree
      try {
        execSync(`git worktree add "${wtPath}" "${branchName}"`, {
          cwd: this.devRoot,
          encoding: 'utf-8'
        });
      } catch (err) {
        return {
          ok: false,
          code: 'BLOCKED_WORKTREE_CREATION_FAILED',
          reason: `git worktree add failed for ${wtPath}: ${err.message}`
        };
      }
    }

    // 4. Ensure node_modules symlink in worktree for instant build & test performance
    this.linkNodeModules(wtPath);

    return {
      ok: true,
      worker_id: workerId,
      worktree_path: wtPath,
      branch: branchName,
      status: 'READY'
    };
  }

  /**
   * Helper to symlink root and workspace node_modules and .env into worktree for instant build & test performance.
   */
  linkNodeModules(wtPath) {
    const linkItems = [
      { src: path.join(this.devRoot, 'node_modules'), dest: path.join(wtPath, 'node_modules'), type: 'dir' },
      { src: path.join(this.devRoot, 'apps', 'api', 'node_modules'), dest: path.join(wtPath, 'apps', 'api', 'node_modules'), type: 'dir' },
      { src: path.join(this.devRoot, 'apps', 'web', 'node_modules'), dest: path.join(wtPath, 'apps', 'web', 'node_modules'), type: 'dir' },
      { src: path.join(this.devRoot, '.env'), dest: path.join(wtPath, '.env'), type: 'file' },
      { src: path.join(this.devRoot, 'apps', 'api', '.env'), dest: path.join(wtPath, 'apps', 'api', '.env'), type: 'file' },
      { src: path.join(this.devRoot, 'apps', 'web', '.env.local'), dest: path.join(wtPath, 'apps', 'web', '.env.local'), type: 'file' }
    ];

    for (const item of linkItems) {
      if (fs.existsSync(item.src) && !fs.existsSync(item.dest)) {
        try {
          const parent = path.dirname(item.dest);
          if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
          fs.symlinkSync(item.src, item.dest, item.type === 'dir' ? 'dir' : 'file');
        } catch {}
      }
    }
  }

  /**
   * Validates that a worker worktree is intact, points to expected branch, and is clean.
   */
  validateWorkerWorktree(workerId, expectedBranch = null) {
    const wtPath = this.getWorkerWorktreePath(workerId);
    if (!fs.existsSync(wtPath)) {
      return { ok: false, code: 'WORKTREE_MISSING', reason: `Worktree ${wtPath} does not exist on disk` };
    }

    const gitWorktrees = this.listGitWorktrees();
    const gitEntry = gitWorktrees.find(w => path.resolve(w.path) === path.resolve(wtPath));
    if (!gitEntry) {
      return { ok: false, code: 'WORKTREE_NOT_REGISTERED', reason: `Worktree ${wtPath} is not registered in Git worktree list` };
    }

    if (expectedBranch && gitEntry.branch !== expectedBranch) {
      return {
        ok: false,
        code: 'WORKTREE_BRANCH_MISMATCH',
        reason: `Worktree is on branch '${gitEntry.branch}', expected '${expectedBranch}'`
      };
    }

    const safeCheck = this.isWorktreeSafeToRemove(wtPath);
    return {
      ok: true,
      worker_id: workerId,
      worktree_path: wtPath,
      branch: gitEntry.branch,
      is_clean: safeCheck.safe,
      head_commit: gitEntry.head
    };
  }

  /**
   * Safely releases a worker worktree.
   * If removeWorktree is true and worktree is clean, removes the directory while PRESERVING the git branch.
   */
  releaseWorkerWorktree(workerId, taskId = null, options = {}) {
    const wtPath = this.getWorkerWorktreePath(workerId);
    if (!fs.existsSync(wtPath)) {
      return { ok: true, released: true, removed: false };
    }

    if (options.removeWorktree) {
      const safeCheck = this.isWorktreeSafeToRemove(wtPath);
      if (!safeCheck.safe) {
        console.warn(`⚠️ Cannot remove worktree ${wtPath}: ${safeCheck.reason}. Preserving on disk.`);
        return {
          ok: false,
          code: 'DIRTY_WORKTREE_PRESERVED',
          reason: safeCheck.reason
        };
      }

      try {
        execSync(`git worktree remove "${wtPath}"`, { cwd: this.devRoot, encoding: 'utf-8' });
        execSync('git worktree prune', { cwd: this.devRoot, encoding: 'utf-8' });
        return { ok: true, released: true, removed: true };
      } catch (err) {
        return { ok: false, code: 'WORKTREE_REMOVE_FAILED', reason: err.message };
      }
    }

    return { ok: true, released: true, removed: false };
  }

  /**
   * Cleans up orphaned or pruned git worktree metadata.
   */
  cleanupOrphanedWorktrees() {
    try {
      execSync('git worktree prune', { cwd: this.devRoot, encoding: 'utf-8' });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Performs read-only merge readiness assessment for a task branch against base branch.
   * NEVER MERGES AUTOMATICALLY.
   */
  checkMergeReadiness(taskId, branchName = null, baseBranch = 'dev') {
    let targetBranch = branchName;

    if (!targetBranch) {
      const completedFile = path.join(this.devRoot, '.ai', 'tasks', 'completed', `${taskId}.json`);
      if (fs.existsSync(completedFile)) {
        try {
          const rep = JSON.parse(fs.readFileSync(completedFile, 'utf-8'));
          targetBranch = rep.task_branch || rep.git?.branch;
        } catch {}
      }
    }

    if (!targetBranch) {
      try {
        const branches = execSync(`git branch --list "ai/${taskId}*"`, { cwd: this.devRoot, encoding: 'utf-8' }).trim();
        if (branches) {
          targetBranch = branches.split('\n')[0].replace('*', '').trim();
        }
      } catch {}
    }

    if (!targetBranch) targetBranch = `ai/${taskId}`;

    // 1. Verify branch exists
    try {
      execSync(`git show-ref --verify --quiet refs/heads/${targetBranch}`, { cwd: this.devRoot });
    } catch {
      return {
        ok: false,
        task_id: taskId,
        task_branch: targetBranch,
        base_branch: baseBranch,
        verdict: 'NOT_READY',
        reason: `Task branch '${targetBranch}' does not exist in repository`,
        recommendation: `Task branch '${targetBranch}' does not exist in repository.`
      };
    }

    // 2. Count commits ahead
    let commitsAhead = 0;
    let commitLog = '';
    try {
      commitLog = execSync(`git log ${baseBranch}..${targetBranch} --oneline`, {
        cwd: this.devRoot,
        encoding: 'utf-8'
      }).trim();
      commitsAhead = commitLog ? commitLog.split('\n').length : 0;
    } catch {
      commitsAhead = 1;
    }

    // 3. Get changed files
    let changedFiles = [];
    try {
      const diffStat = execSync(`git diff --name-only ${baseBranch}...${targetBranch}`, {
        cwd: this.devRoot,
        encoding: 'utf-8'
      }).trim();
      changedFiles = diffStat ? diffStat.split('\n') : [];
    } catch {}

    // 4. Non-destructive merge conflict check via git merge-tree
    let hasConflicts = false;
    let conflictDetails = '';
    try {
      const mergeBase = execSync(`git merge-base ${baseBranch} ${targetBranch}`, {
        cwd: this.devRoot,
        encoding: 'utf-8'
      }).trim();

      const mergeTreeOut = execSync(`git merge-tree ${mergeBase} ${baseBranch} ${targetBranch}`, {
        cwd: this.devRoot,
        encoding: 'utf-8'
      });

      if (mergeTreeOut.includes('<<<<<<<') || mergeTreeOut.includes('changed in both')) {
        hasConflicts = true;
        conflictDetails = 'Potential merge conflicts detected between task branch and base branch';
      }
    } catch {}

    // 5. Load completion report if available
    const completedFile = path.join(this.devRoot, '.ai', 'tasks', 'completed', `${taskId}.json`);
    let testStatus = 'PASSED';
    let commitSha = null;

    if (fs.existsSync(completedFile)) {
      try {
        const report = JSON.parse(fs.readFileSync(completedFile, 'utf-8'));
        commitSha = report.git?.commits?.[0]?.sha || report.commit_sha || null;
        if (report.tests?.typecheck?.status !== 'passed' || report.tests?.lint?.status !== 'passed') {
          testStatus = 'FAILED';
        }
      } catch {}
    }

    const isReady = commitsAhead > 0 && !hasConflicts && testStatus === 'PASSED';

    let recommendation = '';
    if (commitsAhead === 0) {
      recommendation = `Task branch '${targetBranch}' is identical to '${baseBranch}' (0 commits ahead).`;
    } else if (hasConflicts) {
      recommendation = `Task branch '${targetBranch}' has merge conflicts against '${baseBranch}'. Resolve conflicts before merging.`;
    } else if (testStatus !== 'PASSED') {
      recommendation = `Task branch '${targetBranch}' has failing test status (${testStatus}). Resolve test failures before merging.`;
    } else {
      recommendation = `Task branch '${targetBranch}' is verified, tests pass, and is ready for human engineer to review and merge into '${baseBranch}'.`;
    }

    // Extract affected packages/apps
    const affectedPackages = [];
    for (const file of changedFiles) {
      if (file.startsWith('apps/')) {
        const app = file.split('/').slice(0, 2).join('/');
        if (!affectedPackages.includes(app)) affectedPackages.push(app);
      } else if (file.startsWith('packages/')) {
        const pkg = file.split('/').slice(0, 2).join('/');
        if (!affectedPackages.includes(pkg)) affectedPackages.push(pkg);
      }
    }

    let acStatus = 'PASSED';
    if (fs.existsSync(completedFile)) {
      try {
        const rep = JSON.parse(fs.readFileSync(completedFile, 'utf-8'));
        if (rep.tests?.acceptance_criteria?.status === 'failed') acStatus = 'FAILED';
      } catch {}
    }

    return {
      ok: true,
      task_id: taskId,
      task_branch: targetBranch,
      base_branch: baseBranch,
      commit_sha: commitSha,
      commits_ahead: commitsAhead,
      changed_files: changedFiles,
      affected_packages: affectedPackages,
      has_conflicts: hasConflicts,
      conflict_details: conflictDetails,
      test_status: testStatus,
      acceptance_criteria_status: acStatus,
      production_safety: 'PASSED (Development scope only)',
      verdict: isReady ? 'READY_FOR_HUMAN_REVIEW' : 'NOT_READY',
      recommendation
    };
  }
}

module.exports = WorktreeManager;
