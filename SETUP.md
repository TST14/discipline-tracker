# Discipline Tracker — Setup Guide

Full stack: **React + Vite** (frontend) · **FastAPI** (backend) · **PostgreSQL** (database)

---

## Choose your setup path

| I want to… | Go to |
|---|---|
| Run it on my own laptop / desktop | [Part 1 — Local Setup](#part-1--local-setup) |
| Deploy it online (Vercel + Render) | [Part 2A — Cloud: Vercel + Render](#part-2a--cloud-vercel--render-easiest) |
| Deploy it online (Vercel + Oracle Cloud VM) | [Part 2B — Cloud: Vercel + Oracle Cloud VM](#part-2b--cloud-vercel--oracle-cloud-free-vm) |

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

## Part 2A — Cloud: Vercel + Render (easiest)

This option keeps everything free and requires no server management. Render hosts the backend, Render PostgreSQL hosts the database, and Vercel hosts the frontend.

**Free tier limits to know:**
- Render free web services spin down after 15 min of inactivity (first request after idle takes ~30 sec)
- Render free PostgreSQL expires after **90 days** — you must back up and recreate it
- Vercel free tier is generous with no notable limits for personal apps

---

### Step 1 — Create the database on Render

1. Go to https://dashboard.render.com → **New → PostgreSQL**
2. Fill in:
   - **Name**: `discipline-db`
   - **Region**: closest to you
   - **Plan**: Free
3. Click **Create Database**
4. Once created, copy the **Internal Database URL** (used in Step 2) and the **External Database URL** (used if you want to connect from your laptop)

---

### Step 2 — Deploy the backend on Render

1. Go to https://dashboard.render.com → **New → Web Service**
2. Connect your GitHub account and select the `discipline-tracker` repo
3. Configure:
   - **Name**: `discipline-tracker-api`
   - **Root Directory**: `backend`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Under **Environment Variables**, add:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | *(paste the Internal Database URL from Step 1)* |
   | `DEBUG` | `false` |
   | `ALLOWED_ORIGINS` | `https://your-app.vercel.app` *(fill in after Step 3)* |

5. Click **Create Web Service**
6. Wait for the deploy to finish. Copy your service URL (e.g. `https://discipline-tracker-api.onrender.com`)

> **ALLOWED_ORIGINS**: You'll update this after you get the Vercel URL. For the first deploy, set it to `*` temporarily, then tighten it once you have the real URL.

---

### Step 3 — Deploy the frontend on Vercel

1. Go to https://vercel.com → **Add New → Project**
2. Import your `discipline-tracker` GitHub repo
3. Configure:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite (auto-detected)
4. Under **Environment Variables**, add:

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://discipline-tracker-api.onrender.com` *(your Render URL from Step 2)* |

5. Click **Deploy**
6. Copy your Vercel URL (e.g. `https://discipline-tracker-abc123.vercel.app`)

---

### Step 4 — Update CORS on Render

1. Go back to your Render web service → **Environment**
2. Update `ALLOWED_ORIGINS` to your actual Vercel URL:
   ```
   https://discipline-tracker-abc123.vercel.app
   ```
3. Render will automatically redeploy

---

### Step 5 — Verify

1. Open your Vercel URL in a browser
2. Go to **Configure**, add a habit — if it saves, everything is wired up correctly
3. Check backend health: `https://discipline-tracker-api.onrender.com/health`

---

## Part 2B — Cloud: Vercel + Oracle Cloud Free VM

This option gives you a permanent free server with no spin-down and no 90-day database expiry. Oracle Cloud's Always Free tier includes a powerful ARM VM (4 OCPU, 24 GB RAM) that you fully control.

**What you get for free, forever:**
- 2 AMD VMs (1 OCPU, 1 GB RAM each) **or** up to 4 ARM Ampere A1 OCPUs + 24 GB RAM
- 200 GB block storage
- No credit card required after signup (free tier is truly free)

---

### Step 1 — Create an Oracle Cloud account

1. Go to https://cloud.oracle.com → **Start for Free**
2. Sign up — you will need a credit card for identity verification but will **not** be charged
3. Choose a Home Region (cannot be changed later — pick closest to you)

---

### Step 2 — Create a free VM instance

1. In the Oracle Console → **Compute → Instances → Create Instance**
2. Configure:
   - **Name**: `discipline-server`
   - **Image**: Ubuntu 22.04 (change from Oracle Linux)
   - **Shape**: Click **Change Shape** → **Ampere** → `VM.Standard.A1.Flex`
     - OCPUs: `2`, Memory: `12 GB` (stays within free tier)
   - **Networking**: Accept defaults (a new VCN will be created)
   - **SSH Keys**: Download or paste your public key — **save the private key, you need it to connect**
3. Click **Create**
4. Wait ~2 min for the instance to be **Running**
5. Copy the **Public IP address**

---

### Step 3 — Open firewall ports on Oracle Cloud

Oracle Cloud has two layers of firewall you must open:

**Layer 1 — Security List (Oracle side):**
1. Go to **Networking → Virtual Cloud Networks → your VCN → Security Lists → Default Security List**
2. Click **Add Ingress Rules**, add these two:
   - Source: `0.0.0.0/0`, Protocol: TCP, Port: `8000` (FastAPI)
   - Source: `0.0.0.0/0`, Protocol: TCP, Port: `443` (HTTPS, for later)

**Layer 2 — Ubuntu firewall (inside the VM):**
```bash
sudo iptables -I INPUT -p tcp --dport 8000 -j ACCEPT
sudo netfilter-persistent save
```

---

### Step 4 — Connect to the VM and install dependencies

```bash
ssh -i /path/to/your-private-key.pem ubuntu@<YOUR_VM_PUBLIC_IP>
```

Once connected:
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Python, pip, git, PostgreSQL
sudo apt install -y python3 python3-pip python3-venv git postgresql postgresql-contrib

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

---

### Step 5 — Create the PostgreSQL database

```bash
# Switch to postgres user
sudo -i -u postgres

# Create the database user and database
psql -c "CREATE USER tracker WITH PASSWORD 'your_strong_password_here';"
psql -c "CREATE DATABASE discipline_tracker OWNER tracker;"
psql -c "GRANT ALL PRIVILEGES ON DATABASE discipline_tracker TO tracker;"

# Exit postgres user
exit
```

> Replace `your_strong_password_here` with a strong password. Record it — you'll use it in the next step.

---

### Step 6 — Clone the repo and set up the backend

```bash
# Clone
git clone https://github.com/TST14/discipline-tracker.git
cd discipline-tracker/backend

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env
cp .env.example .env
nano .env
```

Edit `.env` with your values:
```
DATABASE_URL=postgresql://tracker:your_strong_password_here@localhost:5432/discipline_tracker
DEBUG=false
ALLOWED_ORIGINS=https://your-app.vercel.app
```

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X` in nano).

**Run migrations:**
```bash
alembic upgrade head
```

---

### Step 7 — Run the backend as a systemd service

This keeps the API running permanently and auto-restarts on reboot.

```bash
# Get the full path to your uvicorn
which uvicorn  # or: .venv/bin/uvicorn

# Create the service file
sudo nano /etc/systemd/system/discipline-api.service
```

Paste this (adjust paths to match your username and repo location):
```ini
[Unit]
Description=Discipline Tracker FastAPI
After=network.target postgresql.service

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/discipline-tracker/backend
Environment="PATH=/home/ubuntu/discipline-tracker/backend/.venv/bin"
EnvironmentFile=/home/ubuntu/discipline-tracker/backend/.env
ExecStart=/home/ubuntu/discipline-tracker/backend/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable discipline-api
sudo systemctl start discipline-api

# Check it's running
sudo systemctl status discipline-api
```

Verify from outside: `http://<YOUR_VM_PUBLIC_IP>:8000/health`

---

### Step 8 — Deploy the frontend on Vercel

1. Go to https://vercel.com → **Add New → Project**
2. Import your `discipline-tracker` GitHub repo
3. Configure:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite
4. Under **Environment Variables**:

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `http://<YOUR_VM_PUBLIC_IP>:8000` |

5. Click **Deploy**
6. Copy your Vercel URL

---

### Step 9 — Update CORS on the VM

SSH back into the VM and update the `ALLOWED_ORIGINS` in `.env`:
```bash
nano ~/discipline-tracker/backend/.env
```
Change:
```
ALLOWED_ORIGINS=https://your-actual-vercel-url.vercel.app
```

Restart the service:
```bash
sudo systemctl restart discipline-api
```

---

### Step 9 (optional) — Set up a domain + HTTPS

If you have a domain name, you can use Caddy as a reverse proxy to serve the API over HTTPS:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy

sudo nano /etc/caddy/Caddyfile
```

Paste:
```
api.yourdomain.com {
    reverse_proxy localhost:8000
}
```

```bash
sudo systemctl restart caddy
```

Then update `VITE_API_URL` in Vercel to `https://api.yourdomain.com` and update `ALLOWED_ORIGINS` on the VM accordingly.

---

## Future deploys (pulling updates)

Whenever you push changes to GitHub:

**Render:** redeploys automatically on every push to `main`.

**Oracle Cloud VM:**
```bash
ssh ubuntu@<YOUR_VM_PUBLIC_IP>
cd ~/discipline-tracker
git pull
cd backend
source .venv/bin/activate
pip install -r requirements.txt     # only if requirements changed
alembic upgrade head                # only if models changed
sudo systemctl restart discipline-api
```

**Vercel:** redeploys automatically on every push to `main`.

---

## Troubleshooting

**`npm install` fails with auth error**
```powershell
npm config delete //registry.npmjs.org/:_authToken
npm install
```

**Backend can't find `.env`**  
The `.env` file must be inside the `backend/` folder, not the repo root. Copy from `.env.example`.

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

**Render API is slow on first request**  
Free tier spins down after 15 min of inactivity. The first request after idle takes ~30 seconds to wake up. This is normal — upgrade to a paid plan to eliminate it.

**Oracle VM: connection refused on port 8000**  
Check both firewall layers: Oracle Security List (ingress rule for TCP 8000) and Ubuntu `iptables` (see Step 3). Also verify the service is running: `sudo systemctl status discipline-api`.

**CORS error in browser console**  
The `ALLOWED_ORIGINS` env var on the backend must exactly match your frontend URL — no trailing slash, correct protocol (`https://` not `http://`). After changing it, restart the backend service.

**Alembic migration fails on first run**  
If you previously ran the app without Alembic (tables already exist), run:
```bash
alembic stamp head
```
This tells Alembic the current state is already applied without re-running the migration.


---

## Step 1 — Clone the Repository

```bash
git clone https://github.com/TST14/discipline-tracker.git
cd discipline-tracker
```

---

## Step 2 — Start PostgreSQL (via Docker)

> Docker Desktop must be running before this step.

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

Verify it's ready:
```bash
docker exec discipline-pg pg_isready -U tracker
# Expected: /var/run/postgresql:5432 - accepting connections
```

---

## Step 3 — Backend Setup

```bash
cd backend
```

### 3a. Create Python virtual environment

**Mac / Linux:**
```bash
python3 -m venv .venv
source .venv/bin/activate
```

**Windows PowerShell:**
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### 3b. Install dependencies

```bash
pip install -r requirements.txt
```

### 3c. Create `.env` file

```bash
cp .env.example .env
```

The default `.env` matches the Docker container from Step 2 — no changes needed for local dev:
```
DATABASE_URL=postgresql://tracker:tracker123@localhost:5432/discipline_tracker
```

> For Oracle Cloud or another server, replace with your actual connection string.

### 3d. Run the backend

**Mac / Linux:**
```bash
uvicorn main:app --reload --port 8000
```

**Windows PowerShell** (from repo root):
```powershell
$env:PATH = "c:\path\to\discipline-tracker\backend\.venv\Scripts;$env:PATH"
uvicorn main:app --reload --port 8000 --app-dir "c:\path\to\discipline-tracker\backend"
```

> Replace `c:\path\to\discipline-tracker` with your actual path.

**DB tables are created automatically on first run.**

Verify at: http://localhost:8000/health → should return `{"status": "ok"}`  
API docs: http://localhost:8000/docs

---

## Step 4 — Frontend Setup

Open a **new terminal** from the repo root:

```bash
cd frontend
```

### 4a. Install dependencies

```bash
npm install
```

### 4b. Create `.env` file

```bash
cp .env.example .env
```

Contents (points to local backend):
```
VITE_API_URL=http://localhost:8000
```

> For production (after deploying backend to Oracle/Render), update this to your server URL.

### 4c. Run the frontend

```bash
npm run dev
```

App opens at: **http://localhost:3000**

---

## Step 5 — First-Time App Setup

1. Open **http://localhost:3000**
2. Go to the **Configure** tab
3. Add your habits with max points and scoring type:

| Habit | Max Points | Scoring Type |
|---|---|---|
| Wakeup | 30 | Time of Day |
| Meditation | 80 | Duration |
| Running | 50 | Duration |
| Gym | 50 | Duration |
| Books | 40 | Duration |
| Brush | 10 | Boolean |

4. Click **Rules** on each habit to set up scoring thresholds

**Example — Wakeup (Time of Day):**
| Condition | Value | % |
|---|---|---|
| ≤ | 04:00 | 100 |
| ≤ | 05:00 | 75 |
| ≤ | 06:00 | 50 |
| > | 08:00 | 0 |

**Example — Meditation (Duration):**
| Condition | Value | % |
|---|---|---|
| ≥ | 45 | 100 |
| ≥ | 20 | 50 |
| < | 20 | 0 |

5. Switch to **Today** tab and start logging!

---

## Restart After Reboot

Every time you restart your machine:

```bash
# Start the database
docker start discipline-pg

# Start backend (Terminal 1)
# Mac/Linux:
cd backend && source .venv/bin/activate && uvicorn main:app --reload --port 8000

# Windows PowerShell:
$env:PATH = "c:\path\to\backend\.venv\Scripts;$env:PATH"
uvicorn main:app --reload --port 8000 --app-dir "c:\path\to\backend"

# Start frontend (Terminal 2)
cd frontend && npm run dev
```

---

## Deployment (Coming Next)

| Layer | Platform | Notes |
|---|---|---|
| **Frontend** | Vercel (free) | Connect GitHub repo, set `VITE_API_URL` env var |
| **Backend + DB** | Oracle Cloud Free VM | Ubuntu VM, run FastAPI + PostgreSQL |

See **DEPLOY.md** (created during deployment setup) for step-by-step instructions.

---

## Project Structure

```
discipline-tracker/
├── frontend/                  ← React + Vite + Tailwind
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api/client.js      ← All API calls
│   │   └── components/
│   │       ├── DailyTracker.jsx   ← Daily habit log
│   │       └── HabitConfig.jsx    ← Habits + scoring rules editor
│   ├── .env.example
│   └── package.json
│
├── backend/                   ← Python FastAPI
│   ├── main.py                ← App entry point + CORS
│   ├── models.py              ← DB table definitions
│   ├── schemas.py             ← Request/response validation
│   ├── scoring.py             ← Dynamic points engine
│   ├── database.py            ← DB connection
│   ├── routers/
│   │   ├── habits.py          ← Habit + rules CRUD
│   │   └── entries.py         ← Daily entries + summary
│   ├── .env.example
│   └── requirements.txt
│
├── .gitignore
└── SETUP.md                   ← This file
```

---

## Troubleshooting

**`npm install` fails with auth error**
```powershell
npm config delete //registry.npmjs.org/:_authToken
npm install
```

**Backend can't find `.env`**  
Make sure `.env` exists in the `backend/` folder (not the root). Copy from `.env.example`.

**PostgreSQL connection refused**  
```bash
docker start discipline-pg
docker exec discipline-pg pg_isready -U tracker
```

**Port 8000 or 3000 already in use**  
```powershell
# Find and kill the process using the port
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```
