# Deploying VPMS

One app, two environments, same VM:

| Environment | Branch    | Directory on VM             | Port |
|-------------|-----------|------------------------------|------|
| Production  | `main`    | `~/apps/vpms-production`     | 9010 |
| Staging     | `staging` | `~/apps/vpms-staging`        | 9020 |

Pushing to `staging` deploys to staging; merging to `main` deploys to production. Each is
a separate git checkout, separate `.env`, separate Docker Compose project (containers,
volumes, network) — they don't share a database or interfere with each other, they just
happen to live on the same box. There's one app (staff and vendor UI are both part of the
same build — see the note in the earlier discussion), not one-per-environment-per-audience.

---

## 1. One-time VM setup

SSH into the Bharat Cloud VM as whichever user will run deploys, then:

```bash
# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# log out and back in for the group change to apply

# Deploy key — add the public key Claude gave you to this user's authorized_keys
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGSsXkpbzNd1RZNd0HraMItPSR3nFYIikWh+l2RboUPM github-actions-deploy@vpms" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

mkdir -p ~/apps
```

Open **9010** and **9020** (TCP, inbound) in Bharat Cloud's firewall/security-group console
for this VM.

### Clone both checkouts

Once your GitHub repo exists (step 2 below) and has a `staging` branch:

```bash
cd ~/apps
git clone -b main    <your-repo-url> vpms-production
git clone -b staging <your-repo-url> vpms-staging
```

### Configure each environment

```bash
cd ~/apps/vpms-production
cp .env.example .env
nano .env   # set DB_PASSWORD, JWT_SECRET_KEY (see generation commands in .env.example), APP_PORT=9010
chmod +x deploy.sh

cd ~/apps/vpms-staging
cp .env.example .env
nano .env   # DIFFERENT DB_PASSWORD and JWT_SECRET_KEY from production, APP_PORT=9020
chmod +x deploy.sh
```

Use **different** secrets in each `.env` — staging and production should never share a
database password or JWT signing key.

### First manual deploy (before wiring up Actions)

```bash
cd ~/apps/vpms-production && ./deploy.sh
cd ~/apps/vpms-staging    && ./deploy.sh
```

Confirm both come up: `curl http://localhost:9010/health` and `curl http://localhost:9020/health`
should each return `{"status":"ok"}`.

**The database starts empty on both** — no seeded test accounts. See "First admin user"
below before you can log in.

---

## 2. GitHub repo setup

```bash
cd "D:\Vasu\JHS Projects\Vendor Management System - v2"
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <your-new-repo-url>
git push -u origin main
git checkout -b staging
git push -u origin staging
git checkout main
```

Then in the GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**,
add:

- `SSH_HOST` — the VM's IP address
- `SSH_USER` — the VM user you set the deploy key up for
- `SSH_PRIVATE_KEY` — full contents of the private key file Claude sent you (the whole
  `-----BEGIN...-----`/`-----END...-----` block)
- `SSH_PORT` — only if the VM's SSH runs on something other than 22

That's the whole CI/CD setup — `.github/workflows/deploy-production.yml` and
`deploy-staging.yml` are already in the repo and pick these secrets up automatically.

From here: push to `staging` → GitHub Actions SSHes in and runs `deploy.sh` in
`~/apps/vpms-staging`. Merge `staging` into `main` → same thing in `~/apps/vpms-production`.
Both are also runnable on-demand from the Actions tab (`workflow_dispatch`) without a new
commit.

---

## 3. First admin user

Neither database is seeded with any user — you need one real System Admin account before
anyone can log in. This isn't automated yet; for now, generate a bcrypt hash and insert it
directly:

```bash
cd ~/apps/vpms-production
docker compose exec app python -c "
from passlib.hash import bcrypt
print(bcrypt.hash('YOUR_REAL_PASSWORD_HERE'))
"
```

Then, using that hash:

```bash
docker compose exec db psql -U vpms -d vpms -c "
INSERT INTO users (id, name, email, hashed_password, role_id, is_active, session_version)
SELECT gen_random_uuid(), 'Admin', 'you@yourcompany.com', 'PASTE_THE_HASH_HERE', id, true, 0
FROM roles WHERE name = 'System Admin';
"
```

Repeat for staging with its own password if you want to log into staging too. Change the
email/password to real values — don't reuse the `password123` test credentials from
development anywhere near a real deployment.

---

## 4. Later: domain + subdomains

When you have a domain, put nginx (or Caddy) in front of both ports, terminate HTTPS there
(Let's Encrypt), and route by hostname — e.g. `app.yourcompany.com` and
`vendors.yourcompany.com` both proxying to `localhost:9010`, with the vendor vhost
rewriting `/` to `/vendor-login` so vendors land on the right screen. No changes to the
app or containers needed for this — it's purely an nginx config addition in front of what
you already have.
