'use strict';

const creditService = require('../services/credit.service');

describe('credit.service validatePayoutPreconditions', () => {
  it('rejects when owner balance is strictly less than task credit', async () => {
    const ownerId = { equals: () => true };
    const taskId = '507f1f77bcf86cd799439011';

    const Task = require('../models/task.model');
    const User = require('../models/user.model');
    const Transaction = require('../models/transaction.model');

    jest.spyOn(Task, 'findById').mockResolvedValue({
      owner_user_id: ownerId,
      status: 'Completed',
      taker_user_id: { equals: () => false },
      credit: 20,
    });
    jest.spyOn(Transaction, 'findOne').mockReturnValue({ lean: () => Promise.resolve(null) });
    jest.spyOn(User, 'findById').mockResolvedValue({ credit_balance: 19 });

    const r = await creditService.validatePayoutPreconditions(taskId, ownerId);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('INSUFFICIENT_CREDITS');

    jest.restoreAllMocks();
  });

  it('accepts when owner balance equals task credit', async () => {
    const ownerId = { equals: () => true };
    const taskId = '507f1f77bcf86cd799439012';

    const Task = require('../models/task.model');
    const User = require('../models/user.model');
    const Transaction = require('../models/transaction.model');

    jest.spyOn(Task, 'findById').mockResolvedValue({
      owner_user_id: ownerId,
      status: 'Completed',
      taker_user_id: { equals: () => false },
      credit: 20,
    });
    jest.spyOn(Transaction, 'findOne').mockReturnValue({ lean: () => Promise.resolve(null) });
    jest.spyOn(User, 'findById').mockResolvedValue({ credit_balance: 20 });

    const r = await creditService.validatePayoutPreconditions(taskId, ownerId);
    expect(r.ok).toBe(true);
    expect(r.amt).toBe(20);

    jest.restoreAllMocks();
  });
});
