'use strict';

/**
 * Drops the entire MongoDB database named in MONGODB_URI, then runs seed.js.
 * Intended for local development only — destroys all data in that database.
 */
const path = require('path');
const { execSync } = require('child_process');
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/taskMarketplaceDB';
const repoRoot = path.join(__dirname, '..');

async function main() {
  console.warn('reset-db-and-seed: This will DROP the database and remove ALL data.');
  console.warn('reset-db-and-seed: URI:', MONGODB_URI.replace(/:[^:@/]+@/, ':****@'));

  await mongoose.connect(MONGODB_URI);
  const dbName = mongoose.connection.name;
  await mongoose.connection.dropDatabase();
  console.log('reset-db-and-seed: dropped database:', dbName);
  await mongoose.disconnect();

  execSync('node seed.js', { stdio: 'inherit', cwd: repoRoot, env: process.env });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
