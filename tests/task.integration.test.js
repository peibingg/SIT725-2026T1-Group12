'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcryptjs');
const User = require('../models/user.model');
const Task = require('../models/task.model');

let app;
let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  process.env.SESSION_SECRET = 'test-session-secret-for-jest-tasks';
  process.env.NODE_ENV = 'test';
  await mongoose.connect(process.env.MONGODB_URI);
  app = require('../app');
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Task.deleteMany({});
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
