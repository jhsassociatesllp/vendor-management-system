# Deploying VPMS

One app, two environments, same VM, managed through aaPanel:

| Environment | Branch    | Directory on VM             | Port |
|-------------|-----------|------------------------------|------|
| Production  | `main`    | `~/apps/vpms-production`     | 8020 |
| Staging     | `staging` | `~/apps/vpms-staging`        | 8010 |

Pushing to `staging` deploys to staging; merging to `main` deploys to production. Each is
a separate git checkout, separate `.env`, separate Docker Compose project (containers,
volumes, network) — they don't share a database or interfere with each other, they just
happen to live on the same box. There's one app (staff and vendor UI are both part of the
same build), not one deployment per audience.

aaPanel's role here is the VM's management layer: it gives you a browser UI over the
Docker containers GitHub Actions deploys, and later (once you have a domain) handles the
reverse proxy and SSL cert in front of the app ports. It doesn't replace anything below —
GitHub Actions still does the actual deploying via SSH, exactly as before.

---

## 1. Install aaPanel on the VM

SSH into the Bharat Cloud VM and run aaPanel's official installer:

```bash
# Ubuntu/Debian
curl -sSO https://io.aapanel.com/install.sh && sudo bash install.sh
```

It'll print a panel URL (`http://<VM_IP>:<random-port>`), username, and password at the
end — save those. Note the port it picked (aaPanel calls this the "panel port"); you'll
need to allow that too, alongside 8020/8010, in the next step.

**Open in Bharat Cloud's firewall/security-group console** (TCP, inbound): the aaPanel
panel port, plus **8020** and **8010**, plus your SSH port.

**Also open the same ports in aaPanel's own firewall** — it runs its own iptables rules on
top of the cloud provider's security group, so both need the port or traffic still won't
get through. In the aaPanel UI: Security → Firewall → Add Port Rule, for 8020 and 8010
(TCP).

## 2. Install Docker via aaPanel

aaPanel's App Store has a Docker plugin that installs and manages Docker for you (so you
don't need to install Docker manually via `get.docker.com` — either works, but since
aaPanel's UI expects to own the Docker installation for its container-management screens
to work smoothly, use its App Store: App Store → search "Docker" → Install).

Confirm it worked from the SSH session too:
```bash
docker --version
docker compose version
sudo usermod -aG docker $USER   # log out/in after this if you added yourself
```

## 3. Deploy key + directories

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGSsXkpbzNd1RZNd0HraMItPSR3nFYIikWh+l2RboUPM github-actions-deploy@vpms" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

mkdir -p ~/apps
```

## 4. Clone both checkouts

Once your GitHub repo exists and has a `staging` branch:

```bash
cd ~/apps
git clone -b main    <your-repo-url> vpms-production
git clone -b staging <your-repo-url> vpms-staging
```

### Configure each environment

```bash
cd ~/apps/vpms-production
cp .env.example .env
nano .env   # DB_PASSWORD, JWT_SECRET_KEY (generation commands are in .env.example), APP_PORT=8020
chmod +x deploy.sh

cd ~/apps/vpms-staging
cp .env.example .env
nano .env   # DIFFERENT DB_PASSWORD and JWT_SECRET_KEY from production, APP_PORT=8010
chmod +x deploy.sh
```

Use **different** secrets in each `.env` — staging and production should never share a
database password or JWT signing key.

### First manual deploy (before wiring up Actions)

```bash
cd ~/apps/vpms-production && ./deploy.sh
cd ~/apps/vpms-staging    && ./deploy.sh
```

Confirm both come up: `curl http://localhost:8020/health` and `curl http://localhost:8010/health`
should each return `{"status":"ok"}`.

**The database starts empty on both** — no seeded test accounts. See "First admin user"
below before you can log in.

### See it in aaPanel

Docker plugin → Compose (or "Container Manage" / "Compose Manage", depending on your
version) → Import, pointing at `~/apps/vpms-production/docker-compose.yml` (and the
staging one separately). This just gives you a UI over the same containers/logs/restart
controls — it doesn't change how they got deployed.

---

## 5. GitHub repo setup

```bash
cd "D:\Vasu\JHS Projects\Vendor Management System - v2"
git remote add origin <your-new-repo-url>
git push -u origin main
git push -u origin staging
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

## 6. First admin user

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

## 7. Later: domain + subdomains via aaPanel

When you have a domain, aaPanel's Website manager does the reverse proxy + SSL work you'd
otherwise hand-write in nginx:

1. Website → Add Site, for `app.yourcompany.com`, no PHP/static root needed.
2. On that site, add a **Reverse Proxy** rule → target `http://127.0.0.1:8020`.
3. SSL tab → Let's Encrypt → issue a free cert for it. aaPanel handles renewal.
4. Repeat for `vendors.yourcompany.com`, also proxying to `127.0.0.1:8020` (same app,
   same port — see the earlier note on why staff and vendor traffic don't need separate
   ports). If you want vendors to land on the vendor login instead of the staff dashboard
   redirect, add a rewrite rule on that site's config rewriting `/` → `/vendor-login`.
5. Same pattern again for a staging subdomain (e.g. `staging.yourcompany.com`) pointing at
   `127.0.0.1:8010`, if you want staging reachable by domain too.

No changes to the app or containers needed for any of this.
