# Deploy runbook — droplet

Target droplet: `64.23.224.85` (Ubuntu 24.04, Caddy + PM2). App port **3006**.
Suggested domain **moment-skis.valier.dev**.

> **First deploy needs one-time droplet setup (steps 1–4).** These touch shared infra
> (Caddy, PM2, a new `/opt/apps` dir). Confirm with the operator before running them.

The app is intentionally **not** wired into the Valier `agent-api` deploy endpoint (which
only knows the pre-registered apps). It deploys with the small script below, which follows
the same release-dir + symlink + PM2 pattern as the other simple apps.

---

## 0. Prerequisites (operator)

- All values in `OPERATOR-SETUP.md` ready.
- DNS `A` record for the chosen subdomain → `64.23.224.85`.
- The repo is pushed to GitHub and the deploy host can clone it (the GitHub App token or a
  read deploy key). The `deploy@` droplet user should be able to `git clone` the repo.

## 1. Create the app directory layout on the droplet

```bash
ssh -i ~/.ssh/id_ed25519 deploy@64.23.224.85
sudo mkdir -p /opt/apps/moment-skis-publish-console/{releases,logs,secrets,shared}
sudo chown -R deploy:deploy /opt/apps/moment-skis-publish-console
```

## 2. Secrets

Put the production env + GitHub App key on the droplet (never in git):

```bash
# on the droplet
install -m 600 /dev/stdin /opt/apps/moment-skis-publish-console/shared/.env.production   # paste, then Ctrl-D
install -m 600 /dev/stdin /opt/apps/moment-skis-publish-console/secrets/github-app.pem   # paste the PEM
```

`.env.production` mirrors `.env.example`, with `NEXTAUTH_URL=https://moment-skis.valier.dev`,
`REPO_CLONE_PATH=/opt/apps/moment-skis-publish-console/shared/repo`,
`DATABASE_PATH=/opt/apps/moment-skis-publish-console/shared/console.db`, and
`GITHUB_APP_PRIVATE_KEY_PATH=/opt/apps/moment-skis-publish-console/secrets/github-app.pem`.

## 3. Caddy

Append `deploy/Caddyfile.snippet` (edit the domain) to `/etc/caddy/Caddyfile`, then:

```bash
sudo systemctl reload caddy
```

## 4. First release + PM2

```bash
# from the droplet, as deploy@
export REPO_SSH=git@github.com:valiermedia/moment-skis-publish-console.git   # or https
bash <(curl -s https://raw.githubusercontent.com/...) # OR copy deploy/deploy.sh over and run it
/opt/apps/moment-skis-publish-console/deploy.sh main

# register with PM2 (once)
cd /opt/apps/moment-skis-publish-console/current
pm2 start deploy/ecosystem.config.cjs
pm2 save
```

## 5. Subsequent deploys

```bash
/opt/apps/moment-skis-publish-console/deploy.sh main
```

`deploy.sh` (see `deploy/deploy.sh`): clone the branch shallow into a timestamped release,
`npm ci`, `npm run build`, symlink `.env.production` in, flip `current →` the new release,
`pm2 restart moment-skis-publish-console --update-env`, prune to the last 3 releases.

## 6. Health check

```bash
curl -s https://moment-skis.valier.dev/api/health      # {"ok":true,...}
pm2 logs moment-skis-publish-console --lines 50
```

## Rollback

```bash
ls -lt /opt/apps/moment-skis-publish-console/releases/            # find prior good timestamp
ln -sfn /opt/apps/moment-skis-publish-console/releases/<TS> /opt/apps/moment-skis-publish-console/current
pm2 restart moment-skis-publish-console
```

## Notes

- The **server-side clone** lives under `shared/repo` (outside releases) so it survives
  deploys and keeps its fetched refs. It's created automatically on first `/api/state`.
- The **sqlite db** (`shared/console.db`) also lives outside releases — audit log + QA
  sign-offs persist across deploys.
- `next start` runs on `127.0.0.1:3006`; Caddy terminates TLS and proxies to it.
