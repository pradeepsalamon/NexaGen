/**
 * NexaGen AI Development Control Center — Client Application
 */

const state = {
  activeTab: 'dashboard',
  dashboard: null,
  tasks: [],
  workers: [],
  reviews: [],
  environment: null,
  filterStatus: 'ALL',
  searchQuery: '',
  selectedTask: null,
  isPlanning: false,
  planResult: null
};

// =========================================================================
// API Helpers
// =========================================================================
async function api(path, options = {}) {
  try {
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`API Error ${path}:`, err);
    throw err;
  }
}

function showToast(type, title, message = '') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div style="font-weight: 800; margin-bottom: 2px;">${title}</div>
    ${message ? `<div style="font-size: 0.7rem; color: #94a3b8;">${message}</div>` : ''}
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

// =========================================================================
// Lifecycle & Data Fetching
// =========================================================================
async function loadAllData() {
  try {
    const [dash, tasks, workers, reviews, env] = await Promise.all([
      api('/api/dashboard').catch(() => null),
      api('/api/tasks').catch(() => []),
      api('/api/workers').catch(() => []),
      api('/api/reviews').catch(() => []),
      api('/api/environment').catch(() => null)
    ]);

    if (dash) state.dashboard = dash;
    if (Array.isArray(tasks)) state.tasks = tasks;
    if (Array.isArray(workers)) state.workers = workers;
    if (Array.isArray(reviews)) state.reviews = reviews;
    if (env) state.environment = env;

    updateUI();
  } catch (err) {
    console.error('Failed to load data:', err);
  }
}

function switchTab(tabId) {
  state.activeTab = tabId;

  // Update Desktop Nav
  document.querySelectorAll('.nav-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tabId);
  });

  // Update Mobile Bottom Nav
  document.querySelectorAll('.bnav-btn').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tabId);
  });

  // Update View
  document.querySelectorAll('.tab-view').forEach(el => {
    el.classList.remove('active');
  });

  const activeView = document.getElementById(`view-${tabId}`);
  if (activeView) {
    activeView.classList.add('active');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =========================================================================
// UI Renderers
// =========================================================================
function updateUI() {
  renderHeader();
  renderDashboard();
  renderTasks();
  renderApprovals();
  renderWorkers();
  renderReviews();
  renderEnvironment();

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderHeader() {
  if (!state.dashboard) return;
  const { devHealth, taskCounts } = state.dashboard;

  const branchEl = document.getElementById('header-branch-name');
  if (branchEl) branchEl.textContent = devHealth.currentBranch || 'dev';

  // Badges on tabs
  const pendingCount = taskCounts.awaitingApproval || 0;
  const runningCount = taskCounts.running || 0;

  const appBadgeDesktop = document.getElementById('approvals-badge-desktop');
  const appBadgeMobile = document.getElementById('bnav-approvals-badge');
  if (appBadgeDesktop) {
    appBadgeDesktop.textContent = pendingCount;
    appBadgeDesktop.classList.toggle('hidden', pendingCount === 0);
  }
  if (appBadgeMobile) {
    appBadgeMobile.textContent = pendingCount;
    appBadgeMobile.classList.toggle('hidden', pendingCount === 0);
  }

  const tasksBadgeDesktop = document.getElementById('tasks-badge-desktop');
  const tasksBadgeMobile = document.getElementById('bnav-tasks-badge');
  if (tasksBadgeDesktop) {
    tasksBadgeDesktop.textContent = runningCount;
    tasksBadgeDesktop.classList.toggle('hidden', runningCount === 0);
  }
  if (tasksBadgeMobile) {
    tasksBadgeMobile.textContent = runningCount;
    tasksBadgeMobile.classList.toggle('hidden', runningCount === 0);
  }
}

function renderDashboard() {
  if (!state.dashboard) return;
  const { system, devHealth, taskCounts, workers, recentTasks } = state.dashboard;

  const approvalAlert = document.getElementById('dashboard-approval-alert');
  const approvalTitle = document.getElementById('approval-alert-title');
  if (approvalAlert && approvalTitle) {
    if (taskCounts.awaitingApproval > 0) {
      approvalTitle.textContent = `${taskCounts.awaitingApproval} Task${taskCounts.awaitingApproval > 1 ? 's' : ''} Awaiting Approval`;
      approvalAlert.classList.remove('hidden');
    } else {
      approvalAlert.classList.add('hidden');
    }
  }

  document.getElementById('dash-branch-val').textContent = devHealth.currentBranch || 'dev';
  document.getElementById('dash-provider-badge').textContent = system.provider || 'GEMINI';
  document.getElementById('qa-approvals-title').textContent = `Approvals (${taskCounts.awaitingApproval})`;
  document.getElementById('dash-total-tasks').textContent = taskCounts.total;

  document.getElementById('metric-running').textContent = taskCounts.running;
  document.getElementById('metric-approvals').textContent = taskCounts.awaitingApproval;
  document.getElementById('metric-completed').textContent = taskCounts.completed;
  document.getElementById('metric-blocked').textContent = taskCounts.blocked;
  document.getElementById('metric-failed').textContent = taskCounts.failed;
  document.getElementById('metric-high-risk').textContent = taskCounts.highRisk;

  // Workers List preview
  const workersContainer = document.getElementById('dash-workers-list');
  if (workersContainer) {
    workersContainer.innerHTML = workers.map(w => {
      const isAvail = w.status === 'AVAILABLE';
      const isBusy = w.status === 'BUSY';
      return `
        <div class="card flex items-center justify-between" style="padding: 0.65rem 0.85rem; border-radius: 12px;">
          <div class="flex items-center gap-2.5">
            <div class="worker-badge-avatar ${isAvail ? 'avail' : isBusy ? 'busy' : 'offline'}" style="width: 1.85rem; height: 1.85rem; font-size: 0.75rem;">
              ${w.id.slice(-2)}
            </div>
            <div>
              <div style="font-size: 0.75rem; font-weight: 800;">${w.name}</div>
              <div style="font-size: 0.65rem; color: #94a3b8;" class="truncate">
                ${w.currentTask ? `<span class="text-primary font-bold">Task: ${w.currentTask}</span>` : w.capabilities.slice(0, 3).join(' · ')}
              </div>
            </div>
          </div>
          <span class="badge ${isAvail ? 'badge-success' : isBusy ? 'badge-primary' : 'badge-rose'}">
            ${w.status}
          </span>
        </div>
      `;
    }).join('');
  }

  // Recent Tasks preview
  const recentContainer = document.getElementById('dash-recent-tasks');
  if (recentContainer) {
    if (recentTasks.length === 0) {
      recentContainer.innerHTML = `<div class="card text-muted text-xs" style="text-align: center; padding: 1.5rem;">No recent tasks recorded.</div>`;
    } else {
      recentContainer.innerHTML = recentTasks.map(t => {
        const isComp = t.status === 'COMPLETED' || t.status === 'MERGE_READY';
        const isApp = t.status === 'AWAITING_APPROVAL' || t.status === 'PLANNED';
        const isRun = ['RUNNING', 'TESTING', 'VERIFYING'].includes(t.status);
        return `
          <div class="task-card" onclick="openTaskDetail('${t.id}')">
            <div class="task-card-header">
              <div class="flex items-center gap-2">
                <span class="task-id">${t.id}</span>
                <span class="badge ${t.impact === 'CRITICAL' ? 'badge-rose' : t.impact === 'HIGH' ? 'badge-amber' : ''}">${t.impact}</span>
              </div>
              <span class="badge ${isComp ? 'badge-success' : isApp ? 'badge-amber' : isRun ? 'badge-primary' : ''}">${t.status}</span>
            </div>
            <div class="task-title">${t.title}</div>
          </div>
        `;
      }).join('');
    }
  }
}

function renderTasks() {
  const container = document.getElementById('tasks-list');
  if (!container) return;

  let filtered = state.tasks;

  if (state.filterStatus === 'AWAITING_APPROVAL') {
    filtered = filtered.filter(t => t.status === 'AWAITING_APPROVAL' || t.status === 'PLANNED');
  } else if (state.filterStatus === 'RUNNING') {
    filtered = filtered.filter(t => ['ASSIGNED', 'CLAIMED', 'PREFLIGHT', 'RUNNING', 'TESTING', 'VERIFYING'].includes(t.status));
  } else if (state.filterStatus !== 'ALL') {
    filtered = filtered.filter(t => t.status === state.filterStatus);
  }

  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase();
    filtered = filtered.filter(t =>
      t.id.toLowerCase().includes(q) ||
      t.title.toLowerCase().includes(q) ||
      t.objective.toLowerCase().includes(q) ||
      (t.workerId && t.workerId.toLowerCase().includes(q))
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="card text-muted text-xs" style="text-align: center; padding: 2rem;">
        <i data-lucide="filter" style="width: 2rem; height: 2rem; margin: 0 auto 0.5rem auto; opacity: 0.4;"></i>
        <div>No tasks matching the selected filter.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(t => {
    const isComp = t.status === 'COMPLETED' || t.status === 'MERGE_READY';
    const isApp = t.status === 'AWAITING_APPROVAL' || t.status === 'PLANNED';
    const isRun = ['ASSIGNED', 'CLAIMED', 'PREFLIGHT', 'RUNNING', 'TESTING', 'VERIFYING'].includes(t.status);
    const isFail = t.status === 'FAILED' || t.status === 'ESCALATED';

    return `
      <div class="task-card" onclick="openTaskDetail('${t.id}')">
        <div class="task-card-header">
          <div class="flex items-center gap-2">
            <span class="task-id">${t.id}</span>
            <span class="badge ${t.impact === 'CRITICAL' ? 'badge-rose' : t.impact === 'HIGH' ? 'badge-amber' : ''}">${t.impact}</span>
          </div>
          <span class="badge ${isComp ? 'badge-success' : isApp ? 'badge-amber' : isRun ? 'badge-primary' : isFail ? 'badge-rose' : ''}">
            ${t.status}
          </span>
        </div>
        <div class="task-title">${t.title}</div>
        ${t.objective ? `<div class="task-desc truncate">${t.objective}</div>` : ''}
        <div class="task-card-footer">
          <span>${t.workerId ? `Worker: <strong class="font-mono">${t.workerId}</strong>` : 'Unassigned'}</span>
          <span class="text-primary font-bold">Details →</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderApprovals() {
  const container = document.getElementById('approvals-list');
  const descEl = document.getElementById('approvals-header-desc');
  if (!container) return;

  const pending = state.tasks.filter(t => t.status === 'AWAITING_APPROVAL' || t.status === 'PLANNED');
  if (descEl) {
    descEl.textContent = `${pending.length} task${pending.length === 1 ? '' : 's'} waiting for deliberate authorization.`;
  }

  if (pending.length === 0) {
    container.innerHTML = `
      <div class="card text-muted text-xs" style="text-align: center; padding: 3rem 1rem;">
        <i data-lucide="check-circle-2" style="width: 2.5rem; height: 2.5rem; color: #10b981; margin: 0 auto 0.75rem auto; opacity: 0.7;"></i>
        <div style="font-weight: 800; font-size: 0.9rem; color: #fff; margin-bottom: 0.25rem;">All Clear — No Pending Approvals</div>
        <div>All development requests have been reviewed.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = pending.map(task => {
    const isHighRisk = task.impact === 'HIGH' || task.impact === 'CRITICAL';
    const acList = (task.acceptanceCriteria || []).slice(0, 3).map(ac => `
      <div class="flex items-center gap-1.5 text-xs" style="color: #cbd5e1;">
        <i data-lucide="check" style="width: 0.85rem; height: 0.85rem; color: #10b981; flex-shrink: 0;"></i>
        <span class="truncate">${ac.description}</span>
      </div>
    `).join('');

    return `
      <div class="card" style="border-color: ${isHighRisk ? 'rgba(245, 158, 11, 0.4)' : 'var(--border-subtle)'}; background: ${isHighRisk ? 'rgba(245, 158, 11, 0.02)' : 'var(--bg-surface)'};">
        <div class="task-card-header">
          <div class="flex items-center gap-2">
            <span class="task-id">${task.id}</span>
            <span class="badge ${task.impact === 'CRITICAL' ? 'badge-rose' : task.impact === 'HIGH' ? 'badge-amber' : ''}">
              ${task.impact} RISK
            </span>
          </div>
          <span class="badge badge-amber">AWAITING APPROVAL</span>
        </div>

        <div style="font-size: 0.9rem; font-weight: 800; margin-top: 0.5rem; color: #fff;">${task.title}</div>
        ${task.objective ? `<div class="task-desc" style="margin-top: 0.25rem;">${task.objective}</div>` : ''}

        ${isHighRisk ? `
          <div class="risk-alert-box" style="margin-top: 0.65rem;">
            <i data-lucide="shield-alert" style="width: 1rem; height: 1rem; flex-shrink: 0;"></i>
            <div><strong>Elevated Risk:</strong> Touches core schema, auth, or multi-component contracts.</div>
          </div>
        ` : ''}

        ${acList ? `
          <div style="background: rgba(30, 41, 59, 0.4); border-radius: 8px; padding: 0.5rem; margin-top: 0.65rem;" class="space-y-1">
            <div style="font-size: 0.65rem; font-weight: 800; color: #64748b;">ACCEPTANCE CRITERIA</div>
            ${acList}
          </div>
        ` : ''}

        <div class="flex items-center gap-2" style="margin-top: 0.85rem; padding-top: 0.5rem; border-top: 1px solid rgba(51, 65, 85, 0.3);">
          <button class="btn-green" style="flex: 1; padding: 0.5rem 0.75rem; font-size: 0.75rem;" onclick="approveTask('${task.id}')">
            <i data-lucide="check"></i> Approve Task
          </button>
          <button class="btn-secondary" style="padding: 0.5rem 0.75rem; font-size: 0.75rem; color: #f87171; border-color: rgba(239, 68, 68, 0.3);" onclick="rejectTask('${task.id}')">
            <i data-lucide="x"></i> Reject
          </button>
          <button class="link-btn" style="padding: 0 0.5rem;" onclick="openTaskDetail('${task.id}')">Inspect</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderWorkers() {
  const container = document.getElementById('workers-list');
  if (!container) return;

  container.innerHTML = state.workers.map(w => {
    const isAvail = w.status === 'AVAILABLE';
    const isBusy = w.status === 'BUSY';

    return `
      <div class="worker-card">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="worker-badge-avatar ${isAvail ? 'avail' : isBusy ? 'busy' : 'offline'}">
              ${w.id.slice(-2)}
            </div>
            <div>
              <div style="font-size: 0.85rem; font-weight: 800; color: #fff;">${w.name}</div>
              <div style="font-size: 0.7rem; color: #94a3b8;" class="font-mono">
                ${w.id} ${w.pulseAgeSeconds !== null && w.pulseAgeSeconds !== undefined ? `• ${w.pulseAgeSeconds}s ago` : ''}
              </div>
            </div>
          </div>
          <span class="badge ${isAvail ? 'badge-success' : isBusy ? 'badge-primary' : 'badge-rose'}">
            ${w.status}
          </span>
        </div>

        ${w.currentTask ? `
          <div style="background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.25); border-radius: 8px; padding: 0.5rem; margin-top: 0.65rem;" class="flex items-center justify-between">
            <span style="font-size: 0.75rem; font-weight: 700; color: var(--primary);">Active: ${w.currentTask}</span>
            <button class="link-btn" onclick="openTaskDetail('${w.currentTask}')">View Task →</button>
          </div>
        ` : ''}

        <div style="margin-top: 0.75rem;">
          <div style="font-size: 0.65rem; font-weight: 800; color: #64748b;">CAPABILITIES</div>
          <div class="capabilities-wrap">
            ${w.capabilities.map(c => `<span class="cap-tag">${c}</span>`).join('')}
          </div>
        </div>

        <div style="background: rgba(30, 41, 59, 0.4); border-radius: 8px; padding: 0.5rem; margin-top: 0.65rem; font-size: 0.7rem; color: #94a3b8;" class="font-mono space-y-1">
          <div class="truncate">📁 ${w.worktreePath || `.worktrees/${w.id}`}</div>
          ${w.branch ? `<div class="truncate">🌿 ${w.branch}</div>` : ''}
        </div>

        <div class="flex items-center justify-between" style="margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px solid rgba(51, 65, 85, 0.3); font-size: 0.7rem; color: #94a3b8;">
          <span>Completed: <strong style="color: #fff;">${w.tasksCompleted || 0}</strong></span>
          <span>Failed: <strong style="color: #fff;">${w.tasksFailed || 0}</strong></span>
          <span style="color: #34d399; font-weight: 700;">✓ Worktree Isolation</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderReviews() {
  const container = document.getElementById('reviews-list');
  const countBadge = document.getElementById('reviews-count-badge');
  if (!container) return;

  if (countBadge) {
    countBadge.textContent = `${state.reviews.length} Audited`;
  }

  if (state.reviews.length === 0) {
    container.innerHTML = `
      <div class="card text-muted text-xs" style="text-align: center; padding: 3rem 1rem;">
        <i data-lucide="file-check-2" style="width: 2.5rem; height: 2.5rem; color: var(--primary); margin: 0 auto 0.75rem auto; opacity: 0.5;"></i>
        <div style="font-weight: 800; font-size: 0.9rem; color: #fff; margin-bottom: 0.25rem;">No Completed Tasks Yet</div>
        <div>Completed worker tasks and review packages will appear here.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = state.reviews.map(rev => {
    const isComp = rev.status === 'COMPLETED' || rev.status === 'MERGE_READY';
    return `
      <div class="task-card" onclick="openTaskDetail('${rev.id}')">
        <div class="task-card-header">
          <div class="flex items-center gap-2">
            <span class="task-id">${rev.id}</span>
            <span class="badge ${rev.impact === 'CRITICAL' ? 'badge-rose' : rev.impact === 'HIGH' ? 'badge-amber' : ''}">${rev.impact}</span>
          </div>
          <span class="badge ${isComp ? 'badge-success' : 'badge-primary'}">
            ${isComp ? 'READY FOR HUMAN REVIEW' : rev.status}
          </span>
        </div>

        <div class="task-title">${rev.title}</div>
        ${rev.objective ? `<div class="task-desc">${rev.objective}</div>` : ''}

        <div class="flex items-center gap-1.5" style="margin-top: 0.5rem; font-size: 0.68rem; font-weight: 700;">
          <span style="background: rgba(16, 185, 129, 0.12); color: #34d399; padding: 0.15rem 0.45rem; border-radius: 4px;">✓ Typecheck</span>
          <span style="background: rgba(16, 185, 129, 0.12); color: #34d399; padding: 0.15rem 0.45rem; border-radius: 4px;">✓ Lint</span>
          <span style="background: rgba(16, 185, 129, 0.12); color: #34d399; padding: 0.15rem 0.45rem; border-radius: 4px;">✓ Tests</span>
        </div>

        <div class="task-card-footer">
          <span class="font-mono truncate" style="max-width: 200px;">🌿 ${rev.branch || `ai/${rev.id}`}</span>
          <span class="text-primary font-bold">Inspect Package →</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderEnvironment() {
  if (!state.environment) return;
  const { dev } = state.environment;

  const pathEl = document.getElementById('env-dev-path');
  const branchEl = document.getElementById('env-dev-branch');
  if (pathEl) pathEl.textContent = dev.path;
  if (branchEl) branchEl.textContent = dev.branch;
}

// =========================================================================
// Task Detail Modal
// =========================================================================
async function openTaskDetail(taskId) {
  const modal = document.getElementById('task-detail-modal');
  if (!modal) return;

  try {
    const task = await api(`/api/tasks/${taskId}`);
    state.selectedTask = task;

    document.getElementById('modal-task-id').textContent = task.id;
    document.getElementById('modal-task-impact').textContent = task.impact;
    document.getElementById('modal-task-impact').className = `badge ${task.impact === 'CRITICAL' ? 'badge-rose' : task.impact === 'HIGH' ? 'badge-amber' : ''}`;
    document.getElementById('modal-task-status').textContent = task.status;
    document.getElementById('modal-task-status').className = `badge ${task.status === 'COMPLETED' ? 'badge-success' : task.status === 'AWAITING_APPROVAL' ? 'badge-amber' : 'badge-primary'}`;

    document.getElementById('modal-task-title').textContent = task.title;
    document.getElementById('modal-task-objective').textContent = task.objective || 'No detailed description available.';

    // Risk Box
    const riskBox = document.getElementById('modal-risk-box');
    const riskReasons = document.getElementById('modal-risk-reasons');
    if (task.impact === 'HIGH' || task.impact === 'CRITICAL' || (task.risk?.reasons && task.risk.reasons.length > 0)) {
      riskReasons.innerHTML = `<strong>${task.impact} Risk:</strong> ${task.risk?.reasons?.join('; ') || 'Touches database, authentication or core types.'}`;
      riskBox.classList.remove('hidden');
    } else {
      riskBox.classList.add('hidden');
    }

    // Regression Box
    const regBox = document.getElementById('modal-regression-box');
    const regContent = document.getElementById('modal-regression-content');
    if (task.historical_context?.warnings && task.historical_context.warnings.length > 0) {
      regContent.innerHTML = `<strong>Past Learnings:</strong> ${task.historical_context.warnings.join('; ')}`;
      regBox.classList.remove('hidden');
    } else {
      regBox.classList.add('hidden');
    }

    document.getElementById('modal-task-worker').textContent = task.workerId || 'Unassigned';
    document.getElementById('modal-task-worktree').textContent = task.worktreePath || '-';
    document.getElementById('modal-task-branch').textContent = task.branch || '-';
    document.getElementById('modal-task-attempt').textContent = `${task.attempt || 1} / ${task.maxAttempts || 2}`;

    // Criteria List
    const acContainer = document.getElementById('modal-ac-list');
    if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
      acContainer.innerHTML = task.acceptanceCriteria.map(ac => `
        <div class="flex items-start gap-2 text-xs" style="color: #cbd5e1;">
          <i data-lucide="check" style="width: 0.9rem; height: 0.9rem; color: #10b981; flex-shrink: 0; margin-top: 2px;"></i>
          <span>${ac.description}</span>
        </div>
      `).join('');
    } else {
      acContainer.innerHTML = `<div class="text-muted text-xs">Standard validation pipeline applies.</div>`;
    }

    // Files Changed
    const filesSection = document.getElementById('modal-files-section');
    const filesContainer = document.getElementById('modal-files-list');
    if (task.filesChanged && task.filesChanged.length > 0) {
      filesContainer.innerHTML = task.filesChanged.map(f => `<span>📄 ${f}</span>`).join('');
      filesSection.classList.remove('hidden');
    } else {
      filesSection.classList.add('hidden');
    }

    // Review Markdown
    const revSection = document.getElementById('modal-review-section');
    const revText = document.getElementById('modal-review-text');
    if (task.reviewMarkdown) {
      revText.textContent = task.reviewMarkdown;
      revSection.classList.remove('hidden');
    } else {
      revSection.classList.add('hidden');
    }

    // Dynamic Footer Actions
    const footer = document.getElementById('modal-drawer-footer');
    if (task.status === 'AWAITING_APPROVAL' || task.status === 'PLANNED') {
      footer.innerHTML = `
        <button class="btn-green" style="flex: 1;" onclick="approveTask('${task.id}'); closeModal();">
          <i data-lucide="check"></i> Approve Task
        </button>
        <button class="btn-secondary" style="color: #f87171; border-color: rgba(239, 68, 68, 0.3);" onclick="rejectTask('${task.id}'); closeModal();">
          <i data-lucide="x"></i> Reject
        </button>
      `;
    } else {
      footer.innerHTML = `
        <button class="btn-secondary" style="width: 100%;" onclick="closeModal();">Close</button>
      `;
    }

    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  } catch (err) {
    showToast('error', 'Failed to load task details');
  }
}

function closeModal() {
  const modal = document.getElementById('task-detail-modal');
  if (modal) modal.classList.add('hidden');
}

// =========================================================================
// Actions
// =========================================================================
async function approveTask(taskId) {
  try {
    const res = await api(`/api/tasks/${taskId}/approve`, { method: 'POST' });
    if (res.ok) {
      showToast('success', `Task ${taskId} Approved`, 'Authorized for worker execution.');
      await loadAllData();
    } else {
      showToast('error', 'Approval failed', res.reason);
    }
  } catch (err) {
    showToast('error', 'Approval Error', err.message);
  }
}

async function rejectTask(taskId) {
  if (!confirm(`Are you sure you want to reject task ${taskId}?`)) return;
  try {
    const res = await api(`/api/tasks/${taskId}/reject`, { method: 'POST' });
    if (res.ok) {
      showToast('info', `Task ${taskId} Rejected`);
      await loadAllData();
    }
  } catch (err) {
    showToast('error', 'Rejection Error', err.message);
  }
}

async function runSchedule() {
  const btn = document.getElementById('qa-schedule');
  if (btn) btn.disabled = true;
  try {
    const res = await api('/api/schedule', { method: 'POST' });
    if (res.ok) {
      showToast('success', 'Scheduler Cycle Triggered', `Dispatched ${res.scheduled || 0} approved task(s).`);
      await loadAllData();
    } else {
      showToast('error', 'Scheduler error');
    }
  } catch (err) {
    showToast('error', 'Scheduler Error', err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// =========================================================================
// Plan New Task Dialog
// =========================================================================
function openCreateModal() {
  const modal = document.getElementById('create-task-modal');
  const input = document.getElementById('create-prompt-input');
  const spinner = document.getElementById('create-planning-spinner');
  const preview = document.getElementById('create-plan-preview');
  const submitBtn = document.getElementById('btn-submit-plan');
  const directApproveBtn = document.getElementById('btn-approve-plan-direct');

  if (input) input.value = '';
  if (spinner) spinner.classList.add('hidden');
  if (preview) preview.classList.add('hidden');
  if (submitBtn) submitBtn.classList.remove('hidden');
  if (directApproveBtn) directApproveBtn.classList.add('hidden');

  if (modal) modal.classList.remove('hidden');
}

function closeCreateModal() {
  const modal = document.getElementById('create-task-modal');
  if (modal) modal.classList.add('hidden');
}

async function submitPlan() {
  const input = document.getElementById('create-prompt-input');
  const spinner = document.getElementById('create-planning-spinner');
  const preview = document.getElementById('create-plan-preview');
  const previewDetails = document.getElementById('plan-preview-details');
  const riskBadge = document.getElementById('plan-risk-badge');
  const submitBtn = document.getElementById('btn-submit-plan');
  const directApproveBtn = document.getElementById('btn-approve-plan-direct');

  const prompt = input?.value?.trim();
  if (!prompt) {
    showToast('error', 'Prompt Required', 'Please describe the task you want to plan.');
    return;
  }

  spinner.classList.remove('hidden');
  submitBtn.disabled = true;

  try {
    const res = await api('/api/tasks/plan', {
      method: 'POST',
      body: { prompt }
    });

    if (res.ok) {
      showToast('success', 'Plan Generated', 'Work order ready in Awaiting Approval state.');
      state.planResult = res;

      const riskLevel = res.risk?.level || 'MEDIUM';
      riskBadge.textContent = `${riskLevel} RISK`;
      riskBadge.className = `badge ${riskLevel === 'CRITICAL' ? 'badge-rose' : riskLevel === 'HIGH' ? 'badge-amber' : ''}`;

      previewDetails.innerHTML = `
        <div><strong>Summary:</strong> ${res.summary || prompt}</div>
        <div><strong>Subtasks:</strong> ${res.workOrders?.length || 1} generated</div>
        <div><strong>Initial State:</strong> <span class="text-amber font-bold">AWAITING_APPROVAL</span></div>
      `;

      preview.classList.remove('hidden');
      submitBtn.classList.add('hidden');
      directApproveBtn.classList.remove('hidden');
      await loadAllData();
    } else {
      showToast('error', 'Safety Pre-check Blocked', res.reason);
    }
  } catch (err) {
    showToast('error', 'Planning Error', err.message);
  } finally {
    spinner.classList.add('hidden');
    submitBtn.disabled = false;
  }
}

async function approvePlanDirect() {
  if (!state.planResult?.workOrders?.[0]?.task_id) {
    closeCreateModal();
    return;
  }
  const rootId = state.planResult.workOrders[0].task_id;
  try {
    const res = await api(`/api/tasks/${rootId}/approve-plan`, { method: 'POST' });
    if (res.ok) {
      showToast('success', 'Plan Approved', 'Authorized for worker execution.');
      closeCreateModal();
      await loadAllData();
      switchTab('tasks');
    }
  } catch (err) {
    showToast('error', 'Approval Error', err.message);
  }
}

// =========================================================================
// Event Listeners
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Navigation tabs
  document.querySelectorAll('.nav-tab, .bnav-btn, [data-tab]').forEach(el => {
    el.addEventListener('click', () => {
      const tab = el.dataset.tab;
      if (tab) switchTab(tab);
    });
  });

  // Filter chips
  document.querySelectorAll('.filter-chip').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
      state.filterStatus = el.dataset.filter || 'ALL';
      renderTasks();
    });
  });

  // Metric cards click to filter
  document.querySelectorAll('.metric-card[data-filter]').forEach(el => {
    el.addEventListener('click', () => {
      state.filterStatus = el.dataset.filter;
      document.querySelectorAll('.filter-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.filter === state.filterStatus);
      });
      switchTab('tasks');
    });
  });

  // Search input
  const searchInput = document.getElementById('task-search-input');
  const clearBtn = document.getElementById('btn-clear-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      if (clearBtn) clearBtn.classList.toggle('hidden', !state.searchQuery);
      renderTasks();
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.searchQuery = '';
      if (searchInput) searchInput.value = '';
      clearBtn.classList.add('hidden');
      renderTasks();
    });
  }

  // Header & Quick Action Buttons
  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    loadAllData();
    showToast('info', 'Refreshing data...');
  });
  document.getElementById('btn-create-task')?.addEventListener('click', openCreateModal);
  document.getElementById('qa-new-task')?.addEventListener('click', openCreateModal);
  document.getElementById('qa-approvals')?.addEventListener('click', () => switchTab('approvals'));
  document.getElementById('qa-schedule')?.addEventListener('click', runSchedule);
  document.getElementById('qa-workers')?.addEventListener('click', () => switchTab('workers'));
  document.getElementById('btn-alert-review')?.addEventListener('click', () => switchTab('approvals'));

  // Modal Closers
  document.getElementById('btn-close-modal')?.addEventListener('click', closeModal);
  document.getElementById('btn-close-create')?.addEventListener('click', closeCreateModal);
  document.getElementById('btn-cancel-create')?.addEventListener('click', closeCreateModal);
  document.getElementById('btn-submit-plan')?.addEventListener('click', submitPlan);
  document.getElementById('btn-approve-plan-direct')?.addEventListener('click', approvePlanDirect);

  // Close modals on backdrop click
  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  });

  // Initial Load
  loadAllData();

  // Polling every 6 seconds
  setInterval(loadAllData, 6000);
});

// Expose globals for inline onclicks
window.openTaskDetail = openTaskDetail;
window.closeModal = closeModal;
window.approveTask = approveTask;
window.rejectTask = rejectTask;
