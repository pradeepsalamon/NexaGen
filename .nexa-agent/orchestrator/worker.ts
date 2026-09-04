/**
 * Drives one task to a stopping point in its own process, so the control API
 * never blocks on an agent run. Stopping point means terminal (approved-pending,
 * failed, merged) OR halted -- a task cut short by a usage limit stops here and
 * waits for an explicit resume rather than hammering the limit.
 */
import { runTask } from './orchestrator';

const taskId = process.argv[2];
if (!taskId) {
  console.error('Missing taskId argument for worker');
  process.exit(1);
}
const resume = process.argv.includes('--resume');

try {
  const state = runTask(taskId, {
    resume,
    onStep: (step) =>
      console.log(
        `[${taskId}] ${step.index} ${step.role}/${step.agent} a${step.attempt}/s${step.session} -> ${step.outcome}`,
      ),
  });
  console.log(`[${taskId}] stopped at ${state.status}${state.failure_reason ? `: ${state.failure_reason}` : ''}`);
} catch (e) {
  console.error(`Error in worker advancing task ${taskId}:`, e);
  process.exit(1);
}
