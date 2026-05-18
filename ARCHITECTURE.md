# Architecture Overview

This document explains how the **Discipline Tracker** codebase is organised, how the layers communicate, and why key design decisions were made. Intended for developers joining the project for the first time.

---

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Tech Stack](#tech-stack)
3. [Repository Layout](#repository-layout)
4. [Backend Deep Dive](#backend-deep-dive)
   - [Entry Point](#entry-point-mainpy)
   - [Database Layer](#database-layer)
   - [Data Models](#data-models)
   - [Routers (API endpoints)](#routers-api-endpoints)
   - [Scoring Engine](#scoring-engine)
5. [Frontend Deep Dive](#frontend-deep-dive)
   - [Entry Point](#entry-point-mainjsx--appjsx)
   - [Pages](#pages-one-per-tab)
   - [Shared Components](#shared-components)
   - [API Layer](#api-layer)
6. [Data Flow — End to End](#data-flow--end-to-end)
7. [Database Schema](#database-schema)
8. [Scoring System Explained](#scoring-system-explained)
9. [Environment & Config](#environment--config)

---

## High-Level Architecture

```
┌─────────────────────────┐        HTTP/JSON        ┌────────────────────────────┐
│                         │  ──────────────────────► │                            │
│   React (Vite)          │                          │   FastAPI (Python)         │
│   Frontend : 3000       │ ◄──────────────────────  │   Backend  : 8000          │
│                         │                          │                            │
└─────────────────────────┘                          └────────────┬───────────────┘
                                                                   │ SQLAlchemy ORM
                                                                   ▼
                                                      ┌────────────────────────────┐
                                                      │   PostgreSQL               │
                                                      │   (Docker locally,         │
                                                      │    Oracle Cloud on prod)   │
                                                      └────────────────────────────┘
```

The frontend and backend are **completely separate processes**. They communicate exclusively through a REST JSON API. This means:
- You can replace the frontend (e.g. build a mobile app) without touching the backend.
- You can swap the database without changing any frontend code.

---

## Tech Stack

| Layer      | Technology             | Version  | Why chosen                                      |
|------------|------------------------|----------|-------------------------------------------------|
| Frontend   | React                  | 18.3.x   | Component model, huge ecosystem                 |
| Frontend   | Vite                   | 5.3.x    | Fast dev server, ESM-native builds              |
| Frontend   | Tailwind CSS           | 3.4.x    | Utility-first, no CSS files needed              |
| Frontend   | axios                  | latest   | Clean HTTP client with interceptors             |
| Frontend   | dayjs                  | latest   | Lightweight date manipulation                   |
| Backend    | FastAPI                | 0.111.x  | Async-ready, auto OpenAPI docs, fast            |
| Backend    | SQLAlchemy             | 2.x      | ORM + raw SQL when needed, DB-agnostic          |
| Backend    | psycopg2-binary        | latest   | PostgreSQL driver                               |
| Backend    | python-jose            | 3.3.x    | JWT creation and verification (HS256)           |
| Backend    | bcrypt                 | 4.x      | Password hashing                                |
| Backend    | pydantic-settings      | 2.x      | `.env` loading with type safety                 |
| Database   | PostgreSQL             | 16       | ACID, strong constraints, `ON CONFLICT` upsert  |
| Dev DB     | Docker                 | —        | Throwaway local Postgres, no local install      |

---

## Repository Layout

```
discipline-tracker/
│
├── backend/                        ← Python FastAPI application
│   ├── main.py                     ← App entry point, CORS, router registration
│   ├── database.py                 ← SQLAlchemy engine + session factory
│   ├── dependencies.py             ← JWT verification dependency (guards all routes)
│   ├── models.py                   ← All ORM table definitions
│   ├── schemas.py                  ← Pydantic request / response models
│   ├── services/
│   │   └── scoring.py              ← Scoring engine (business logic lives here)
│   ├── routers/
│   │   ├── auth.py                 ← POST /auth/login — verifies password, returns JWT
│   │   ├── habits.py               ← GET/POST/PUT/DELETE /habits
│   │   ├── entries.py              ← GET/POST /entries  (daily habit log)
│   │   ├── todos.py                ← GET/POST/PUT/DELETE /todos + task entries
│   │   └── analytics.py           ← GET /analytics/weekly  /analytics/monthly
│   ├── .env                        ← Local secrets (git-ignored)
│   ├── .env.example                ← Template committed to repo
│   └── requirements.txt
│
├── frontend/                       ← React + Vite application
│   └── src/
│       ├── main.jsx                ← React DOM mount
│       ├── App.jsx                 ← Tab shell (Today / Progress / Tasks / Configure)
│       │
│       ├── pages/                  ← One file per full-page view (matches a tab)
│       │   ├── Login.jsx           ← Password screen (shown when no valid token)
│       │   ├── DailyLog.jsx        ← "Today" tab — daily habit + task log
│       │   ├── Analytics.jsx       ← "Progress" tab — weekly & monthly views
│       │   ├── TaskList.jsx        ← "Tasks" tab — to-do management
│       │   └── HabitSettings.jsx   ← "Configure" tab — habit CRUD + scoring rules
│       │
│       ├── components/             ← Reusable UI pieces (shared across pages)
│       │   ├── ScoreBadge.jsx      ← Colour-coded earned/max display
│       │   └── HabitRow.jsx        ← Single habit row, renders per scoring_type
│       │
│       └── api/                    ← All HTTP calls, split by domain
│           ├── base.js             ← Shared axios instance (reads VITE_API_URL, attaches JWT)
│           ├── auth.js             ← login() — POST /auth/login
│           ├── habits.js           ← Habit + scoring rule API calls
│           ├── entries.js          ← Daily entry API calls
│           ├── todos.js            ← Todo + task entry API calls
│           ├── analytics.js        ← Weekly / monthly analytics API calls
│           └── index.js            ← Re-exports everything (single import path)
│
├── SETUP.md                        ← How to run locally (start here)
├── ARCHITECTURE.md                 ← This file
├── README.md
└── .gitignore
```

**Rule of thumb for where to add new code:**
- New API endpoint → `backend/routers/`
- Business / calculation logic → `backend/services/`
- New tab / full page → `frontend/src/pages/`
- Widget used on multiple pages → `frontend/src/components/`
- New API call → add to the relevant `frontend/src/api/*.js` file

---

## Backend Deep Dive

### Entry Point (`main.py`)

```
main.py
  ├── Calls load_dotenv() — loads .env before any module reads os.getenv()
  ├── Creates FastAPI app
  ├── Configures CORS (allows localhost:3000 and localhost:5173)
  ├── Calls Base.metadata.create_all() — auto-creates missing tables on startup
  └── Registers routers:
        app.include_router(auth_router.router)               →  /auth  (public)
        app.include_router(habits.router,   deps=[verify_token])  →  /habits
        app.include_router(entries.router,  deps=[verify_token])  →  /entries
        app.include_router(todos.router,    deps=[verify_token])  →  /todos
        app.include_router(analytics.router,deps=[verify_token])  →  /analytics
```

`verify_token` (in `dependencies.py`) validates the Bearer JWT on every request to the protected routers. The `/auth/login` endpoint and `/health` are intentionally left public.

### Database Layer

**`database.py`** does three things:
1. Reads `DATABASE_URL` from `.env` (using `pydantic-settings`)
2. Creates a SQLAlchemy `engine` and `SessionLocal` factory
3. Provides `get_db()` — a FastAPI dependency that opens/closes a DB session per request

```python
# Every router that needs DB access declares this dependency:
def my_endpoint(db: Session = Depends(get_db)):
    ...
```

### Data Models

All database tables are defined in **`models.py`** using SQLAlchemy ORM:

| Table                | Purpose                                                       |
|----------------------|---------------------------------------------------------------|
| `habits`             | Habit definitions (name, max points, scoring type, active)   |
| `scoring_rules`      | Per-habit rules that map a value/condition to a score %      |
| `daily_entries`      | One row per (date, habit) — stores time/duration, earned pts |
| `todos`              | Persistent to-do task list (title, points, status)           |
| `daily_task_entries` | One row per (date, todo) — time worked + earned points       |

`UNIQUE(entry_date, habit_id)` on `daily_entries` enforces that each habit is logged at most once per day. The backend uses PostgreSQL `ON CONFLICT DO UPDATE` (upsert) so re-submitting a value updates rather than creates a duplicate.

### Routers (API endpoints)

Each router file owns one resource domain:

#### `routers/auth.py` — `/auth`
| Method | Path           | Auth required | What it does                                 |
|--------|----------------|---------------|----------------------------------------------|
| POST   | `/auth/login`  | No            | Verify password, return 30-day JWT           |

The password is never stored in the database. It is compared against the `AUTH_PASSWORD_HASH` environment variable using `bcrypt.checkpw`. On success a JWT signed with `JWT_SECRET` is returned. The frontend stores this in `localStorage`.

#### `routers/habits.py` — `/habits`
| Method | Path                    | What it does                          |
|--------|-------------------------|---------------------------------------|
| GET    | `/habits`               | List habits (`?active_only=true/false`)|
| POST   | `/habits`               | Create a habit                        |
| PUT    | `/habits/{id}`          | Update name / points / type / active  |
| DELETE | `/habits/{id}`          | Delete habit + all its entries        |
| PUT    | `/habits/reorder`       | Bulk update display_order             |
| GET    | `/habits/{id}/rules`    | Get scoring rules for a habit         |
| PUT    | `/habits/{id}/rules`    | Replace all rules for a habit         |

#### `routers/entries.py` — `/entries`
| Method | Path               | What it does                              |
|--------|--------------------|-------------------------------------------|
| GET    | `/entries`         | All entries for a date (`?date=YYYY-MM-DD`)|
| POST   | `/entries`         | Upsert an entry (create or update)        |
| DELETE | `/entries/{id}`    | Delete a single entry                     |
| GET    | `/entries/summary` | Total earned/max/% for a date             |

#### `routers/todos.py` — `/todos`
| Method | Path                       | What it does                |
|--------|----------------------------|-----------------------------|
| GET    | `/todos`                   | List todos (optional filter)|
| POST   | `/todos`                   | Create todo                 |
| PUT    | `/todos/{id}`              | Update status / title etc.  |
| DELETE | `/todos/{id}`              | Delete todo                 |
| GET    | `/todos/entries`           | Task entries for a date     |
| POST   | `/todos/entries`           | Upsert task entry           |
| DELETE | `/todos/entries/{id}`      | Remove task entry           |

#### `routers/analytics.py` — `/analytics`
| Method | Path                  | What it does                                    |
|--------|-----------------------|-------------------------------------------------|
| GET    | `/analytics/weekly`   | 7-day data for the week containing `?date=`     |
| GET    | `/analytics/monthly`  | All days in `?year=&month=`                     |

Both return: per-day earned/max/percentage, per-habit scores (`habit_scores[]`), per-task scores (`task_scores[]`), a deduplicated `todos[]` list of every task worked on in the period, and a period summary (avg %, best day, days ≥ 80%). Task points are included in the day totals.

### Scoring Engine

Lives in **`services/scoring.py`**. Called by `routers/entries.py` every time an entry is saved.

```
Entry saved (start_time / end_time / duration_minutes)
  │
  └──► calculate_earned_points(habit, entry)
         │
         ├── scoring_type = "boolean"
         │     └── any value logged → full max_points
         │
         ├── scoring_type = "time_of_day"  (step rules)
         │     └── evaluate condition rules top-to-bottom, return % of first match
         │
         ├── scoring_type = "time_of_day_linear"
         │     └── sort breakpoints by time value → linear interpolate
         │
         ├── scoring_type = "duration"  (step rules)
         │     └── evaluate condition rules top-to-bottom, return % of first match
         │
         └── scoring_type = "duration_linear"
               └── sort breakpoints by minute value → linear interpolate
```

**Why sorting matters for linear types:** breakpoints are stored in the order the user adds them, not necessarily in ascending order. The engine always sorts by value before interpolating to guarantee correctness.

---

## Frontend Deep Dive

### Entry Point (`main.jsx` + `App.jsx`)

`main.jsx` mounts the React app into `<div id="root">`.

`App.jsx` is the shell. It checks `localStorage` for a valid JWT on mount. If none is found, it renders `<Login />` instead of the main app. Once authenticated it renders the tab bar:

```
App
├── No token → <Login onAuthenticated={…} />
└── Token present:
      ├── Tab bar: [Today] [Progress] [Tasks] [Configure]  +  Sign out
      └── Active page:
            Today     → <DailyLog />
            Progress  → <Analytics />
            Tasks     → <TaskList />
            Configure → <HabitSettings />
```

No routing library is used (React Router etc.) — the app is small enough that simple `activeTab` state is sufficient.

### Pages (one per tab)

| File                  | Tab       | Responsibility                                                |
|-----------------------|-----------|---------------------------------------------------------------|
| `Login.jsx`           | —         | Password form; stores JWT in localStorage on success          |
| `DailyLog.jsx`        | Today     | Load habits + entries for selected date, auto-save on change  |
| `Analytics.jsx`       | Progress  | Weekly heatmap grid (habits + tasks) + monthly calendar with score % and per-habit/task breakdowns |
| `TaskList.jsx`        | Tasks     | CRUD for to-do items, filter by status                       |
| `HabitSettings.jsx`   | Configure | CRUD for habits + inline scoring rules editor                |

Each page is self-contained: it owns its own state and fetches its own data.

### Shared Components

| File              | Used by              | Purpose                                                        |
|-------------------|----------------------|----------------------------------------------------------------|
| `ScoreBadge.jsx`  | DailyLog, Analytics  | Colour-coded `earned / max` display (green → yellow → red)    |
| `HabitRow.jsx`    | DailyLog             | Renders a single habit row — layout changes per `scoring_type` |

**Adding a new shared widget:** create it in `components/`, import where needed. Never put page-specific logic in `components/`.

### API Layer

All HTTP calls live in `api/`. Nothing else in the app talks to `fetch` or `axios` directly.

```
api/base.js          ← axios instance; attaches Bearer token on every request;
                       clears token + reloads on 401
api/auth.js          ← login(password) → POST /auth/login
api/habits.js        ← getHabits, createHabit, updateHabit, deleteHabit, ...
api/entries.js       ← getEntries, upsertEntry, getDailySummary
api/todos.js         ← getTodos, createTodo, updateTodo, deleteTodo, ...
api/analytics.js     ← getWeeklyAnalytics, getMonthlyAnalytics
api/index.js         ← re-exports all of the above (import { getHabits } from '../api')
```

**Why split by domain?** If you're working on habits, you open `api/habits.js` and see exactly which calls exist — no scrolling through a 200-line file.

---

## Data Flow — End to End

### Saving a daily habit entry

```
User types wakeup time "06:30" in DailyLog
  │
  ▼
handleFieldChange(habitId, 'start_time', '06:30')
  │  updates local state immediately (optimistic UI)
  │
  ▼
upsertEntry({ habit_id, entry_date, start_time: '06:30' })   [api/entries.js]
  │
  ▼  HTTP POST /entries
  │
  ▼
routers/entries.py  →  ON CONFLICT DO UPDATE  →  PostgreSQL
  │  after insert/update, calls calculate_earned_points()
  │
  ▼
services/scoring.py  →  runs scoring rules  →  returns earned_points
  │
  ▼
returns EntryOut JSON  →  React updates entry state with earned_points
  │
  ▼
getDailySummary(date)  →  GET /entries/summary  →  updates score banner
```

### Loading the Progress tab (weekly)

```
User clicks "Progress" tab
  │
  ▼
<Analytics /> mounts → <WeeklyView /> mounts
  │
  ▼
getWeeklyAnalytics(today)   [api/analytics.js]
  │
  ▼  GET /analytics/weekly?date=2026-05-16
  │
  ▼
routers/analytics.py
  ├── Calculates Monday of that week
  ├── For each of the 7 days:
  │     queries daily_entries + daily_task_entries
  │     builds habit_scores[] per habit
  │     calculates percentage
  └── Returns { days[], habits[], todos[], summary{} }
  │     each day includes habit_scores[] and task_scores[]
  │
  ▼
React renders heatmap table + summary cards
```

---

## Database Schema

```
habits                      scoring_rules
──────────────────          ─────────────────────────
id            PK            id            PK
name                        habit_id      FK → habits.id
max_points                  condition     lte|gte|lt|gt|eq
scoring_type                value         "06:30" or "45"
display_order               percentage    0–100
is_active                   rule_order


daily_entries                           todos
─────────────────────────────           ─────────────────────────
id              PK                      id            PK
entry_date      DATE                    title
habit_id        FK → habits.id          description
start_time      TIME (nullable)         max_points
end_time        TIME (nullable)         status        pending|done|skipped
duration_minutes INT (nullable)         created_at
earned_points   NUMERIC(6,2)
UNIQUE(entry_date, habit_id)            daily_task_entries
                                        ─────────────────────────────
                                        id              PK
                                        entry_date      DATE
                                        todo_id         FK → todos.id
                                        start_time      TIME (nullable)
                                        end_time        TIME (nullable)
                                        duration_minutes INT (nullable)
                                        earned_points   NUMERIC(6,2)
                                        UNIQUE(entry_date, todo_id)
```

---

## Scoring System Explained

Each habit has a `scoring_type` that determines how `earned_points` is calculated from the logged data:

| Type                | Input used      | How score is determined                                     |
|---------------------|-----------------|-------------------------------------------------------------|
| `boolean`           | any field       | Logged = 100% of max_points; not logged = 0                 |
| `time_of_day`       | `start_time`    | Step rules: first matching condition → that rule's %        |
| `time_of_day_linear`| `start_time`    | Breakpoints sorted by time → linear interpolation           |
| `duration`          | `duration_mins` | Step rules: first matching condition → that rule's %        |
| `duration_linear`   | `duration_mins` | Breakpoints sorted by minutes → linear interpolation        |

**Linear interpolation example** (wakeup habit, 30 max points):

```
Breakpoints:  05:00 → 100%,  06:00 → 80%,  08:00 → 0%
Wakeup at 06:30:
  → between 06:00 (80%) and 08:00 (0%)
  → 06:30 is 25% of the way from 06:00 to 08:00
  → earned % = 80% - 25% * 80% = 60%
  → earned points = 60% of 30 = 18 pts
```

Values outside the defined range clamp to the nearest breakpoint.

---

## Environment & Config

### Backend `.env`

```
DATABASE_URL=postgresql://user:password@localhost:5432/discipline_tracker
JWT_SECRET=<random 32-byte hex string>
AUTH_PASSWORD_HASH=<bcrypt hash of your password>
```

`JWT_SECRET` signs the JWT. `AUTH_PASSWORD_HASH` is the bcrypt hash of the login password — never stored in the database, only in the environment.

Generate the values:
```bash
# password hash:
python -c "import bcrypt; print(bcrypt.hashpw(b'YOUR_PASSWORD', bcrypt.gensalt()).decode())"
# JWT secret:
python -c "import secrets; print(secrets.token_hex(32))"
```

`load_dotenv()` is called at the top of `main.py` before any router is imported, ensuring all `os.getenv()` calls in `auth.py` and `dependencies.py` pick up the values.

> **On Render:** set `JWT_SECRET` and `AUTH_PASSWORD_HASH` in the Render **Environment** tab. Render injects them as real process env vars — no `.env` file needed.

### Frontend `.env`

```
VITE_API_URL=http://localhost:8000
```

In production, `VITE_API_URL` points to the deployed backend. The frontend is a static build (no server needed) and can be deployed on **Vercel**. The backend can run on **Render** (Docker) or a self-managed **Oracle Cloud Free VM**. The database is either a managed PostgreSQL service such as **Supabase** or a self-hosted PostgreSQL instance on the VM.

### Auto-docs

Once the backend is running, visit:
- `http://localhost:8000/docs` — Swagger UI (interactive)
- `http://localhost:8000/redoc` — ReDoc (read-friendly)

All endpoints, request bodies, and response shapes are automatically documented from the code.
