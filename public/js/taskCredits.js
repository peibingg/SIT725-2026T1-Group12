'use strict';

/** Mirror server constants/taskCredits.js */
const TASK_CREDIT_OPTIONS = [1, 3, 5, 8];

const taskCreditsApi = { TASK_CREDIT_OPTIONS };

if (typeof globalThis !== 'undefined') {
  globalThis.TaskMarketplaceTaskCredits = taskCreditsApi;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = taskCreditsApi;
}
