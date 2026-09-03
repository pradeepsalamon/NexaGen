import { advanceOnce, isTerminal } from '../../orchestrator/orchestrator';
import { readState } from '../../orchestrator/state';

const taskId = process.argv[2];
if (!taskId) {
  console.error('Missing taskId argument for worker');
  process.exit(1);
}

try {
  let state = readState(taskId);
  while (!isTerminal(state)) {
    const result = advanceOnce(taskId);
    state = result.state;
    if (result.action.kind === 'terminal') {
      break;
    }
  }
} catch (e) {
  console.error(`Error in worker advancing task ${taskId}:`, e);
  process.exit(1);
}
