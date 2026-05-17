# Discipline Tracker — Setup Guide

Full stack: **React + Vite** (frontend) · **FastAPI** (backend) · **PostgreSQL** (database)

---

## Choose your setup path

| I want to… | Go to |
|---|---|
| Run it on my own laptop / desktop | [Part 1 — Local Setup](#part-1--local-setup) |
| Deploy it online for free | [Part 2 — Cloud: Vercel + Render + Neon](#part-2--cloud-vercel--render--neon) |

---

## Part 1 — Local Setup

### Prerequisites

| Tool | Version | Download |
|---|---|---|
| **Node.js** | v18+ | https://nodejs.org |
| **Python** | 3.10+ | https://python.org |
| **Docker Desktop** | Latest | https://docker.com/products/docker-desktop |
| **Git** | Latest | https://git-scm.com |

---

### 1. Clone the repository

```bash
git clone https://github.com/TST14/discipline-tracker.git
cd discipline-tracker
```

---

### 2. Start PostgreSQL via Docker

> Docker Desktop must be running before this step.

**Mac / Linux:**
```bash
docker run -d \
  --name discipline-pg \
  -e POSTGRES_USER=tracker \
  -e POSTGRES_PASSWORD=tracker123 \
  -e POSTGRES_DB=discipline_tracker \
  -p 5432:5432 \
  postgres:16-alpine
```

**Windows PowerShell:**
```powershell
docker run -d `
  --name discipline-pg `
  -e POSTGRES_USER=tracker `
  -e POSTGRES_PASSWORD=tracker123 `
  -e POSTGRES_DB=discipline_tracker `
  -p 5432:5432 `
  postgres:16-alpine
```

Verify it started:
```bash
docker exec discipline-pg pg_isready -U tracker
# Expected: /var/run/postgresql:5432 - accepting connections
```

---

### 3. Backend setup

```bash
cd backend
```

**Create virtual environment:**

Mac / Linux:
```bash
python3 -m venv .venv
source .venv/bin/activate
```

Windows PowerShell:
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

**Install dependencies:**
```bash
pip install -r requirements.txt
```

**Create `.env`:**
```bash
cp .env.example .env
```

The default `.env` already matches the Docker container above — no edits needed:
```
DATABASE_URL=postgresql://tracker:tracker123@localhost:5432/discipline_tracker
DEBUG=true
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

**Run database migrations:**
```bash
alembic upgrade head
```

> This creates all tables. Run it once on first setup, and again any time you pull new changes.

**Start the backend:**

Mac / Linux:
```bash
uvicorn main:app --reload --port 8000
```

Windows PowerShell (run from inside `backend/`):
```powershell
.\.venv\Scripts\uvicorn.exe main:app --reload --port 8000
```

Verify: http://localhost:8000/health → `{"status":"ok","database":"ok"}`  
Swagger UI (dev only): http://localhost:8000/docs

---

### 4. Frontend setup

Open a **new terminal** from the repo root:

```bash
cd frontend
npm install
cp .env.example .env
```

The default `.env` already points to the local backend:
```
VITE_API_URL=http://localhost:8000
```

Start the frontend:
```bash
npm run dev
```

App opens at: **http://localhost:3000**

---

### 5. First-time habit setup

1. Open http://localhost:3000 → go to **Configure** tab
2. Add habits, set max points and scoring type
3. Click **Rules** on each habit to define scoring thresholds

**Example habits to get started:**

| Habit | Max Points | Scoring Type |
|---|---|---|
| Wake up | 30 | Time of Day |
| Meditation | 80 | Duration |
| Running | 50 | Duration |
| Gym | 50 | Duration |
| Reading | 40 | Duration |
| Brush teeth | 10 | Boolean |

**Example rules — Wake up (Time of Day, lower = better):**
| Condition | Value | % |
|---|---|---|
| ≤ | 04:00 | 100 |
| ≤ | 05:00 | 75 |
| ≤ | 06:00 | 50 |
| > | 08:00 | 0 |

**Example rules — Meditation (Duration, more = better):**
| Condition | Value (mins) | % |
|---|---|---|
| ≥ | 45 | 100 |
| ≥ | 20 | 50 |
| < | 20 | 0 |

---

### Restarting after a reboot

```bash
# 1. Start the database
docker start discipline-pg

# 2. Start backend (Terminal 1)
# Mac/Linux:
cd backend && source .venv/bin/activate && uvicorn main:app --reload --port 8000
# Windows:
cd backend; .\.venv\Scripts\uvicorn.exe main:app --reload --port 8000

# 3. Start frontend (Terminal 2)
cd frontend && npm run dev
```

---

## Part 2 — Cloud: Vercel + Render + Neon

**All three are free forever. No credit card required anywhere.**

| Service | Role | Free limits |
|---|---|---|
| [Neon](https://neon.tech) | PostgreSQL database | 0.5 GB, free forever |
| [Render](https://render.com) | FastAPI backend | 750 hrs/month, spins down after 15 min idle |
| [Vercel](https://vercel.com) | React frontend (static) | Unlimited, free forever |

---

### Step 1 — Database on Neon

1. Go to https://neon.tech → **Sign up** with GitHub (no card)
2. Click **New Project**, give it any name, pick the region closest to you
3. On the project dashboard go to **Dashboard → Connection Details**
4. Select **Pooled connection** and copy the URI — it looks like:
   ```
   postgresql://user:password@ep-xxx-yyy.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
   Save this — it’s your `DATABASE_URL`.

---

### Step 2 — Backend on Render

1. Go to https://render.com → sign up with GitHub
2. **New → Web Service** → connect your `discipline-tracker` repo
3. Configure:
   - **Root Directory**: `backend`
   - **Runtime**: Docker *(Render will detect the `Dockerfile` automatically)*
   - **Instance Type**: Free
4. Under **Environment Variables** add:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | *(your Neon URI from Step 1)* |
   | `DEBUG` | `false` |
   | `ALLOWED_ORIGINS` | `https://your-app.vercel.app` *(update after Step 3)* |

5. Click **Deploy**. First build takes 2–3 minutes.
6. Once live, open the Render **Shell** tab and run the migration:
   ```bash
   alembic upgrade head
   ```
7. Copy your service URL — e.g. `https://discipline-tracker-api.onrender.com`

Verify: `https://discipline-tracker-api.onrender.com/health` → `{"status":"ok","database":"ok"}`

> **Spin-down:** Render free tier sleeps after 15 min of inactivity. The first request after sleeping takes ~30 seconds. Subsequent requests are instant.

---

### Step 3 — Frontend on Vercel

1. Go to https://vercel.com → sign up with GitHub (no card)
2. **Add New → Project** → import `discipline-tracker`
3. Set **Root Directory** to `frontend`
4. Under **Environment Variables** add:

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://discipline-tracker-api.onrender.com` *(your Render URL)* |

5. Click **Deploy**
6. Copy your Vercel URL — e.g. `https://discipline-tracker-abc.vercel.app`

> **Important:** `VITE_API_URL` is baked into the static bundle at build time. If you ever change it on Vercel, you must trigger a **Redeploy** for it to take effect.

---

### Step 4 — Wire CORS

1. Go back to Render → your web service → **Environment**
2. Update `ALLOWED_ORIGINS` to your exact Vercel URL:
   ```
   https://discipline-tracker-abc.vercel.app
   ```
   No trailing slash. Must be `https://`.
3. Render redeploys automatically.

---

### Step 5 — Verify end-to-end

1. Open your Vercel URL
2. Go to **Configure** → add a habit → it should save without errors
3. Go to **Today** → log an entry → score should update

If you see a CORS error: double-check `ALLOWED_ORIGINS` on Render matches the Vercel URL exactly.

---

## Future deploys

Both Render and Vercel redeploy automatically on every push to `main`.

If you change `models.py` (database schema), run the migration after deploy:
```bash
# In Render → your service → Shell tab
alembic upgrade head
```

---

## Troubleshooting

**`npm install` fails with auth error**
```powershell
npm config delete //registry.npmjs.org/:_authToken
npm install
```

**Backend can’t find `.env`**  
The `.env` file must be in `backend/`, not the repo root. Copy from `.env.example`.

**PostgreSQL connection refused (local)**
```bash
docker start discipline-pg
docker exec discipline-pg pg_isready -U tracker
```

**Port already in use**
```powershell
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

**Render API slow on first request**  
Free tier spins down after 15 min idle. First request takes ~30 seconds to wake. Normal behaviour.

**CORS error in browser**  
`ALLOWED_ORIGINS` on Render must exactly match your Vercel URL — no trailing slash, `https://` not `http://`. After fixing, Render will redeploy; wait for it to finish.

**Vercel still hitting `localhost:8000`**  
`VITE_API_URL` is baked in at build time. After updating it in Vercel settings, go to **Deployments → Redeploy** to rebuild with the new value.

**Alembic migration fails on first run (tables already exist)**  
If tables were created by a previous `create_all`, tell Alembic to skip the initial migration:
```bash
alembic stamp head
```
