/**
 * Nexa AI Development System — Base Provider Interface
 * Abstract adapter defining the contract for AI planning, review, and summarization.
 */

class BaseProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = config.name || 'BaseProvider';
  }

  /**
   * Analyzes user request against project architecture knowledge.
   * @param {string} userPrompt - Human request text
   * @param {object} projectContext - Knowledge docs & repo metadata
   * @returns {Promise<object>} - Planning analysis with classification & task plan
   */
  async analyzeRequest(userPrompt, projectContext) {
    throw new Error(`analyzeRequest() not implemented in ${this.constructor.name}`);
  }

  /**
   * Generates a fully compliant work order structure.
   * @param {object} plan - Output from analyzeRequest
   * @param {object} metadata - Task ID, author, timestamps
   * @returns {Promise<object>} - Schema-compliant work order
   */
  async generateWorkOrder(plan, metadata) {
    throw new Error(`generateWorkOrder() not implemented in ${this.constructor.name}`);
  }

  /**
   * Evaluates a completion report against the original work order.
   * @param {object} workOrder - Original work order
   * @param {object} completionReport - Worker completion report
   * @returns {Promise<object>} - Review verdict, passed criteria, follow-up if needed
   */
  async reviewCompletion(workOrder, completionReport) {
    throw new Error(`reviewCompletion() not implemented in ${this.constructor.name}`);
  }

  /**
   * Formats a human-readable summary.
   * @param {object} reviewResult - Verdict and verification notes
   * @returns {string} - Markdown formatted summary
   */
  summarizeForHuman(reviewResult) {
    throw new Error(`summarizeForHuman() not implemented in ${this.constructor.name}`);
  }
}

module.exports = BaseProvider;
