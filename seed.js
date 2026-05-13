'use strict';

/**
 * Inserts sample users, tasks, transactions, and comments when the database is empty.
 * Seeds 6 users (5 regular + 1 Admin); tasks include varied statuses, with extra rows for alice@example.com
 * as owner and as taker (Open / In Progress / Completed / Finalised) for demos.
 * Requires MongoDB running at MONGODB_URI (default mongodb://127.0.0.1:27017/taskMarketplaceDB).
 */
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const User = require('./models/user.model');
const Task = require('./models/task.model');
const Transaction = require('./models/transaction.model');
const Comment = require('./models/comment.model');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/taskMarketplaceDB';
const SALT_ROUNDS = 10;
const DEMO_PASSWORD = 'demo123456';

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Seed: connected to', MONGODB_URI);

  if ((await User.countDocuments()) > 0) {
    console.log('Seed: skipped — database already has users. Use an empty DB to run sample inserts.');
    await mongoose.disconnect();
    return;
  }

  const password_hash = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);
  const admin_password_hash = await bcrypt.hash('admin', SALT_ROUNDS);

  const users = await User.insertMany([
    {
      first_name: 'Alice',
      last_name: 'Nguyen',
      email: 'alice@example.com',
      password_hash,
      credit_balance: 120,
      role: 'User',
    },
    {
      first_name: 'Ben',
      last_name: 'Patel',
      email: 'ben@example.com',
      password_hash,
      credit_balance: 85,
      role: 'User',
    },
    {
      first_name: 'Chen',
      last_name: 'Wu',
      email: 'chen@example.com',
      password_hash,
      credit_balance: 200,
      role: 'User',
    },
    {
      first_name: 'Dana',
      last_name: 'Smith',
      email: 'dana@example.com',
      password_hash,
      credit_balance: 40,
      role: 'User',
    },
    {
      first_name: 'Eve',
      last_name: 'Okonkwo',
      email: 'eve@example.com',
      password_hash,
      credit_balance: 155,
      role: 'User',
    },
    {
      first_name: 'Admin',
      last_name: 'Account',
      email: 'admin@example.com',
      password_hash: admin_password_hash,
      credit_balance: 0,
      role: 'Admin',
    },
  ]);

  const [alice, ben, chen, dana, eve] = users;

  const tasks = await Task.insertMany([
    {
      title: 'Proofread sustainability blog post',
      description: 'English proofreading for a 1500-word article; owner still seeking a taker.',
      owner_user_id: alice._id,
      taker_user_id: null,
      credit: 15,
      status: 'Open',
    },
    {
      title: 'Set up Express API repository',
      description: 'Create GitHub repo, README, and skeleton routes; Eve is implementing.',
      owner_user_id: ben._id,
      taker_user_id: eve._id,
      credit: 25,
      status: 'In Progress',
    },
    {
      title: 'Design landing page hero',
      description: 'Figma mock for hero section; work finished, awaiting final sign-off.',
      owner_user_id: chen._id,
      taker_user_id: dana._id,
      credit: 40,
      status: 'Completed',
    },
    {
      title: 'MongoDB indexes and seed review',
      description: 'Review collections, indexes, and seed script; transaction archived.',
      owner_user_id: dana._id,
      taker_user_id: alice._id,
      credit: 30,
      status: 'Finalised',
    },
    {
      title: 'Accessibility audit checklist',
      description: 'Run axe on main flows and file issues in the tracker; no assignee yet.',
      owner_user_id: eve._id,
      taker_user_id: null,
      credit: 20,
      status: 'Open',
    },
    {
      title: 'Write API integration tests',
      description: 'Supertest coverage for auth and tasks; Chen picked this up.',
      owner_user_id: alice._id,
      taker_user_id: chen._id,
      credit: 35,
      status: 'In Progress',
    },
    {
      title: 'Deploy staging to Render',
      description: 'Wire env vars and smoke-test health endpoint; done and paid out.',
      owner_user_id: ben._id,
      taker_user_id: dana._id,
      credit: 45,
      status: 'Completed',
    },
  ]);

  const [tAliceOpen, tBenProgress, tChenDone, tDanaFinal, tEveOpen, tAliceProgress, tBenDone] = tasks;

  /** Extra tasks so alice@example.com sees varied statuses as taker and as owner (browse / profile demos). */
  const aliceSeedTasks = await Task.insertMany([
    {
      title: 'Peer-review CS draft chapter',
      description: 'Ben owns this; Alice is mid-review for course credit.',
      owner_user_id: ben._id,
      taker_user_id: alice._id,
      credit: 18,
      status: 'In Progress',
    },
    {
      title: 'Weekly release notes draft',
      description: 'Eve owns this; Alice finished the writing pass.',
      owner_user_id: eve._id,
      taker_user_id: alice._id,
      credit: 22,
      status: 'Completed',
    },
    {
      title: 'Handbook style consistency pass',
      description: 'Chen owns this; Alice completed work and owner finalised.',
      owner_user_id: chen._id,
      taker_user_id: alice._id,
      credit: 12,
      status: 'Finalised',
    },
    {
      title: 'Portfolio PDF export polish',
      description: 'Alice owns this; Dana delivered the export fixes.',
      owner_user_id: alice._id,
      taker_user_id: dana._id,
      credit: 28,
      status: 'Completed',
    },
    {
      title: 'Bug triage workshop prep',
      description: 'Second open task owned by Alice (no taker yet) for owner-side demos.',
      owner_user_id: alice._id,
      taker_user_id: null,
      credit: 10,
      status: 'Open',
    },
  ]);

  const [tAliceTakerProgress, tAliceTakerDone, tAliceTakerFinal, tAliceOwnerDone] = aliceSeedTasks;

  await Transaction.insertMany([
    {
      task_id: tBenProgress._id,
      credit: 25,
      owner_user_id: ben._id,
      taker_user_id: eve._id,
      status: 'Active',
    },
    {
      task_id: tChenDone._id,
      credit: 40,
      owner_user_id: chen._id,
      taker_user_id: dana._id,
      status: 'Active',
    },
    {
      task_id: tDanaFinal._id,
      credit: 30,
      owner_user_id: dana._id,
      taker_user_id: alice._id,
      status: 'Active',
    },
    {
      task_id: tAliceProgress._id,
      credit: 35,
      owner_user_id: alice._id,
      taker_user_id: chen._id,
      status: 'Active',
    },
    {
      task_id: tBenDone._id,
      credit: 45,
      owner_user_id: ben._id,
      taker_user_id: dana._id,
      status: 'Active',
    },
    {
      task_id: tAliceOpen._id,
      credit: 15,
      owner_user_id: alice._id,
      taker_user_id: eve._id,
      status: 'Deleted',
    },
    {
      task_id: tAliceTakerProgress._id,
      credit: 18,
      owner_user_id: ben._id,
      taker_user_id: alice._id,
      status: 'Active',
    },
    {
      task_id: tAliceTakerDone._id,
      credit: 22,
      owner_user_id: eve._id,
      taker_user_id: alice._id,
      status: 'Active',
    },
    {
      task_id: tAliceTakerFinal._id,
      credit: 12,
      owner_user_id: chen._id,
      taker_user_id: alice._id,
      status: 'Active',
    },
    {
      task_id: tAliceOwnerDone._id,
      credit: 28,
      owner_user_id: alice._id,
      taker_user_id: dana._id,
      status: 'Active',
    },
  ]);

  await Comment.insertMany([
    {
      task_id: tAliceOpen._id,
      user_id: ben._id,
      comment: 'I can proofread this — expect a first pass by Friday.',
    },
    {
      task_id: tBenProgress._id,
      user_id: eve._id,
      comment: 'Branch is up: feature/api-skeleton. Pushing routes tomorrow.',
    },
    {
      task_id: tChenDone._id,
      user_id: chen._id,
      comment: 'Approved the hero layout — matches brand tokens.',
    },
    {
      task_id: tDanaFinal._id,
      user_id: dana._id,
      comment: 'Thanks Alice — closing this task after your index recommendations.',
    },
    {
      task_id: tEveOpen._id,
      user_id: alice._id,
      comment: 'Happy to pair on WCAG contrast checks if useful.',
    },
    {
      task_id: tAliceProgress._id,
      user_id: alice._id,
      comment: 'Chen, cover happy path + 401 on bad credentials.',
    },
    {
      task_id: tBenDone._id,
      user_id: dana._id,
      comment: 'Staging URL in README; health check returns 200.',
    },
    {
      task_id: tAliceTakerProgress._id,
      user_id: alice._id,
      comment: 'Halfway through the chapter — will add margin notes by Tuesday.',
    },
    {
      task_id: tAliceTakerDone._id,
      user_id: alice._id,
      comment: 'Release notes v1.0 sent for your review.',
    },
    {
      task_id: tAliceOwnerDone._id,
      user_id: dana._id,
      comment: 'PDF bookmarks fixed; fonts embedded for print.',
    },
  ]);

  console.log('Seed: inserted 6 users (incl. Admin), 12 tasks, 10 transactions, 10 comments.');
  console.log(`Seed: demo users — alice@example.com … eve@example.com · password: ${DEMO_PASSWORD}`);
  console.log('Seed: admin — admin@example.com · password: admin');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
