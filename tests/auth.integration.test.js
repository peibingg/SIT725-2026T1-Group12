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
