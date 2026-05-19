'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const bcrypt = require('bcryptjs');
const User = require('../models/user.model');
const Task = require('../models/task.model');
const Transaction = require('../models/transaction.model');
const Comment = require('../models/comment.model');

let app;
let mongoReplSet;

beforeAll(async () => {
  mongoReplSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, name: 'rsTaskStatus' },
  });
  await mongoReplSet.waitUntilRunning();
  process.env.MONGODB_URI = mongoReplSet.getUri();
  process.env.SESSION_SECRET = 'test-session-secret-for-jest-tasks';
  process.env.NODE_ENV = 'test';
  await mongoose.connect(process.env.MONGODB_URI);
  app = require('../app');
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoReplSet) await mongoReplSet.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Task.deleteMany({});
  await Transaction.deleteMany({});
  await Comment.deleteMany({});
});

async function signup(agent, email, name = 'T') {
  await agent
    .post('/api/auth/signup')
    .send({
      first_name: name,
      last_name: 'User',
      email,
      password: 'secret12',
    })
    .expect(201);
}

async function setCreditBalance(email, credit_balance) {
  await User.updateOne({ email }, { $set: { credit_balance } });
}

const validPayload = {
  title: 'Fix the login bug',
  description: 'Reproduce and patch the session timeout issue on sign-in.',
  credit: 3,
};

describe('GET /api/tasks/create-meta', () => {
  it('returns 401 without session', async () => {
    await request(app).get('/api/tasks/create-meta').expect(401);
  });

  it.each([
    [0, false, []],
    [3, true, [1, 3]],
    [4, true, [1, 3]],
    [10, true, [1, 3, 5, 8]],
  ])('balance %i → canCreate=%s allowedCredits=%j', async (balance, canCreate, allowed) => {
    const agent = request.agent(app);
    await signup(agent, `meta-${balance}@example.com`, 'Meta');
    await setCreditBalance(`meta-${balance}@example.com`, balance);

    const res = await agent.get('/api/tasks/create-meta').expect(200);
    expect(res.body.statusCode).toBe(200);
    expect(res.body.credit_balance).toBe(balance);
    expect(res.body.canCreate).toBe(canCreate);
    expect(res.body.allowedCredits).toEqual(allowed);
    expect(res.body.presetCredits).toEqual([1, 3, 5, 8]);
  });
});

describe('POST /api/tasks', () => {
  it('returns 401 without session', async () => {
    await request(app).post('/api/tasks').send(validPayload).expect(401);
  });

  it('happy path: creates Open task with session owner', async () => {
    const agent = request.agent(app);
    await signup(agent, 'creator@example.com', 'Creator');
    await setCreditBalance('creator@example.com', 10);
    const me = await agent.get('/api/auth/me').expect(200);

    const res = await agent.post('/api/tasks').send(validPayload).expect(201);
    expect(res.body.statusCode).toBe(201);
    expect(res.body.task).toMatchObject({
      title: validPayload.title,
      description: validPayload.description,
      credit: 3,
      status: 'Open',
    });
    expect(res.body.task.taker).toBeNull();
    expect(res.body.task.owner.id).toBe(me.body.user.id);

    const stored = await Task.findById(res.body.task.id).lean();
    expect(stored.owner_user_id.toString()).toBe(me.body.user.id);
    expect(stored.taker_user_id).toBeNull();
    expect(stored.status).toBe('Open');
  });

  it('ignores owner_user_id in body and uses session user', async () => {
    const agent = request.agent(app);
    const otherAgent = request.agent(app);
    await signup(agent, 'real-owner@example.com', 'Real');
    await signup(otherAgent, 'fake-owner@example.com', 'Fake');
    await setCreditBalance('real-owner@example.com', 8);
    const otherMe = await otherAgent.get('/api/auth/me').expect(200);
    const me = await agent.get('/api/auth/me').expect(200);

    const res = await agent
      .post('/api/tasks')
      .send({
        ...validPayload,
        owner_user_id: otherMe.body.user.id,
      })
      .expect(201);

    expect(res.body.task.owner.id).toBe(me.body.user.id);
    expect(res.body.task.owner.id).not.toBe(otherMe.body.user.id);
  });

  it('returns 403 when credit_balance is 0', async () => {
    const agent = request.agent(app);
    await signup(agent, 'zero-balance@example.com', 'Zero');
    const res = await agent.post('/api/tasks').send(validPayload).expect(403);
    expect(res.body.message).toMatch(/positive credit balance/i);
  });

  it('returns 403 when credit_balance is negative edge (stored as 0)', async () => {
    const agent = request.agent(app);
    await signup(agent, 'neg@example.com', 'Neg');
    await setCreditBalance('neg@example.com', 0);
    await agent.post('/api/tasks').send(validPayload).expect(403);
  });

  it.each([
    ['title', { description: 'd', credit: 1 }],
    ['description', { title: 'Valid title', credit: 1 }],
    ['credit', { title: 'Valid title', description: 'Body text' }],
  ])('returns 400 when %s is missing', async (field, body) => {
    const agent = request.agent(app);
    await signup(agent, `missing-${field}@example.com`, 'M');
    await setCreditBalance(`missing-${field}@example.com`, 10);
    const res = await agent.post('/api/tasks').send(body).expect(400);
    expect(res.body.statusCode).toBe(400);
  });

  it('does not insert a task when validation fails', async () => {
    const agent = request.agent(app);
    await signup(agent, 'no-persist@example.com', 'NP');
    await setCreditBalance('no-persist@example.com', 10);
    const before = await Task.countDocuments();

    await agent
      .post('/api/tasks')
      .send({ ...validPayload, title: 'ab', credit: 99 })
      .expect(400);

    const after = await Task.countDocuments();
    expect(after).toBe(before);
  });

  it('returns 400 when title is not a string', async () => {
    const agent = request.agent(app);
    await signup(agent, 'title-num@example.com', 'TN');
    await setCreditBalance('title-num@example.com', 10);
    const res = await agent
      .post('/api/tasks')
      .send({ ...validPayload, title: 12345 })
      .expect(400);
    expect(res.body.message).toMatch(/string/i);
  });

  it('returns 400 for title shorter than 3 characters after trim', async () => {
    const agent = request.agent(app);
    await signup(agent, 'short-title@example.com', 'S');
    await setCreditBalance('short-title@example.com', 10);
    await agent
      .post('/api/tasks')
      .send({ ...validPayload, title: '  ab  ' })
      .expect(400);
  });

  it('returns 400 for title longer than 200 characters', async () => {
    const agent = request.agent(app);
    await signup(agent, 'long-title@example.com', 'L');
    await setCreditBalance('long-title@example.com', 10);
    await agent
      .post('/api/tasks')
      .send({ ...validPayload, title: 'a'.repeat(201) })
      .expect(400);
  });

  it('returns 400 for empty description after trim', async () => {
    const agent = request.agent(app);
    await signup(agent, 'empty-desc@example.com', 'E');
    await setCreditBalance('empty-desc@example.com', 10);
    await agent
      .post('/api/tasks')
      .send({ ...validPayload, description: '   ' })
      .expect(400);
  });

  it('returns 400 for description over 20000 characters', async () => {
    const agent = request.agent(app);
    await signup(agent, 'long-desc@example.com', 'LD');
    await setCreditBalance('long-desc@example.com', 10);
    await agent
      .post('/api/tasks')
      .send({ ...validPayload, description: 'x'.repeat(20001) })
      .expect(400);
  });

  it.each([0, 2, 9])('returns 400 for non-whitelist credit %s', async (credit) => {
    const agent = request.agent(app);
    await signup(agent, `bad-credit-${credit}@example.com`, 'B');
    await setCreditBalance(`bad-credit-${credit}@example.com`, 20);
    const res = await agent
      .post('/api/tasks')
      .send({ ...validPayload, credit })
      .expect(400);
    expect(res.body.message).toMatch(/one of/i);
  });

  it('returns 400 for non-integer credit', async () => {
    const agent = request.agent(app);
    await signup(agent, 'frac-credit@example.com', 'F');
    await setCreditBalance('frac-credit@example.com', 20);
    const res = await agent
      .post('/api/tasks')
      .send({ ...validPayload, credit: 0.5 })
      .expect(400);
    expect(res.body.message).toMatch(/whole number/i);
  });

  it.each([
    [1, 1, 201],
    [3, 3, 201],
    [4, 1, 201],
    [4, 3, 201],
    [3, 5, 400],
    [4, 5, 400],
    [4, 8, 400],
    [0, 1, 403],
    [8, 8, 201],
    [9, 8, 201],
    [9, 1, 201],
  ])('balance %i credit %i → %i', async (balance, credit, expectedStatus) => {
    const agent = request.agent(app);
    const email = `bal-${balance}-cred-${credit}@example.com`;
    await signup(agent, email, 'Bal');
    await setCreditBalance(email, balance);
    const res = await agent
      .post('/api/tasks')
      .send({ ...validPayload, credit })
      .expect(expectedStatus);
    expect(res.body.statusCode).toBe(expectedStatus);
    if (expectedStatus === 400) {
      expect(res.body.message).toMatch(/balance|one of/i);
    }
  });
});

describe('GET /api/tasks', () => {
  it('returns 401 without session', async () => {
    await request(app).get('/api/tasks').expect(401);
  });

  it('returns serialized tasks for default scope', async () => {
    const agent = request.agent(app);
    await signup(agent, 'lister@example.com', 'Lister');
    const me = await agent.get('/api/auth/me').expect(200);
    const myId = new mongoose.Types.ObjectId(me.body.user.id);

    const other = await User.create({
      first_name: 'Other',
      last_name: 'User',
      email: 'lister-other@example.com',
      password_hash: await bcrypt.hash('x', 8),
    });

    await Task.insertMany([
      {
        title: 'Mine open',
        description: 'd',
        owner_user_id: myId,
        taker_user_id: null,
        credit: 3,
        status: 'Open',
      },
      {
        title: 'Open for me',
        description: 'd',
        owner_user_id: other._id,
        taker_user_id: null,
        credit: 5,
        status: 'Open',
      },
    ]);

    const res = await agent.get('/api/tasks').expect(200);
    expect(res.body.statusCode).toBe(200);
    const titles = res.body.tasks.map((t) => t.title).sort();
    expect(titles).toEqual(['Mine open', 'Open for me'].sort());
    expect(res.body.tasks[0]).toHaveProperty('id');
    expect(res.body.tasks[0]).toHaveProperty('status');
    expect(res.body.tasks[0]).toHaveProperty('credit');
  });

  it('scope=owner returns only owned tasks', async () => {
    const agent = request.agent(app);
    await signup(agent, 'owner-scope@example.com', 'OS');
    const me = await agent.get('/api/auth/me').expect(200);
    const myId = new mongoose.Types.ObjectId(me.body.user.id);

    const other = await User.create({
      first_name: 'X',
      last_name: 'Y',
      email: 'owner-scope-other@example.com',
      password_hash: await bcrypt.hash('x', 8),
    });

    await Task.insertMany([
      {
        title: 'Owned',
        description: 'd',
        owner_user_id: myId,
        credit: 1,
        status: 'Open',
      },
      {
        title: 'Not mine',
        description: 'd',
        owner_user_id: other._id,
        credit: 1,
        status: 'Open',
      },
    ]);

    const res = await agent.get('/api/tasks?scope=owner').expect(200);
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0].title).toBe('Owned');
  });
});

describe('GET /api/tasks/browse', () => {
  it('returns 401 without session', async () => {
    await request(app).get('/api/tasks/browse').expect(401);
  });

  it('partitions openForMe vs myAsTaker with populated names and no password_hash', async () => {
    const agent = request.agent(app);
    await signup(agent, 'browser@example.com', 'Browser');

    const me = await agent.get('/api/auth/me').expect(200);
    const myId = me.body.user.id;

    const other = await User.create({
      first_name: 'Other',
      last_name: 'Owner',
      email: 'other@example.com',
      password_hash: await bcrypt.hash('x', 8),
    });

    await Task.insertMany([
      {
        title: 'Open for me',
        description: 'd',
        owner_user_id: other._id,
        taker_user_id: null,
        credit: 10,
        status: 'Open',
      },
      {
        title: 'My open task',
        description: 'self',
        owner_user_id: new mongoose.Types.ObjectId(myId),
        taker_user_id: null,
        credit: 5,
        status: 'Open',
      },
      {
        title: 'I am taker in progress',
        description: 'wip',
        owner_user_id: other._id,
        taker_user_id: new mongoose.Types.ObjectId(myId),
        credit: 20,
        status: 'In Progress',
      },
      {
        title: 'Done as taker',
        description: 'done',
        owner_user_id: other._id,
        taker_user_id: new mongoose.Types.ObjectId(myId),
        credit: 15,
        status: 'Completed',
      },
      {
        title: 'Finalised read-only',
        description: 'fin',
        owner_user_id: other._id,
        taker_user_id: new mongoose.Types.ObjectId(myId),
        credit: 8,
        status: 'Finalised',
      },
      {
        title: 'I own with taker',
        description: 'owner view',
        owner_user_id: new mongoose.Types.ObjectId(myId),
        taker_user_id: other._id,
        credit: 3,
        status: 'In Progress',
      },
    ]);

    const res = await agent.get('/api/tasks/browse').expect(200);
    expect(res.body.statusCode).toBe(200);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.myPostedOpenCount).toBe(1);
    expect(res.body.openForMe).toHaveLength(1);
    expect(res.body.openForMe[0].title).toBe('Open for me');
    expect(res.body.openForMe[0].owner).toMatchObject({
      first_name: 'Other',
      last_name: 'Owner',
      email: 'other@example.com',
    });
    expect(res.body.openForMe[0].taker).toBeNull();
    expect(res.body.openForMe[0]).not.toHaveProperty('password_hash');
    expect(res.body.openForMe[0].owner).not.toHaveProperty('password_hash');

    const mine = res.body.myAsTaker.map((t) => t.title).sort();
    expect(mine).toEqual(['Done as taker', 'Finalised read-only', 'I am taker in progress'].sort());

    expect(res.body.myAsOwner).toHaveLength(1);
    expect(res.body.myAsOwner[0].title).toBe('I own with taker');
    expect(res.body.myAsOwner[0].taker).toMatchObject({
      first_name: 'Other',
      last_name: 'Owner',
      email: 'other@example.com',
    });
  });
});

describe('POST /api/tasks/:id/take', () => {
  it('returns 401 without session', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    await request(app).post(`/api/tasks/${fakeId}/take`).send({}).expect(401);
  });

  it('returns 400 for invalid id', async () => {
    const agent = request.agent(app);
    await signup(agent, 'takebad@example.com');
    await agent.post('/api/tasks/not-an-id/take').send({}).expect(400);
  });

  it('happy path: non-owner claims Open task → In Progress', async () => {
    const ownerAgent = request.agent(app);
    const takerAgent = request.agent(app);
    await signup(ownerAgent, 'owner1@example.com', 'Owner');
    await signup(takerAgent, 'taker1@example.com', 'Taker');

    const ownerMe = await ownerAgent.get('/api/auth/me').expect(200);
    const task = await Task.create({
      title: 'Claim me',
      description: '',
      owner_user_id: new mongoose.Types.ObjectId(ownerMe.body.user.id),
      taker_user_id: null,
      credit: 12,
      status: 'Open',
    });

    const res = await takerAgent.post(`/api/tasks/${task._id}/take`).send({}).expect(200);
    expect(res.body.task.status).toBe('In Progress');
    expect(res.body.task.taker.id).toBe((await takerAgent.get('/api/auth/me')).body.user.id);

    const fresh = await Task.findById(task._id).lean();
    expect(fresh.status).toBe('In Progress');
    expect(fresh.taker_user_id.toString()).toBe(res.body.task.taker.id);
  });

  it('owner self-claim returns 403', async () => {
    const agent = request.agent(app);
    await signup(agent, 'selfclaim@example.com', 'Self');
    const me = await agent.get('/api/auth/me').expect(200);
    const task = await Task.create({
      title: 'Own task',
      description: '',
      owner_user_id: new mongoose.Types.ObjectId(me.body.user.id),
      taker_user_id: null,
      credit: 3,
      status: 'Open',
    });

    const res = await agent.post(`/api/tasks/${task._id}/take`).send({}).expect(403);
    expect(res.body.statusCode).toBe(403);
  });

  it('second taker after claim gets 409', async () => {
    const ownerAgent = request.agent(app);
    const a1 = request.agent(app);
    const a2 = request.agent(app);
    await signup(ownerAgent, 'o2@example.com', 'O');
    await signup(a1, 'a1@example.com', 'A');
    await signup(a2, 'a2@example.com', 'B');

    const ownerMe = await ownerAgent.get('/api/auth/me').expect(200);
    const task = await Task.create({
      title: 'One winner',
      description: '',
      owner_user_id: new mongoose.Types.ObjectId(ownerMe.body.user.id),
      taker_user_id: null,
      credit: 9,
      status: 'Open',
    });

    await a1.post(`/api/tasks/${task._id}/take`).send({}).expect(200);
    const res = await a2.post(`/api/tasks/${task._id}/take`).send({}).expect(409);
    expect(res.body.statusCode).toBe(409);
  });

  it('concurrent Take: exactly one succeeds with In Progress', async () => {
    const ownerAgent = request.agent(app);
    const a1 = request.agent(app);
    const a2 = request.agent(app);
    await signup(ownerAgent, 'race-o@example.com', 'RO');
    await signup(a1, 'race-1@example.com', 'R1');
    await signup(a2, 'race-2@example.com', 'R2');

    const ownerMe = await ownerAgent.get('/api/auth/me').expect(200);
    const task = await Task.create({
      title: 'Race',
      description: '',
      owner_user_id: new mongoose.Types.ObjectId(ownerMe.body.user.id),
      taker_user_id: null,
      credit: 11,
      status: 'Open',
    });

    const [r1, r2] = await Promise.all([
      a1.post(`/api/tasks/${task._id}/take`).send({}),
      a2.post(`/api/tasks/${task._id}/take`).send({}),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);

    const fresh = await Task.findById(task._id).lean();
    expect(fresh.status).toBe('In Progress');
    expect(fresh.taker_user_id).toBeDefined();
  });

  it('Take on Completed task returns 409', async () => {
    const ownerAgent = request.agent(app);
    const takerAgent = request.agent(app);
    await signup(ownerAgent, 'oc@example.com', 'OC');
    await signup(takerAgent, 'tc@example.com', 'TC');
    const ownerMe = await ownerAgent.get('/api/auth/me').expect(200);
    const task = await Task.create({
      title: 'Done',
      description: '',
      owner_user_id: new mongoose.Types.ObjectId(ownerMe.body.user.id),
      taker_user_id: null,
      credit: 4,
      status: 'Completed',
    });

    await takerAgent.post(`/api/tasks/${task._id}/take`).send({}).expect(409);
  });

  it('Take on In Progress task returns 409 (no second claim)', async () => {
    const ownerAgent = request.agent(app);
    const takerAgent = request.agent(app);
    const other = request.agent(app);
    await signup(ownerAgent, 'ip-o@example.com', 'IPO');
    await signup(takerAgent, 'ip-t@example.com', 'IPT');
    await signup(other, 'ip-x@example.com', 'IPX');
    const ownerMe = await ownerAgent.get('/api/auth/me').expect(200);
    const takerMe = await takerAgent.get('/api/auth/me').expect(200);
    const task = await Task.create({
      title: 'Taken',
      description: '',
      owner_user_id: new mongoose.Types.ObjectId(ownerMe.body.user.id),
      taker_user_id: new mongoose.Types.ObjectId(takerMe.body.user.id),
      credit: 5,
      status: 'In Progress',
    });

    await other.post(`/api/tasks/${task._id}/take`).send({}).expect(409);
  });
});

describe('POST /api/tasks/:id/complete', () => {
  it('returns 401 without session', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    await request(app).post(`/api/tasks/${fakeId}/complete`).send({}).expect(401);
  });

  it('happy path: In Progress as taker → Completed', async () => {
    const ownerAgent = request.agent(app);
    const takerAgent = request.agent(app);
    await signup(ownerAgent, 'co@example.com', 'CO');
    await signup(takerAgent, 'ct@example.com', 'CT');
    const ownerMe = await ownerAgent.get('/api/auth/me').expect(200);
    const takerMe = await takerAgent.get('/api/auth/me').expect(200);

    const task = await Task.create({
      title: 'Finish me',
      description: '',
      owner_user_id: new mongoose.Types.ObjectId(ownerMe.body.user.id),
      taker_user_id: new mongoose.Types.ObjectId(takerMe.body.user.id),
      credit: 7,
      status: 'In Progress',
    });

    const res = await takerAgent.post(`/api/tasks/${task._id}/complete`).send({}).expect(200);
    expect(res.body.task.status).toBe('Completed');
    const fresh = await Task.findById(task._id).lean();
    expect(fresh.status).toBe('Completed');
  });

  it('non-taker gets 403', async () => {
    const ownerAgent = request.agent(app);
    const takerAgent = request.agent(app);
    const otherAgent = request.agent(app);
    await signup(ownerAgent, 'c2o@example.com', 'C2O');
    await signup(takerAgent, 'c2t@example.com', 'C2T');
    await signup(otherAgent, 'c2x@example.com', 'C2X');
    const ownerMe = await ownerAgent.get('/api/auth/me').expect(200);
    const takerMe = await takerAgent.get('/api/auth/me').expect(200);

    const task = await Task.create({
      title: 'Not yours',
      description: '',
      owner_user_id: new mongoose.Types.ObjectId(ownerMe.body.user.id),
      taker_user_id: new mongoose.Types.ObjectId(takerMe.body.user.id),
      credit: 6,
      status: 'In Progress',
    });

    await otherAgent.post(`/api/tasks/${task._id}/complete`).send({}).expect(403);
  });

  it('Complete on Open task fails: caller is not the taker (403)', async () => {
    const ownerAgent = request.agent(app);
    const takerAgent = request.agent(app);
    await signup(ownerAgent, 'c3o@example.com', 'C3O');
    await signup(takerAgent, 'c3t@example.com', 'C3T');
    const ownerMe = await ownerAgent.get('/api/auth/me').expect(200);

    const task = await Task.create({
      title: 'Still open',
      description: '',
      owner_user_id: new mongoose.Types.ObjectId(ownerMe.body.user.id),
      taker_user_id: null,
      credit: 2,
      status: 'Open',
    });

    await takerAgent.post(`/api/tasks/${task._id}/complete`).send({}).expect(403);
  });

  it('Complete when task is Open but caller is stored taker returns 409 (wrong state)', async () => {
    const ownerAgent = request.agent(app);
    const takerAgent = request.agent(app);
    await signup(ownerAgent, 'c3b-o@example.com', 'C3BO');
    await signup(takerAgent, 'c3b-t@example.com', 'C3BT');
    const ownerMe = await ownerAgent.get('/api/auth/me').expect(200);
    const takerMe = await takerAgent.get('/api/auth/me').expect(200);

    const task = await Task.create({
      title: 'Inconsistent open+taker',
      description: '',
      owner_user_id: new mongoose.Types.ObjectId(ownerMe.body.user.id),
      taker_user_id: new mongoose.Types.ObjectId(takerMe.body.user.id),
      credit: 2,
      status: 'Open',
    });

    await takerAgent.post(`/api/tasks/${task._id}/complete`).send({}).expect(409);
  });

  it('owner cannot complete instead of taker on In Progress', async () => {
    const ownerAgent = request.agent(app);
    const takerAgent = request.agent(app);
    await signup(ownerAgent, 'c4o@example.com', 'C4O');
    await signup(takerAgent, 'c4t@example.com', 'C4T');
    const ownerMe = await ownerAgent.get('/api/auth/me').expect(200);
    const takerMe = await takerAgent.get('/api/auth/me').expect(200);

    const task = await Task.create({
      title: 'Owner tries',
      description: '',
      owner_user_id: new mongoose.Types.ObjectId(ownerMe.body.user.id),
      taker_user_id: new mongoose.Types.ObjectId(takerMe.body.user.id),
      credit: 5,
      status: 'In Progress',
    });

    await ownerAgent.post(`/api/tasks/${task._id}/complete`).send({}).expect(403);
  });
});

describe('POST /api/tasks/:id/approve', () => {
  it('returns 401 without session', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    await request(app).post(`/api/tasks/${fakeId}/approve`).send({}).expect(401);
  });

  it('owner approves Completed: Finalised, payout txn, exact credit transfer', async () => {
    const ownerAgent = request.agent(app);
    const takerAgent = request.agent(app);
    await signup(ownerAgent, 'ap-o@example.com', 'APO');
    await signup(takerAgent, 'ap-t@example.com', 'APT');
    const ownerMe = await ownerAgent.get('/api/auth/me').expect(200);
    const takerMe = await takerAgent.get('/api/auth/me').expect(200);
    await User.updateOne({ email: 'ap-o@example.com' }, { $set: { credit_balance: 100 } });
    await User.updateOne({ email: 'ap-t@example.com' }, { $set: { credit_balance: 5 } });

    const task = await Task.create({
      title: 'Pay me',
      description: '',
      owner_user_id: new mongoose.Types.ObjectId(ownerMe.body.user.id),
      taker_user_id: new mongoose.Types.ObjectId(takerMe.body.user.id),
      credit: 30,
      status: 'Completed',
    });

    const res = await ownerAgent.post(`/api/tasks/${task._id}/approve`).send({}).expect(200);
    expect(res.body.task.status).toBe('Finalised');

    const ownerBal = (await User.findOne({ email: 'ap-o@example.com' }).lean()).credit_balance;
    const takerBal = (await User.findOne({ email: 'ap-t@example.com' }).lean()).credit_balance;
    expect(ownerBal).toBe(70);
    expect(takerBal).toBe(35);

    const payout = await Transaction.findOne({ task_id: task._id, purpose: 'Payout', status: 'Active' }).lean();
    expect(payout).toBeTruthy();
    expect(payout.credit).toBe(30);
  });

  it('second approve returns 409 and balances unchanged', async () => {
    const ownerAgent = request.agent(app);
    const takerAgent = request.agent(app);
    await signup(ownerAgent, 'ap2-o@example.com', 'AP2O');
    await signup(takerAgent, 'ap2-t@example.com', 'AP2T');
    const ownerMe = await ownerAgent.get('/api/auth/me').expect(200);
    const takerMe = await takerAgent.get('/api/auth/me').expect(200);
    await User.updateOne({ email: 'ap2-o@example.com' }, { $set: { credit_balance: 50 } });
    await User.updateOne({ email: 'ap2-t@example.com' }, { $set: { credit_balance: 10 } });

    const task = await Task.create({
      title: 'Once',
      description: '',
      owner_user_id: new mongoose.Types.ObjectId(ownerMe.body.user.id),
      taker_user_id: new mongoose.Types.ObjectId(takerMe.body.user.id),
      credit: 15,
      status: 'Completed',
    });

    await ownerAgent.post(`/api/tasks/${task._id}/approve`).send({}).expect(200);
    const ownerAfterFirst = (await User.findOne({ email: 'ap2-o@example.com' }).lean()).credit_balance;
    const takerAfterFirst = (await User.findOne({ email: 'ap2-t@example.com' }).lean()).credit_balance;

    const res = await ownerAgent.post(`/api/tasks/${task._id}/approve`).send({}).expect(409);
    expect(res.body.statusCode).toBe(409);

    const ownerAfterSecond = (await User.findOne({ email: 'ap2-o@example.com' }).lean()).credit_balance;
    const takerAfterSecond = (await User.findOne({ email: 'ap2-t@example.com' }).lean()).credit_balance;
    expect(ownerAfterSecond).toBe(ownerAfterFirst);
    expect(takerAfterSecond).toBe(takerAfterFirst);
  });

  it('taker cannot approve (403)', async () => {
    const ownerAgent = request.agent(app);
    const takerAgent = request.agent(app);
    await signup(ownerAgent, 'ap3-o@example.com', 'AP3O');
    await signup(takerAgent, 'ap3-t@example.com', 'AP3T');
    const ownerMe = await ownerAgent.get('/api/auth/me').expect(200);
    const takerMe = await takerAgent.get('/api/auth/me').expect(200);
    await User.updateOne({ email: 'ap3-o@example.com' }, { $set: { credit_balance: 40 } });

    const task = await Task.create({
      title: 'Owner only',
      description: '',
      owner_user_id: new mongoose.Types.ObjectId(ownerMe.body.user.id),
      taker_user_id: new mongoose.Types.ObjectId(takerMe.body.user.id),
      credit: 10,
      status: 'Completed',
    });

    await takerAgent.post(`/api/tasks/${task._id}/approve`).send({}).expect(403);
  });

  it('owner with insufficient credits gets 400', async () => {
    const ownerAgent = request.agent(app);
    const takerAgent = request.agent(app);
    await signup(ownerAgent, 'ap4-o@example.com', 'AP4O');
    await signup(takerAgent, 'ap4-t@example.com', 'AP4T');
    const ownerMe = await ownerAgent.get('/api/auth/me').expect(200);
    const takerMe = await takerAgent.get('/api/auth/me').expect(200);
    await User.updateOne({ email: 'ap4-o@example.com' }, { $set: { credit_balance: 5 } });

    const task = await Task.create({
      title: 'Too big',
      description: '',
      owner_user_id: new mongoose.Types.ObjectId(ownerMe.body.user.id),
      taker_user_id: new mongoose.Types.ObjectId(takerMe.body.user.id),
      credit: 20,
      status: 'Completed',
    });

    const res = await ownerAgent.post(`/api/tasks/${task._id}/approve`).send({}).expect(400);
    expect(res.body.statusCode).toBe(400);

    const fresh = await Task.findById(task._id).lean();
    expect(fresh.status).toBe('Completed');
    const nPayout = await Transaction.countDocuments({ task_id: task._id, purpose: 'Payout' });
    expect(nPayout).toBe(0);
  });

  it('concurrent approve: one success and one conflict or already paid', async () => {
    const ownerAgent = request.agent(app);
    const takerAgent = request.agent(app);
    await signup(ownerAgent, 'ap5-o@example.com', 'AP5O');
    await signup(takerAgent, 'ap5-t@example.com', 'AP5T');
    const ownerMe = await ownerAgent.get('/api/auth/me').expect(200);
    const takerMe = await takerAgent.get('/api/auth/me').expect(200);
    await User.updateOne({ email: 'ap5-o@example.com' }, { $set: { credit_balance: 200 } });

    const task = await Task.create({
      title: 'Race approve',
      description: '',
      owner_user_id: new mongoose.Types.ObjectId(ownerMe.body.user.id),
      taker_user_id: new mongoose.Types.ObjectId(takerMe.body.user.id),
      credit: 12,
      status: 'Completed',
    });

    const [r1, r2] = await Promise.all([
      ownerAgent.post(`/api/tasks/${task._id}/approve`).send({}),
      ownerAgent.post(`/api/tasks/${task._id}/approve`).send({}),
    ]);

    const codes = [r1.status, r2.status].sort();
    expect(codes).toEqual([200, 409]);
    const payoutCount = await Transaction.countDocuments({ task_id: task._id, purpose: 'Payout', status: 'Active' });
    expect(payoutCount).toBe(1);
  });
});

describe('Task comments (logical task_comments → comments collection)', () => {
  it('returns 401 without session for GET and POST', async () => {
    const id = new mongoose.Types.ObjectId();
    await request(app).get(`/api/tasks/${id}/comments`).expect(401);
    await request(app).post(`/api/tasks/${id}/comments`).send({ comment: 'x' }).expect(401);
  });

  it('returns 400 for invalid task id', async () => {
    const agent = request.agent(app);
    await signup(agent, 'cmt-bad@example.com', 'C');
    await agent.get('/api/tasks/not-an-id/comments').expect(400);
    await agent.post('/api/tasks/not-an-id/comments').send({ comment: 'x' }).expect(400);
  });

  it('taker posts on In Progress → 201; owner GET lists comment sorted ascending', async () => {
    const ownerAgent = request.agent(app);
    const takerAgent = request.agent(app);
    await signup(ownerAgent, 'cmt-o@example.com', 'CO');
    await signup(takerAgent, 'cmt-t@example.com', 'CT');
    const ownerMe = await ownerAgent.get('/api/auth/me').expect(200);
    const takerMe = await takerAgent.get('/api/auth/me').expect(200);

    const task = await Task.create({
      title: 'With comments',
      description: '',
      owner_user_id: new mongoose.Types.ObjectId(ownerMe.body.user.id),
      taker_user_id: new mongoose.Types.ObjectId(takerMe.body.user.id),
      credit: 5,
      status: 'In Progress',
    });

    const post1 = await takerAgent
      .post(`/api/tasks/${task._id}/comments`)
      .send({ comment: '  First update  ' })
      .expect(201);
    expect(post1.body.comment.comment).toBe('First update');
    expect(post1.body.comment.user_id).toBe(takerMe.body.user.id);
    expect(post1.body.comment).toHaveProperty('created');
    expect(post1.body.comment.user).toMatchObject({
      first_name: 'CT',
      email: 'cmt-t@example.com',
    });
    expect(post1.body.comment.user).not.toHaveProperty('password_hash');

    await takerAgent.post(`/api/tasks/${task._id}/comments`).send({ comment: 'Second line' }).expect(201);

    const list = await ownerAgent.get(`/api/tasks/${task._id}/comments`).expect(200);
    expect(list.body.comments).toHaveLength(2);
    expect(list.body.comments[0].comment).toBe('First update');
    expect(list.body.comments[1].comment).toBe('Second line');
    const t0 = new Date(list.body.comments[0].created).getTime();
    const t1 = new Date(list.body.comments[1].created).getTime();
    expect(t1).toBeGreaterThanOrEqual(t0);
  });

  it('stranger GET and POST return 403', async () => {
    const ownerAgent = request.agent(app);
    const takerAgent = request.agent(app);
    const stranger = request.agent(app);
    await signup(ownerAgent, 'cmt2-o@example.com', 'C2O');
    await signup(takerAgent, 'cmt2-t@example.com', 'C2T');
    await signup(stranger, 'cmt2-x@example.com', 'C2X');
    const ownerMe = await ownerAgent.get('/api/auth/me').expect(200);
    const takerMe = await takerAgent.get('/api/auth/me').expect(200);

    const task = await Task.create({
      title: 'Private',
      description: '',
      owner_user_id: new mongoose.Types.ObjectId(ownerMe.body.user.id),
      taker_user_id: new mongoose.Types.ObjectId(takerMe.body.user.id),
      credit: 3,
      status: 'In Progress',
    });

    await stranger.get(`/api/tasks/${task._id}/comments`).expect(403);
    await stranger.post(`/api/tasks/${task._id}/comments`).send({ comment: 'hack' }).expect(403);
  });

  it('owner cannot POST comment (403)', async () => {
    const ownerAgent = request.agent(app);
    const takerAgent = request.agent(app);
    await signup(ownerAgent, 'cmt3-o@example.com', 'C3O');
    await signup(takerAgent, 'cmt3-t@example.com', 'C3T');
    const ownerMe = await ownerAgent.get('/api/auth/me').expect(200);
    const takerMe = await takerAgent.get('/api/auth/me').expect(200);

    const task = await Task.create({
      title: 'Owner no post',
      description: '',
      owner_user_id: new mongoose.Types.ObjectId(ownerMe.body.user.id),
      taker_user_id: new mongoose.Types.ObjectId(takerMe.body.user.id),
      credit: 2,
      status: 'In Progress',
    });

    await ownerAgent.post(`/api/tasks/${task._id}/comments`).send({ comment: 'from owner' }).expect(403);
  });

  it('POST on Open task returns 403', async () => {
    const ownerAgent = request.agent(app);
    const takerAgent = request.agent(app);
    await signup(ownerAgent, 'cmt4-o@example.com', 'C4O');
    await signup(takerAgent, 'cmt4-t@example.com', 'C4T');
    const ownerMe = await ownerAgent.get('/api/auth/me').expect(200);
    const takerMe = await takerAgent.get('/api/auth/me').expect(200);

    const task = await Task.create({
      title: 'Open only',
      description: '',
      owner_user_id: new mongoose.Types.ObjectId(ownerMe.body.user.id),
      taker_user_id: new mongoose.Types.ObjectId(takerMe.body.user.id),
      credit: 2,
      status: 'Open',
    });

    await takerAgent.post(`/api/tasks/${task._id}/comments`).send({ comment: 'nope' }).expect(403);
  });

  it('empty or missing comment returns 400', async () => {
    const ownerAgent = request.agent(app);
    const takerAgent = request.agent(app);
    await signup(ownerAgent, 'cmt5-o@example.com', 'C5O');
    await signup(takerAgent, 'cmt5-t@example.com', 'C5T');
    const ownerMe = await ownerAgent.get('/api/auth/me').expect(200);
    const takerMe = await takerAgent.get('/api/auth/me').expect(200);

    const task = await Task.create({
      title: 'Val',
      description: '',
      owner_user_id: new mongoose.Types.ObjectId(ownerMe.body.user.id),
      taker_user_id: new mongoose.Types.ObjectId(takerMe.body.user.id),
      credit: 1,
      status: 'In Progress',
    });

    await takerAgent.post(`/api/tasks/${task._id}/comments`).send({ comment: '   ' }).expect(400);
    await takerAgent.post(`/api/tasks/${task._id}/comments`).send({}).expect(400);
  });

  it('comment over max length returns 400', async () => {
    const ownerAgent = request.agent(app);
    const takerAgent = request.agent(app);
    await signup(ownerAgent, 'cmt6-o@example.com', 'C6O');
    await signup(takerAgent, 'cmt6-t@example.com', 'C6T');
    const ownerMe = await ownerAgent.get('/api/auth/me').expect(200);
    const takerMe = await takerAgent.get('/api/auth/me').expect(200);

    const task = await Task.create({
      title: 'Long',
      description: '',
      owner_user_id: new mongoose.Types.ObjectId(ownerMe.body.user.id),
      taker_user_id: new mongoose.Types.ObjectId(takerMe.body.user.id),
      credit: 1,
      status: 'In Progress',
    });

    const tooLong = 'a'.repeat(10001);
    await takerAgent.post(`/api/tasks/${task._id}/comments`).send({ comment: tooLong }).expect(400);
  });

  it('GET and POST for missing task return 404', async () => {
    const agent = request.agent(app);
    await signup(agent, 'cmt7@example.com', 'C7');
    const missing = new mongoose.Types.ObjectId();
    await agent.get(`/api/tasks/${missing}/comments`).expect(404);
    await agent.post(`/api/tasks/${missing}/comments`).send({ comment: 'x' }).expect(404);
  });
});
