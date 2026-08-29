/**
 * Nexa AI Development System — Phase 8 Task Lifecycle State Machine
 * Enforces valid, deterministic, and auditable task state transitions.
 */

const VALID_STATES = [
  'CREATED',
  'PLANNED',
  'WAITING_DEPENDENCY',
  'READY',
  'ASSIGNED',
  'CLAIMED',
  'PREFLIGHT',
  'RUNNING',
  'TESTING',
  'VERIFYING',
  'COMPLETED',
  'REVIEW_REQUIRED',
  'APPROVED',
  'MERGE_READY',
  'FAILED',
  'BLOCKED',
  'ESCALATED',
  'INTERRUPTED'
];

const ALLOWED_TRANSITIONS = {
  CREATED: ['PLANNED', 'FAILED', 'BLOCKED', 'ESCALATED'],
  PLANNED: ['WAITING_DEPENDENCY', 'READY', 'ASSIGNED', 'FAILED', 'BLOCKED', 'ESCALATED'],
  WAITING_DEPENDENCY: ['READY', 'FAILED', 'BLOCKED', 'ESCALATED'],
  READY: ['ASSIGNED', 'CLAIMED', 'WAITING_DEPENDENCY', 'FAILED', 'BLOCKED', 'ESCALATED'],
  ASSIGNED: ['CLAIMED', 'READY', 'PREFLIGHT', 'FAILED', 'BLOCKED', 'INTERRUPTED', 'ESCALATED'],
  CLAIMED: ['PREFLIGHT', 'ASSIGNED', 'RUNNING', 'FAILED', 'BLOCKED', 'INTERRUPTED', 'ESCALATED'],
  PREFLIGHT: ['RUNNING', 'CLAIMED', 'FAILED', 'BLOCKED', 'INTERRUPTED', 'ESCALATED'],
  RUNNING: ['TESTING', 'VERIFYING', 'FAILED', 'BLOCKED', 'INTERRUPTED', 'ESCALATED'],
  TESTING: ['VERIFYING', 'RUNNING', 'FAILED', 'BLOCKED', 'INTERRUPTED', 'ESCALATED'],
  VERIFYING: ['COMPLETED', 'REVIEW_REQUIRED', 'TESTING', 'FAILED', 'BLOCKED', 'INTERRUPTED', 'ESCALATED'],
  COMPLETED: ['REVIEW_REQUIRED', 'APPROVED', 'MERGE_READY'],
  REVIEW_REQUIRED: ['APPROVED', 'MERGE_READY', 'FAILED', 'ESCALATED', 'PLANNED'],
  APPROVED: ['MERGE_READY', 'REVIEW_REQUIRED', 'ESCALATED'],
  MERGE_READY: ['APPROVED', 'REVIEW_REQUIRED', 'ESCALATED'],
  FAILED: ['PLANNED', 'ESCALATED'],
  BLOCKED: ['PLANNED', 'READY', 'ESCALATED'],
  INTERRUPTED: ['READY', 'PLANNED', 'ESCALATED'],
  ESCALATED: ['PLANNED', 'READY']
};

class TaskLifecycle {
  static get STATES() {
    return VALID_STATES;
  }

  /**
   * Checks if a transition from currentState to newState is valid.
   * Self-transitions are treated as idempotent no-ops.
   */
  static isValidTransition(currentState, newState) {
    if (!VALID_STATES.includes(currentState) || !VALID_STATES.includes(newState)) {
      return false;
    }
    if (currentState === newState) {
      return true; // Idempotent
    }
    const allowed = ALLOWED_TRANSITIONS[currentState] || [];
    return allowed.includes(newState);
  }

  /**
   * Validates and applies a state transition to task data.
   * Throws an error or returns { ok: false } if transition is invalid.
   */
  static transition(taskData, newState, metadata = {}) {
    if (!taskData) {
      throw new Error('TaskData object is required for state transition');
    }

    const currentState = taskData.status || taskData.current_state || 'CREATED';

    if (!VALID_STATES.includes(newState)) {
      return {
        ok: false,
        code: 'INVALID_STATE',
        reason: `Target state '${newState}' is not a valid TaskLifecycle state.`
      };
    }

    if (!TaskLifecycle.isValidTransition(currentState, newState)) {
      return {
        ok: false,
        code: 'INVALID_STATE_TRANSITION',
        reason: `Illegal state transition from '${currentState}' to '${newState}'.`
      };
    }

    // Idempotent no-op
    if (currentState === newState) {
      return { ok: true, taskData, changed: false };
    }

    const transitionRecord = {
      timestamp: new Date().toISOString(),
      previous_state: currentState,
      new_state: newState,
      worker: metadata.worker || taskData.assigned_worker || taskData.worker_id || 'system',
      attempt: metadata.attempt || taskData.attempt || 1,
      reason: metadata.reason || `Transitioned from ${currentState} to ${newState}`
    };

    if (!Array.isArray(taskData.state_history)) {
      taskData.state_history = [];
    }

    taskData.state_history.push(transitionRecord);
    taskData.status = newState;
    taskData.current_state = newState;
    taskData.updated_at = transitionRecord.timestamp;

    return {
      ok: true,
      taskData,
      changed: true,
      transition: transitionRecord
    };
  }

  /**
   * Checks if state indicates task completion/readiness.
   */
  static isComplete(state) {
    return ['COMPLETED', 'REVIEW_REQUIRED', 'APPROVED', 'MERGE_READY'].includes(state);
  }

  /**
   * Checks if state indicates task failure or block.
   */
  static isFailedOrBlocked(state) {
    return ['FAILED', 'BLOCKED', 'ESCALATED', 'INTERRUPTED'].includes(state);
  }

  /**
   * Checks if state indicates active execution.
   */
  static isActive(state) {
    return ['ASSIGNED', 'CLAIMED', 'PREFLIGHT', 'RUNNING', 'TESTING', 'VERIFYING'].includes(state);
  }
}

module.exports = TaskLifecycle;
