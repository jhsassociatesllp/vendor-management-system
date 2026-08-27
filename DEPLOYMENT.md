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

## 3. Deploy key

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGSsXkpbzNd1RZNd0HraMItPSR3nFYIikWh+l2RboUPM github-actions-deploy@vpms" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

That's it for the VM side — **the workflows below bootstrap everything else themselves**:
cloning the repo into `~/apps/vpms-production` / `~/apps/vpms-staging` on their first run,
and writing each directory's `.env` from GitHub secrets if it isn't already there. There's
nothing left to clone or configure by hand.

---

## 4. GitHub repo setup

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
- `PROD_DB_PASSWORD` and `PROD_JWT_SECRET_KEY` — generate with `openssl rand -base64 24`
  and `openssl rand -base64 48` respectively
- `STAGING_DB_PASSWORD` and `STAGING_JWT_SECRET_KEY` — generate **different** values than
  production's, same commands

That's the whole setup. Push to `staging` → GitHub Actions SSHes in, clones the repo into
`~/apps/vpms-staging` if it's not there yet, writes `.env` from the two `STAGING_*` secrets
if one doesn't exist yet, then builds and starts the stack. Merge `staging` into `main` →
the same thing happens in `~/apps/vpms-production`, using the `PROD_*` secrets and port
8020. Both are also runnable on-demand from the Actions tab (`workflow_dispatch`) without a
new commit — useful for the very first deploy, so you don't have to wait for a commit to
see it work.

**If your repo is private**, the plain `https://github.com/...` clone the workflow uses
will fail with an authentication error on first run (not "repository not found" — that's
the tell). Tell me if you hit that; it needs a second, read-only deploy key on the repo
itself (Settings → Deploy keys), separate from the SSH key above.

Confirm it worked: `curl http://<VM_IP>:8020/health` and `curl http://<VM_IP>:8010/health`
should each return `{"status":"ok"}` once the first run of each workflow finishes.

**The database starts empty on both** — no seeded test accounts. See "First admin user"
below before you can log in.

### See it in aaPanel

Once both have deployed at least once: Docker plugin → Compose (or "Container Manage" /
"Compose Manage", depending on your version) → Import, pointing at
`~/apps/vpms-production/docker-compose.yml` (and the staging one separately). This just
gives you a UI over the same containers/logs/restart controls — it doesn't change how they
got deployed.

---

## 5. First admin user

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

## 6. Later: domain + subdomains via aaPanel

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
