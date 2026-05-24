'use strict';

const mongoose = require('mongoose');
const app = require('./app');

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/taskMarketplaceDB';
const MONGO_CONNECT_RETRIES = Number(process.env.MONGO_CONNECT_RETRIES) || 10;
const MONGO_CONNECT_DELAY_MS = Number(process.env.MONGO_CONNECT_DELAY_MS) || 2000;

async function connectMongo() {
  let lastErr;
  for (let attempt = 1; attempt <= MONGO_CONNECT_RETRIES; attempt += 1) {
    try {
      await mongoose.connect(MONGODB_URI);
      console.log('MongoDB connected:', MONGODB_URI);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < MONGO_CONNECT_RETRIES) {
        console.warn(
          `MongoDB connect attempt ${attempt}/${MONGO_CONNECT_RETRIES} failed (${err.message}); retrying...`,
        );
        await new Promise((r) => setTimeout(r, MONGO_CONNECT_DELAY_MS));
      }
    }
  }
  throw lastErr;
}

async function start() {
  try {
    await connectMongo();
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    console.error(
      'Start MongoDB first (local): npm run mongo:start — or docker compose up — or set MONGODB_URI for Atlas.',
    );
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start();
 