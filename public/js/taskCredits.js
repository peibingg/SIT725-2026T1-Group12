'use strict';

/** Mirror server constants/taskCredits.js */
const TASK_CREDIT_OPTIONS = [1, 3, 5, 8];

const taskCreditsApi = { TASK_CREDIT_OPTIONS };

const creditsRoot =
  typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : {};
creditsRoot.TaskMarketplaceTaskCredits = taskCreditsApi;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = taskCreditsApi;
}
