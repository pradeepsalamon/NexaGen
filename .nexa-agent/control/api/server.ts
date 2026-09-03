import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import * as path from 'path';
import { spawn } from 'child_process';

// Import orchestrator methods directly
// Assuming this is run from control/api/ using ts-node or compiled
import { listTasks, readState, createTask } from '../../orchestrator/state';
import { approveTask, rejectTask } from '../../orchestrator/orchestrator';
import { loadAgents, loadRoles } from '../../orchestrator/paths';
import * as git from '../../orchestrator/git';
import { listThreads, readThread, threadExists } from '../../orchestrator/chat/thread';
import { sendMessage } from '../../orchestrator/chat/supervisor';

const app = express();
const port = process.env.API_PORT || 3011;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// 1. GET /api/tasks - List all tasks
app.get('/api/tasks', (_req, res) => {
  try {
    const tasks = listTasks();
    // Sort descending by task_id which usually contains timestamp
    tasks.sort((a, b) => b.task_id.localeCompare(a.task_id));
    res.json(tasks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. GET /api/tasks/:id - Fetch full state of a task
app.get('/api/tasks/:id', (req, res) => {
  try {
    const state = readState(req.params.id);
    res.json(state);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'Task not found' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// 3. POST /api/tasks - Create a new task
app.post('/api/tasks', (req, res) => {
  try {
    const { prompt, roles, overrides, models } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }
    const state = createTask({
      summary: prompt,
      chain: roles || ['backend-dev', 'frontend-dev', 'tester-e2e'],
      agentOverrides: overrides || {},
      modelOverrides: models || {},
    });
    
    // Auto-start the task asynchronously
    startTaskAsync(state.task_id);
    
    res.status(201).json(state);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. POST /api/tasks/:id/approve - Approve a task
app.post('/api/tasks/:id/approve', (req, res) => {
  try {
    const approver = req.body.approver || 'human';
    const state = approveTask(req.params.id, approver);
    res.json(state);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. POST /api/tasks/:id/reject - Reject a task
app.post('/api/tasks/:id/reject', (req, res) => {
  try {
    const reason = req.body.reason || 'Rejected by human';
    const state = rejectTask(req.params.id, reason);
    
    // Auto-resume the task asynchronously
    startTaskAsync(req.params.id);
    
    res.json(state);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5.1 GET /api/tasks/:id/diff - Get changed files with diffs
app.get('/api/tasks/:id/diff', (req, res) => {
  try {
    const state = readState(req.params.id);
    const files = git.changedFiles(state.base_sha, state.branch);
    const stat = git.diffStat(state.base_sha, state.branch);
    const fileDiffs = files.map((f) => ({
      file: f.file,
      added: f.added,
      removed: f.removed,
      diff: git.fileDiff(state.base_sha, state.branch, f.file),
    }));
    res.json({ stat, files: fileDiffs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6. GET /api/agents - List registered agents and roles
app.get('/api/agents', (_req, res) => {
  try {
    const agents = loadAgents();
    const roles = loadRoles();
    res.json({ agents, roles });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Supervisor chat. This is the primary surface: the human talks here, and the
// supervisor decides whether a message is a question (answer it) or a work
// request (propose it, then create a task once they agree). Creating a task
// through POST /api/tasks still works, but it is the raw lever -- it is what
// turned "hi" into a git branch.
// ---------------------------------------------------------------------------

// 7. GET /api/chat - list conversations, newest first
app.get('/api/chat', (_req, res) => {
  try {
    res.json(
      listThreads().map((t) => ({
        thread_id: t.thread_id,
        title: t.title,
        updated_at: t.updated_at,
        message_count: t.messages.length,
      })),
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 8. GET /api/chat/:id - full transcript
app.get('/api/chat/:id', (req, res) => {
  try {
    if (!threadExists(req.params.id)) return res.status(404).json({ error: 'Thread not found' });
    res.json(readThread(req.params.id));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 9. POST /api/chat - send one message and get the reply.
 *
 * Synchronous, and it can take up to a couple of minutes: the supervisor may
 * read files and run orchestrator commands before answering. The client should
 * show a pending state rather than time out. It never blocks on an agent RUN --
 * the supervisor starts those detached.
 */
app.post('/api/chat', async (req, res) => {
  const { message, thread_id: threadId } = req.body ?? {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  if (threadId && !threadExists(threadId)) {
    return res.status(404).json({ error: 'Thread not found' });
  }
  try {
    const { thread, reply } = sendMessage(threadId ?? null, message);
    res.json({ thread_id: thread.thread_id, title: thread.title, reply });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 10. POST /api/tasks/:id/resume - restart a step a usage limit cut short
app.post('/api/tasks/:id/resume', (req, res) => {
  try {
    const state = readState(req.params.id);
    if (state.status !== 'BLOCKED_RETRY') {
      return res.status(409).json({ error: `task is ${state.status}, not BLOCKED_RETRY` });
    }
    startTaskAsync(req.params.id, true);
    res.json({ resuming: req.params.id, branch: state.branch });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Background task runner helper
const runningTasks = new Set<string>();

async function startTaskAsync(taskId: string, resume = false) {
  if (runningTasks.has(taskId)) return;
  runningTasks.add(taskId);

  const workerPath = path.join(__dirname, 'worker.ts');
  const args = ['ts-node', workerPath, taskId];
  if (resume) args.push('--resume');
  const child = spawn('npx', args, {
    cwd: __dirname,
    detached: true,
    stdio: 'inherit',
  });

  child.on('exit', () => {
    runningTasks.delete(taskId);
  });
  child.on('error', (err) => {
    console.error(`Worker for ${taskId} failed:`, err);
    runningTasks.delete(taskId);
  });
  child.unref();
}

app.listen(port, () => {
  console.log(`Control API listening on port ${port}`);
});
