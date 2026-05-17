# NOC Monitor — GitHub & VPS Deployment Tutorial

This tutorial walks you through pushing the project to GitHub and deploying it on a fresh VPS from zero.

---

## Quick Start — One Command Install

Once the code is on your VPS (via git clone or extracted zip), run:

```bash
sudo bash install.sh
```

Or pass your GitHub repo URL directly so it clones automatically:

```bash
sudo bash install.sh https://github.com/XIGNCODE-HYDRA/NOC.git
```

The script will ask for a DB password and domain name, then handle everything else automatically — Node.js, PostgreSQL, app build, Nginx, SSL, firewall, systemd service.

---

## Part 1 — Push to GitHub

### 1.1 Create a GitHub Repository

1. Go to [github.com](https://github.com) and sign in.
2. Click **+** → **New repository**.
3. Set:
   - **Repository name:** `noc-monitor` (or any name you like)
   - **Visibility:** Private (recommended — contains your config)
   - **DO NOT** add README, .gitignore, or license (the project already has them)
4. Click **Create repository**.

### 1.2 Push from Your Machine (or Replit Shell)

Copy the commands GitHub shows you after creating the repo, or use these:

```bash
cd /path/to/noc-monitor          # folder where you have the project

git init                          # skip if already a git repo
git add .
git commit -m "Initial commit — NOC Monitor"
git branch -M main
git remote add origin https://github.com/XIGNCODE-HYDRA/NOC.git
git push -u origin main
```

> If you are pushing from **Replit**, open the Shell tab and run the commands above. Use a GitHub **Personal Access Token** (PAT) as your password when prompted — never your GitHub password.

### 1.3 Create a Personal Access Token (PAT)

1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic).
2. Click **Generate new token (classic)**.
3. Select scope: **repo** (full control of private repos).
4. Copy the token — you'll use it as the password when running `git push`.

---

## Part 2 — First-Time VPS Deployment

### 2.1 Connect to your VPS

```bash
ssh ubuntu@YOUR_VPS_IP
# or: ssh root@YOUR_VPS_IP
```

### 2.2 Run the One-Command Installer

**Option A — let the script clone for you (easiest):**

```bash
# Download install.sh and run it, passing your repo URL
curl -fsSL https://raw.githubusercontent.com/XIGNCODE-HYDRA/NOC/main/install.sh \
  -o /tmp/install.sh
sudo bash /tmp/install.sh https://github.com/XIGNCODE-HYDRA/NOC.git
```

**Option B — clone first, then install:**

```bash
# Clone the repo (use your PAT as the password if it's private)
git clone https://github.com/XIGNCODE-HYDRA/NOC.git /opt/noc-dashboard

# Run the installer
sudo bash /opt/noc-dashboard/install.sh
```

**Option C — extracted from the zip:**

```bash
# Upload noc-monitor.zip to your VPS, then:
unzip noc-monitor.zip -d /opt/noc-dashboard
sudo bash /opt/noc-dashboard/install.sh
```

The installer will ask you for:
1. **DB password** — or press Enter to auto-generate one
2. **Domain/IP** — your domain (for Nginx + SSL) or your VPS IP

It then installs Node.js, PostgreSQL, builds the app, configures Nginx, gets an SSL certificate, sets up the systemd service, and enables the firewall — all automatically.

### 2.3 Post-Deploy Checklist

After the script finishes:

- [ ] Open `http://YOUR_VPS_IP` in your browser
- [ ] Log in with `admin` / `admin123`
- [ ] Go to **Settings → Change Password** and change the admin password
- [ ] Add your MikroTik routers under **Devices**
- [ ] Create **Support** accounts for your team under **Settings → Support Accounts**

---

## Part 3 — Updating the App on VPS

Whenever you push new code to GitHub, deploy it to the VPS:

```bash
ssh ubuntu@YOUR_VPS_IP
cd /opt/noc-dashboard
git pull
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
BASE_PATH="/" pnpm --filter @workspace/noc-dashboard run build
export $(grep -v '^#' .env.production | xargs)
pnpm --filter @workspace/db run push   # only needed if DB schema changed
sudo systemctl restart noc-api
echo "Done!"
```

Or use the included update script:

```bash
cd /opt/noc-dashboard && sudo bash update.sh
```

---

## Part 4 — Editing the Project Locally

### 4.1 Prerequisites

Install on your local machine:
- [Node.js 20+](https://nodejs.org/) or use [nvm](https://github.com/nvm-sh/nvm)
- [pnpm](https://pnpm.io/installation): `npm install -g pnpm`
- [PostgreSQL](https://www.postgresql.org/download/) (local instance for development)

### 4.2 Clone and Install

```bash
git clone https://github.com/XIGNCODE-HYDRA/NOC.git
cd noc-monitor
pnpm install
```

### 4.3 Create Local Environment File

```bash
cp .env.example .env          # if .env.example exists, otherwise:
cat > .env <<EOF
DATABASE_URL=postgresql://postgres:password@localhost:5432/noc_dev
SESSION_SECRET=dev_secret_change_in_production_min_32_chars_long
NODE_ENV=development
EOF
```

### 4.4 Initialize the Database

```bash
pnpm --filter @workspace/db run push
```

### 4.5 Start Development Servers

Open two terminals:

**Terminal 1 — API Server:**
```bash
pnpm --filter @workspace/api-server run dev
# Runs on http://localhost:8080
```

**Terminal 2 — Frontend:**
```bash
pnpm --filter @workspace/noc-dashboard run dev
# Runs on http://localhost:XXXX (check output for port)
```

### 4.6 Where to Edit Things

| What to change | File location |
|----------------|---------------|
| Dashboard page | `artifacts/noc-dashboard/src/pages/dashboard.tsx` |
| Navigation/layout | `artifacts/noc-dashboard/src/components/layout.tsx` |
| Settings page | `artifacts/noc-dashboard/src/pages/settings.tsx` |
| Login page | `artifacts/noc-dashboard/src/pages/login.tsx` |
| API routes | `artifacts/api-server/src/routes/` |
| MikroTik polling | `artifacts/api-server/src/lib/mikrotik.ts` |
| Bandwidth polling | `artifacts/api-server/src/lib/bandwidth.ts` |
| Database schema | `lib/db/src/schema/` |
| API contract | `lib/api-spec/openapi.yaml` |
| Global styles | `artifacts/noc-dashboard/src/index.css` |

### 4.7 After Changing the API Contract

If you edit `lib/api-spec/openapi.yaml`, regenerate the client hooks and Zod validators:

```bash
pnpm --filter @workspace/api-spec run codegen
```

### 4.8 After Changing the Database Schema

```bash
pnpm --filter @workspace/db run push
```

---

## Part 5 — Auto-Deploy with GitHub Actions

### 5.1 Add SSH Key to VPS

On your **local machine**:

```bash
ssh-keygen -t ed25519 -C "github-actions-noc" -f ~/.ssh/github_actions_noc
cat ~/.ssh/github_actions_noc.pub
```

On your **VPS**:

```bash
echo "PASTE_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### 5.2 Add Secrets to GitHub

Go to your repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret name | Value |
|------------|-------|
| `VPS_HOST` | Your VPS IP or domain (`123.45.67.89`) |
| `VPS_USER` | SSH username (`ubuntu` or `root`) |
| `VPS_SSH_KEY` | Contents of `~/.ssh/github_actions_noc` (private key) |

### 5.3 Create the Workflow File

In your project, create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to VPS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/noc-dashboard
            git pull
            pnpm install --frozen-lockfile
            pnpm --filter @workspace/api-server run build
            BASE_PATH="/" pnpm --filter @workspace/noc-dashboard run build
            export $(grep -v '^#' .env.production | xargs)
            pnpm --filter @workspace/db run push
            sudo systemctl restart noc-api
            echo "Deploy complete at $(date)"
```

Commit and push this file. Every `git push` to `main` will now automatically deploy to your VPS.

---

## Quick Reference

```
Project layout:
├── artifacts/
│   ├── api-server/          ← Express API (Node.js)
│   └── noc-dashboard/       ← React frontend (Vite)
├── lib/
│   ├── api-spec/            ← OpenAPI contract + codegen config
│   ├── api-client-react/    ← Generated React Query hooks
│   ├── api-zod/             ← Generated Zod validators
│   └── db/                  ← Drizzle ORM schema + migrations
├── deploy.sh                ← One-shot VPS deploy script
├── update.sh                ← Update existing VPS deployment
└── VPS_HOSTING_GUIDE.md     ← Detailed hosting reference
```
