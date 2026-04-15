'use strict';

/**
 * Optional seed script — wire up after models and auth are implemented.
 */
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/taskMarketplaceDB';

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Seed: connected. Add User/Task inserts here.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
