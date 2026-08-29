/**
 * Nexa AI Development System — Phase 9 Task Lifecycle State Machine
 * Enforces valid, deterministic, and auditable task state transitions,
 * including explicit Human Approval Gates (Plan -> Approve -> Execute -> Review -> Merge).
 */

const VALID_STATES = [
  'CREATED',
  'PLANNED',
  'AWAITING_APPROVAL',
  'APPROVED',
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
  'MERGE_READY',
  'HUMAN_APPROVED',
  'MERGED',
  'REJECTED',
  'FAILED',
  'BLOCKED',
  'ESCALATED',
  'INTERRUPTED'
];

const ALLOWED_TRANSITIONS = {
  CREATED: ['PLANNED', 'AWAITING_APPROVAL', 'FAILED', 'BLOCKED', 'ESCALATED', 'REJECTED'],
  PLANNED: ['AWAITING_APPROVAL', 'APPROVED', 'WAITING_DEPENDENCY', 'READY', 'ASSIGNED', 'FAILED', 'BLOCKED', 'REJECTED'],
  AWAITING_APPROVAL: ['APPROVED', 'REJECTED', 'PLANNED', 'FAILED', 'BLOCKED'],
  APPROVED: ['WAITING_DEPENDENCY', 'READY', 'ASSIGNED', 'AWAITING_APPROVAL', 'REJECTED', 'FAILED'],
  WAITING_DEPENDENCY: ['READY', 'FAILED', 'BLOCKED', 'ESCALATED', 'REJECTED'],
  READY: ['ASSIGNED', 'CLAIMED', 'WAITING_DEPENDENCY', 'FAILED', 'BLOCKED', 'ESCALATED', 'REJECTED'],
  ASSIGNED: ['CLAIMED', 'READY', 'PREFLIGHT', 'FAILED', 'BLOCKED', 'INTERRUPTED', 'ESCALATED'],
  CLAIMED: ['PREFLIGHT', 'ASSIGNED', 'RUNNING', 'FAILED', 'BLOCKED', 'INTERRUPTED', 'ESCALATED'],
  PREFLIGHT: ['RUNNING', 'CLAIMED', 'FAILED', 'BLOCKED', 'INTERRUPTED', 'ESCALATED'],
  RUNNING: ['TESTING', 'VERIFYING', 'FAILED', 'BLOCKED', 'INTERRUPTED', 'ESCALATED'],
  TESTING: ['VERIFYING', 'RUNNING', 'FAILED', 'BLOCKED', 'INTERRUPTED', 'ESCALATED'],
  VERIFYING: ['COMPLETED', 'REVIEW_REQUIRED', 'TESTING', 'FAILED', 'BLOCKED', 'INTERRUPTED', 'ESCALATED'],
  COMPLETED: ['REVIEW_REQUIRED', 'MERGE_READY', 'HUMAN_APPROVED'],
  REVIEW_REQUIRED: ['MERGE_READY', 'HUMAN_APPROVED', 'FAILED', 'ESCALATED', 'PLANNED', 'REJECTED'],
  MERGE_READY: ['HUMAN_APPROVED', 'REVIEW_REQUIRED', 'ESCALATED', 'REJECTED'],
  HUMAN_APPROVED: ['MERGED', 'MERGE_READY', 'REJECTED'],
  MERGED: [],
  REJECTED: ['PLANNED', 'AWAITING_APPROVAL', 'APPROVED'],
  FAILED: ['PLANNED', 'AWAITING_APPROVAL', 'ESCALATED'],
  BLOCKED: ['PLANNED', 'AWAITING_APPROVAL', 'READY', 'ESCALATED'],
  INTERRUPTED: ['READY', 'AWAITING_APPROVAL', 'PLANNED', 'ESCALATED'],
  ESCALATED: ['PLANNED', 'AWAITING_APPROVAL', 'READY']
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
      approver: metadata.approver || taskData.approved_by || null,
      reason: metadata.reason || `Transitioned from ${currentState} to ${newState}`
    };

    if (!Array.isArray(taskData.state_history)) {
      taskData.state_history = [];
    }

    taskData.state_history.push(transitionRecord);
    taskData.status = newState;
    taskData.current_state = newState;
    taskData.updated_at = transitionRecord.timestamp;

    if (metadata.approver) {
      taskData.approved_by = metadata.approver;
      taskData.approved_at = transitionRecord.timestamp;
    }

    return {
      ok: true,
      taskData,
      changed: true,
      transition: transitionRecord
    };
  }

  /**
   * Checks if task has received explicit execution approval.
   */
  static isApproved(taskData) {
    if (!taskData) return false;
    const s = taskData.status || taskData.current_state;
    return [
      'APPROVED',
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
      'MERGE_READY',
      'HUMAN_APPROVED',
      'MERGED'
    ].includes(s);
  }

  /**
   * Explicitly approves a task for execution.
   */
  static approveTask(taskData, metadata = {}) {
    return TaskLifecycle.transition(taskData, 'APPROVED', {
      approver: metadata.approver || 'HUMAN',
      worker: 'manager',
      reason: metadata.reason || 'Explicitly approved by human engineer for execution'
    });
  }

  /**
   * Explicitly rejects a task.
   */
  static rejectTask(taskData, metadata = {}) {
    return TaskLifecycle.transition(taskData, 'REJECTED', {
      approver: metadata.approver || 'HUMAN',
      worker: 'manager',
      reason: metadata.reason || 'Rejected by human engineer'
    });
  }

  /**
   * Checks if state indicates task completion/readiness.
   */
  static isComplete(state) {
    return ['COMPLETED', 'REVIEW_REQUIRED', 'MERGE_READY', 'HUMAN_APPROVED', 'MERGED'].includes(state);
  }

  /**
   * Checks if state indicates task failure or block.
   */
  static isFailedOrBlocked(state) {
    return ['FAILED', 'BLOCKED', 'ESCALATED', 'INTERRUPTED', 'REJECTED'].includes(state);
  }

  /**
   * Checks if state indicates active execution.
   */
  static isActive(state) {
    return ['ASSIGNED', 'CLAIMED', 'PREFLIGHT', 'RUNNING', 'TESTING', 'VERIFYING'].includes(state);
  }
}

module.exports = TaskLifecycle;
