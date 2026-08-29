#!/usr/bin/env node
/**
 * Nexa AI Development System — Task Manager CLI
 * Creates, lists, validates, and manages work orders and completion reports.
 */

const fs = require('fs');
const path = require('path');

const DEV_ROOT = path.resolve(__dirname, '../..');
const AI_DIR = path.join(DEV_ROOT, '.ai');
const TASKS_DIR = path.join(AI_DIR, 'tasks');
const ACTIVE_DIR = path.join(TASKS_DIR, 'active');
const COMPLETED_DIR = path.join(TASKS_DIR, 'completed');
const FAILED_DIR = path.join(TASKS_DIR, 'failed');
const COUNTER_FILE = path.join(TASKS_DIR, 'counter.txt');
const WORK_ORDER_SCHEMA = path.join(AI_DIR, 'schemas', 'work-order.schema.json');

function getNextTaskId() {
  let counter = 1;
  if (fs.existsSync(COUNTER_FILE)) {
    const raw = fs.readFileSync(COUNTER_FILE, 'utf-8').trim();
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > 0) {
      counter = parsed;
    }
  }
  const taskId = `NEXA-${String(counter).padStart(4, '0')}`;
  fs.writeFileSync(COUNTER_FILE, String(counter + 1) + '\n', 'utf-8');
  return taskId;
}

function createWorkOrder(opts) {
  const taskId = opts.taskId || getNextTaskId();
  const title = opts.title || 'Untitled Task';
  const objective = opts.objective || title;
  const priority = opts.priority || 'medium';
  const type = opts.type || 'feature_implementation';
  const complexity = opts.complexity || 'simple';
  const branchName = `ai/${taskId}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30)}`;

  const workOrder = {
    task_id: taskId,
    title: title,
    objective: objective,
    priority: priority,
    type: type,
    complexity: complexity,
    environment: {
      server: 'nexa-vcn',
      environment: 'development',
      project_path: DEV_ROOT,
      branch: branchName
    },
    context: {
      relevant_files: opts.relevant_files || [],
      related_models: opts.related_models || [],
      architecture_notes: opts.architecture_notes || 'NexaGen monorepo dev environment'
    },
    requirements: opts.requirements && opts.requirements.length > 0 ? opts.requirements : [objective],
    constraints: opts.constraints || [
      'Do not modify production code or configs',
      'Follow existing repository coding patterns and AGENTS.md rules',
      'Must pass verify.sh (typecheck, lint, build, test)'
    ],
    acceptance_criteria: opts.acceptance_criteria && opts.acceptance_criteria.length > 0 ? opts.acceptance_criteria : ['Implementation satisfies objective and passes verification'],
    required_tests: opts.required_tests || ['typecheck', 'lint', 'build', 'unit_tests'],
    safety: {
      allowed_paths: ['/opt/nexa-chess/NexaGen-dev/'],
      blocked_paths: ['/opt/nexa-chess/NexaGen/', '/etc/', '/var/', '/usr/', '/root/'],
      allowed_databases: ['vps_dev'],
      blocked_databases: ['nexa_chess', 'postgres'],
      requires_approval: false
    },
    assigned_worker: 'nexa-dev-01',
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    created_at: new Date().toISOString(),
    timeout_minutes: opts.timeout_minutes || 30
  };

  const targetPath = path.join(ACTIVE_DIR, `${taskId}.json`);
  fs.writeFileSync(targetPath, JSON.stringify(workOrder, null, 2), 'utf-8');
  console.log(`\n✅ Work order created successfully:`);
  console.log(`   Task ID:  ${taskId}`);
  console.log(`   Title:    ${title}`);
  console.log(`   Priority: ${priority}`);
  console.log(`   Branch:   ${branchName}`);
  console.log(`   File:     ${targetPath}\n`);
  return workOrder;
}

function listTasks() {
  console.log('\n============================================================');
  console.log('              Nexa AI Development Tasks');
  console.log('============================================================\n');

  console.log('── Active Tasks ──');
  const activeFiles = fs.existsSync(ACTIVE_DIR) ? fs.readdirSync(ACTIVE_DIR).filter(f => f.endsWith('.json')) : [];
  if (activeFiles.length === 0) {
    console.log('  (No active tasks)');
  } else {
    for (const f of activeFiles) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(ACTIVE_DIR, f), 'utf-8'));
        const lockExists = fs.existsSync(path.join(ACTIVE_DIR, f.replace('.json', '.lock')));
        const lockStatus = lockExists ? '[LOCKED / RUNNING]' : '[READY]';
        console.log(`  • ${data.task_id} ${lockStatus}: ${data.title} (${data.priority}, ${data.type})`);
      } catch {
        console.log(`  • ${f} (Malformed JSON)`);
      }
    }
  }

  console.log('\n── Completed Tasks ──');
  const completedFiles = fs.existsSync(COMPLETED_DIR) ? fs.readdirSync(COMPLETED_DIR).filter(f => f.endsWith('.json')) : [];
  if (completedFiles.length === 0) {
    console.log('  (No completed tasks)');
  } else {
    for (const f of completedFiles.slice(-10)) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(COMPLETED_DIR, f), 'utf-8'));
        console.log(`  • ${data.task_id} [COMPLETED]: ${data.summary || data.title} (${data.completed_at || 'date unknown'})`);
      } catch {
        console.log(`  • ${f}`);
      }
    }
  }

  console.log('\n── Failed / Interrupted Tasks ──');
  const failedFiles = fs.existsSync(FAILED_DIR) ? fs.readdirSync(FAILED_DIR).filter(f => f.endsWith('.json')) : [];
  if (failedFiles.length === 0) {
    console.log('  (No failed tasks)');
  } else {
    for (const f of failedFiles.slice(-5)) {
      console.log(`  • ${f}`);
    }
  }
  console.log('\n============================================================\n');
}

function showTask(taskId) {
  const activeFile = path.join(ACTIVE_DIR, `${taskId}.json`);
  const completedFile = path.join(COMPLETED_DIR, `${taskId}.json`);
  const failedFile = path.join(FAILED_DIR, `${taskId}.json`);

  let file = null;
  let status = 'UNKNOWN';

  if (fs.existsSync(activeFile)) {
    file = activeFile;
    status = 'ACTIVE';
  } else if (fs.existsSync(completedFile)) {
    file = completedFile;
    status = 'COMPLETED';
  } else if (fs.existsSync(failedFile)) {
    file = failedFile;
    status = 'FAILED';
  }

  if (!file) {
    console.error(`❌ Task ${taskId} not found.`);
    process.exit(1);
  }

  console.log(`\n=== Task ${taskId} (${status}) ===`);
  console.log(fs.readFileSync(file, 'utf-8'));
}

// CLI argument parsing
const args = process.argv.slice(2);
const command = args[0] || 'list';

if (command === 'create') {
  let title = '';
  let objective = '';
  let priority = 'medium';
  let type = 'feature_implementation';
  const requirements = [];
  const acceptance = [];

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--title' && args[i + 1]) title = args[++i];
    else if (args[i] === '--objective' && args[i + 1]) objective = args[++i];
    else if (args[i] === '--priority' && args[i + 1]) priority = args[++i];
    else if (args[i] === '--type' && args[i + 1]) type = args[++i];
    else if (args[i] === '--req' && args[i + 1]) requirements.push(args[++i]);
    else if (args[i] === '--accept' && args[i + 1]) acceptance.push(args[++i]);
  }

  if (!title) {
    console.error('❌ Error: --title is required to create a task.');
    console.error('Usage: node .ai/scripts/task-manager.js create --title "..." --objective "..."');
    process.exit(1);
  }

  createWorkOrder({
    title,
    objective: objective || title,
    priority,
    type,
    requirements,
    acceptance_criteria: acceptance
  });
} else if (command === 'list') {
  listTasks();
} else if (command === 'show') {
  const taskId = args[1];
  if (!taskId) {
    console.error('❌ Error: Task ID required (e.g. NEXA-0001)');
    process.exit(1);
  }
  showTask(taskId);
} else {
  console.log('Nexa AI Task Manager');
  console.log('Commands:');
  console.log('  list                                   List active, completed, failed tasks');
  console.log('  create --title "..." [--objective "..."] Create a new work order');
  console.log('  show <TASK_ID>                         View a task JSON');
}
