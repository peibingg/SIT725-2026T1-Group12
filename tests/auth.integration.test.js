'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../models/user.model');

let app;
let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  process.env.SESSION_SECRET = 'test-session-secret-for-jest';
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
});

describe('POST /api/auth/signup', () => {
  it('returns 400 for invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ first_name: 'A', last_name: 'B', email: 'not-an-email', password: 'secret12' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for short password', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ first_name: 'A', last_name: 'B', email: 'ok@example.com', password: '12345' });
    expect(res.status).toBe(400);
  });

  it('returns 409 for duplicate email', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ first_name: 'A', last_name: 'B', email: 'dup@example.com', password: 'secret12' })
      .expect(201);
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ first_name: 'C', last_name: 'D', email: 'dup@example.com', password: 'secret12' });
    expect(res.status).toBe(409);
  });

  it('returns 201 and safe user without password_hash', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ first_name: 'E', last_name: 'F', email: 'new@example.com', password: 'secret12' })
      .expect(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('new@example.com');
    expect(res.body.user).not.toHaveProperty('password_hash');
    expect(res.body.user.credit_balance).toBe(100);

    const stored = await User.findOne({ email: 'new@example.com' }).select('+password_hash');
    expect(stored.password_hash).toMatch(/^\$2[aby]\$/);
  });
});

describe('POST /api/auth/signin and session', () => {
  it('returns 401 for wrong password', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ first_name: 'G', last_name: 'H', email: 'g@example.com', password: 'correct12' });
    const res = await request(app)
      .post('/api/auth/signin')
      .send({ email: 'g@example.com', password: 'wrongpass' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Invalid email or password/i);
  });

  it('GET /api/auth/me returns 401 without session', async () => {
    await request(app).get('/api/auth/me').expect(401);
  });

  it('signin then GET /me 200, signout then GET /me 401', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ first_name: 'I', last_name: 'J', email: 'sess@example.com', password: 'secret12' })
      .expect(201);

    const agent = request.agent(app);
    await agent.post('/api/auth/signin').send({ email: 'sess@example.com', password: 'secret12' }).expect(200);

    const me1 = await agent.get('/api/auth/me').expect(200);
    expect(me1.body.user.email).toBe('sess@example.com');

    await agent.post('/api/auth/signout').expect(200);

    await agent.get('/api/auth/me').expect(401);
  });
});

describe('GET /api/auth/me profile', () => {
  it('returns fresh credit_balance from MongoDB after update', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/signup')
      .send({ first_name: 'Bal', last_name: 'Ance', email: 'balance@example.com', password: 'secret12' })
      .expect(201);

    const me1 = await agent.get('/api/auth/me').expect(200);
    expect(me1.body.user.credit_balance).toBe(100);
    expect(me1.body.user).not.toHaveProperty('password_hash');

    await User.updateOne({ email: 'balance@example.com' }, { $set: { credit_balance: 99 } });

    const me2 = await agent.get('/api/auth/me').expect(200);
    expect(me2.body.user.credit_balance).toBe(99);
    expect(me2.body.user).not.toHaveProperty('password_hash');
  });
});

describe('PATCH /api/auth/password', () => {
  it('returns 401 without session', async () => {
    await request(app)
      .patch('/api/auth/password')
      .send({ current_password: 'a', new_password: 'bbbbbb' })
      .expect(401);
  });

  it('returns 401 for wrong current password', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/signup')
      .send({ first_name: 'P', last_name: 'W', email: 'pw@example.com', password: 'original12' })
      .expect(201);

    const res = await agent.patch('/api/auth/password').send({
      current_password: 'wrongwrong',
      new_password: 'newpass12',
    });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/current password/i);
  });

  it('returns 400 for short new password with same message as signup', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/signup')
      .send({ first_name: 'S', last_name: 'H', email: 'short@example.com', password: 'goodpass12' })
      .expect(201);

    const res = await agent.patch('/api/auth/password').send({
      current_password: 'goodpass12',
      new_password: '12345',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Password must be at least 6 characters');
  });

  it('returns 400 when confirm_password is sent and does not match new_password', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/signup')
      .send({ first_name: 'C', last_name: 'F', email: 'confirm@example.com', password: 'startpass12' })
      .expect(201);

    const res = await agent.patch('/api/auth/password').send({
      current_password: 'startpass12',
      new_password: 'newpass12',
      confirm_password: 'otherpass12',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/do not match/i);
  });

  it('updates password: 200 then signin with new works and old fails', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/signup')
      .send({ first_name: 'O', last_name: 'K', email: 'okchange@example.com', password: 'firstpass12' })
      .expect(201);

    await agent
      .patch('/api/auth/password')
      .send({
        current_password: 'firstpass12',
        new_password: 'secondpass12',
        confirm_password: 'secondpass12',
      })
      .expect(200);

    await agent.post('/api/auth/signout').expect(200);

    const bad = await request(app).post('/api/auth/signin').send({ email: 'okchange@example.com', password: 'firstpass12' });
    expect(bad.status).toBe(401);

    const agent2 = request.agent(app);
    await agent2.post('/api/auth/signin').send({ email: 'okchange@example.com', password: 'secondpass12' }).expect(200);
  });
});
