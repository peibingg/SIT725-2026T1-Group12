'use strict';

const mongoose = require('mongoose');
const app = require('./app');

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/taskMarketplaceDB';

async function start() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB connected:', MONGODB_URI);
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    console.error(
      'Start MongoDB first (local): brew services start mongodb-community — or run mongod --dbpath ~/data/db',
    );
    console.error('Or set MONGODB_URI in .env for MongoDB Atlas.');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start();
 