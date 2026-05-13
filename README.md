# Task Marketplace

SIT725 Group 12 — a **credit-based task marketplace** built with **Node.js**, **Express**, **MongoDB**, and **Mongoose**. The web UI is static files under `public/` (HTML/CSS/JS) calling JSON APIs under `/api`.

For Jira-style user stories and design notes, see the [`docs/`](docs/) folder.

---

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Node.js** | **Current LTS** (e.g. 20.x or 22.x) recommended. |
| **MongoDB** | **6+** running locally, or use **MongoDB Atlas** and set `MONGODB_URI` accordingly. |
| **Git** | To clone this repository. |

---

## Setup

From a terminal:

```bash
git clone https://github.com/peibingg/SIT725-2026T1-Group12.git
cd SIT725-2026T1-Group12
npm install
```

Start MongoDB (if local), then start the app:

```bash
npm start
```

The server listens on **`PORT`** (default **3000**). Open in a browser:

**http://localhost:3000**

---

## Environment variables

Copy the example file and edit values (real secrets stay out of Git — `.env` is listed in `.gitignore`):

```bash
cp .env.example .env
```

| Variable | Required | Example (non-secret) | Purpose |
|----------|----------|----------------------|---------|
| `MONGODB_URI` | No* | `mongodb://127.0.0.1:27017/taskMarketplaceDB` | MongoDB connection string. *Defaults in code if unset. |
| `PORT` | No | `3000` | HTTP port for `server.js`. |
| `SESSION_SECRET` | When using sessions | `your-long-random-string-here` | Secret for **express-session** (dependency is present; wire middleware in `server.js` when enabling server-side sessions). |

Do **not** commit production credentials, API keys, or real user passwords.

---

## Database and seeding

The app expects MongoDB at `MONGODB_URI` (see above).

Load **sample users, tasks, transactions, and comments** (useful for development, demos, and manual testing):

```bash
npm run seed
```

**Behaviour (idempotent):** If the **`users`** collection already has at least one document, the script **prints a skip message and exits** without inserting duplicates (you will see: `Seed: skipped — database already has users`).

**Quick full re-seed on local MongoDB (dev only):** stop `npm start`, then:

```bash
npm run seed:reset
```

That **drops the whole database** pointed to by `MONGODB_URI` and runs `seed.js`. Do **not** use this against production or shared Atlas clusters.

**Manual re-seed:** drop the database or clear collections (Compass, `mongosh`, etc.), then run `npm run seed` again.

**Demo accounts** (after a successful seed; **local/demo only**):

| Email | Password | Role |
|-------|----------|------|
| `alice@example.com` … `eve@example.com` | `demo123456` | User |
| `admin@example.com` | `admin` | Admin |

---

## Data model (MongoDB collections)

Mongoose maps each **model** to a **collection** (default pluralised names: `users`, `tasks`, …). Main fields:

| Collection / model | Fields (conceptual) |
|--------------------|---------------------|
| **User** | `_id`, `first_name`, `last_name`, `email` (unique), `password_hash` (not selected by default), `credit_balance`, `role` (`Admin` \| `User`), `created` |
| **Task** | `_id`, `title`, `description`, `owner_user_id`, `taker_user_id` (optional), `credit`, `status` (`Open` \| `In Progress` \| `Completed` \| `Finalised`), `created` |
| **Transaction** | `_id`, `task_id`, `credit`, `owner_user_id`, `taker_user_id`, `status` (`Active` \| `Deleted`), optional **`purpose`** (`Payout` = final owner→taker transfer on approve; at most one **Active** payout per `task_id` via partial unique index), `created` |
| **Comment** | `_id`, `task_id`, `comment`, `user_id`, `created` |

Source of truth: `models/*.model.js`.

---

## npm scripts

| Script | Command | Description |
|--------|---------|-------------|
| `start` | `npm start` | Runs `node server.js` — Express API + static `public/`. |
| `seed` | `npm run seed` | Runs `node seed.js` — inserts sample data if DB has no users. |
| `seed:reset` | `npm run seed:reset` | **Local dev only:** drops the DB from `MONGODB_URI`, then runs `seed.js` (use when `npm run seed` is skipped). |
| `test` | `npm test` | Runs **Jest** (`NODE_ENV=test`, in-band): API integration, client validator unit tests, and DOM/jsdom tests. No separate E2E runner. |

---

## Automated tests

From the repo root (after `npm install`):

| What | Command |
|------|---------|
| **All tests** | `npm test` |
| **API integration** (Express + Supertest + in-memory Mongo) | `npm test -- tests/auth.integration.test.js` · `npm test -- tests/task.integration.test.js` |
| **Unit** (auth client validation vs backend rules) | `npm test -- tests/authValidation.unit.test.js` |
| **DOM** (jsdom; e.g. sign-in error UI with mocked `fetch`) | `npm test -- tests/signin.dom.test.js` |

**Watch one file** (optional):

```bash
NODE_ENV=test ./node_modules/.bin/jest --watch tests/auth.integration.test.js
```

---

## API overview

Base URL: `http://localhost:<PORT>` (default port **3000**).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | JSON health check + Mongoose connection state. |
| GET | `/api/auth/ping` | Auth router smoke test. |
| POST | `/api/auth/signup` | Register (JSON: `first_name`, `last_name`, `email`, `password`). Passwords are **bcrypt-hashed**; response omits `password_hash`. |
| POST | `/api/auth/signin` | Sign in with `email` / `password`. Returns JSON `user` (client may store in `sessionStorage` for the current UI). |
| GET | `/api/tasks/ping` | Tasks router smoke test. |
| GET | `/api/tasks/browse` | **Session required.** Returns `{ openForMe, myAsTaker, meta }`: takeable **Open** tasks (no taker, **not owned by you** — your own open listings are excluded) and tasks where you are **taker** with status **In Progress**, **Completed**, or **Finalised**. `meta.myPostedOpenCount` counts your own open tasks (for empty-state hints). Each task includes `owner` / `taker` as `{ id, first_name, last_name, email }` (no `password_hash`). |
| POST | `/api/tasks/:id/take` | **Session required.** Atomically claims an **Open** task with no taker if you are not the owner → **In Progress** and you become taker. **409** if already claimed or wrong state; **403** if you own the task; **404** if missing. |
| POST | `/api/tasks/:id/complete` | **Session required.** Taker only: **In Progress** → **Completed**. **403** if not the assigned taker; **409** if not in progress; **404** if missing. |
| POST | `/api/tasks/:id/approve` | **Session required.** **Owner only:** **Completed** → **Finalised** and atomically transfers **`task.credit`** from owner to taker (MongoDB transaction). Rejects if owner **credit_balance** \< task credit (**400**), if a **Payout** already exists (**409**), or if caller is not the owner (**403**). |
| GET | `/api/tasks/:taskId/comments` | **Session required.** **Owner or assigned taker** may list progress comments for that task. Returns `{ comments }` with items `{ id, user_id, comment, created, user? }` sorted by **`created`** ascending. **`user`** is populated with `first_name`, `last_name`, `email` (no `password_hash`). **403** if neither owner nor taker; **404** if task missing; **400** if `taskId` is not a valid ObjectId. |
| POST | `/api/tasks/:taskId/comments` | **Session required.** **Assigned taker only**, and only while status is **In Progress**. JSON body: **`comment`** (required, trimmed, non-empty, max **10 000** characters). **201** on success. **403** if wrong role or wrong status; **400** if validation fails; **404** if task missing. |
| GET | `/api/credits/ping` | Credits router smoke test. |

**Logical `task_comments`:** Progress notes are persisted in the MongoDB **`comments`** collection via the **`Comment`** model (`task_id`, `user_id`, `comment`, `created`).

The static site (`public/index.html`) uses the auth endpoints from the browser.

---

## Project layout (short)

| Path | Role |
|------|------|
| `server.js` | Express app, MongoDB connect, routes, `listen`. |
| `models/` | Mongoose schemas (including **`comment.model.js`** for logical **task_comments** → `comments` collection). |
| `controllers/` | Route handlers (thin; task status mutations delegate to `services/taskStatus.service.js`). |
| `services/` | Server-side domain logic (e.g. task status transitions + approve payout). |
| `routes/` | Express routers mounted under `/api`. |
| `public/` | Static UI (`index.html`, `css/`, `js/`). |
| `seed.js` | Sample data loader. |
| `docs/` | Markdown user stories / specs for Jira. |

---

## Troubleshooting

- **“MongoDB connection error” on start** — MongoDB is not running or `MONGODB_URI` is wrong. Start `mongod` locally or fix the URI (Atlas IP allowlist, user/password in URI).
- **`/tasks.html` lists are empty for Alice** — The **Open for you** list only shows **other people’s** open tasks (you cannot claim your own). **Your tasks as taker** only lists work where **you are the assigned taker**. If your database only has tasks you own, or none where you are taker, both lists can be empty even though tasks exist. For the full demo dataset, use **`npm run seed:reset`** (local only) or **`npm run seed`** on an empty database, or sign in as **ben@example.com** / **eve@example.com** (demo users) to see mixed data, or add tasks owned by another user with status **Open** and no taker.
- **Port already in use (`EADDRINUSE`)** — Another process uses port 3000. Stop it or run `PORT=3001 npm start` (and open `http://localhost:3001`).
- **Sign-in works but refresh “forgets” state** — The UI stores the signed-in user in **`sessionStorage`**; that is per-tab and cleared when the session/tab ends. Server-side sessions can be added later with `express-session` + cookie `credentials` in `fetch`.

---

## Testing notes (for contributors)

- After a **fresh clone**, follow **Setup** → **seed** → **open the site** and confirm sign-up / sign-in flows.
- Run **`npm test`** before pushing; see **Automated tests** above for per-suite commands.
- In GitHub/GitLab, preview this README and **click relative links** (e.g. [`docs/`](docs/)) to ensure they resolve.

---

## Licence

See `package.json` (`license` field).
