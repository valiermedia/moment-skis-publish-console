# Operator setup

Things **you (the human operator)** set up once. The app cannot create these — it
consumes the ids/secrets you produce here.

## Two places config lives

- **`.env` / `.env.production` (BOOTSTRAP)** — the handful of values needed *before*
  anyone can log in, so they can't be self-managed: `NEXTAUTH_SECRET`,
  `SETTINGS_ENCRYPTION_KEY`, `AUTH_GITHUB_ID/SECRET`, `GITHUB_ORG`,
  `SUPER_ADMIN_LOGINS`, `NEXTAUTH_URL`, and the db/clone paths.
- **In-app Settings panel (MANAGED)** — everything operational: GitHub App id /
  installation / private key, Shopify domain + token, repo/branches, dev email,
  store domain, and the theme map. The **super-admin** (default GitHub login
  `valiermedia`, set by `SUPER_ADMIN_LOGINS`) opens **Settings** in the app header
  and edits these live — changes take effect immediately, no redeploy. Secrets are
  stored **encrypted** in sqlite and never shown back.

So the fastest launch path: put the bootstrap values in `.env`, deploy, sign in as the
super-admin, and fill in the GitHub App key / Shopify token / theme ids from the
Settings panel. You can also pre-seed any managed value in `.env` (it's used as a
fallback until overridden in-app). Steps 1–9 below produce the values either way.

---

## 1. GitHub OAuth App (login / identity)

Create at **GitHub → Settings → Developer settings → OAuth Apps → New**.

- **Homepage URL:** your console URL (e.g. `https://moment-skis.valier.dev`)
- **Authorization callback URL:** `<that URL>/api/auth/callback/github`
  (dev: `http://localhost:3006/api/auth/callback/github`)

Copy the **Client ID** and a generated **Client secret** into:

```
AUTH_GITHUB_ID=...
AUTH_GITHUB_SECRET=...
```

Also generate a NextAuth secret:

```
NEXTAUTH_SECRET=$(openssl rand -base64 32)
NEXTAUTH_URL=https://moment-skis.valier.dev   # or http://localhost:3006 in dev
```

## 2. GitHub App (all repo writes)

Create at **GitHub → Settings → Developer settings → GitHub Apps → New**. This is the
identity that performs merges/reverts to `staging`, `live`, and the person-branches.

- **Repository permissions:** **Contents: Read & write**, **Pull requests: Read & write**.
- **Where can this app be installed:** only this account/org.
- After creating: **Generate a private key** (downloads a `.pem`) and **Install** the App
  on the org, granting it the theme repo.

Copy:

```
GITHUB_APP_ID=...                 # numeric App ID
GITHUB_APP_INSTALLATION_ID=...    # from the install URL: .../installations/<id>, or via API
GITHUB_APP_PRIVATE_KEY_PATH=/opt/apps/moment-skis-publish-console/secrets/github-app.pem
```

Put the `.pem` at that path with `chmod 600`. (Alternatively paste the PEM inline into
`GITHUB_APP_PRIVATE_KEY` with `\n` for newlines — the path wins if both are set.)

Find the installation id:
```bash
# using the App's JWT, or simplest: the number in the install settings URL
# https://github.com/organizations/<org>/settings/installations/<INSTALLATION_ID>
```

## 3. Org + repo identity

`GITHUB_ORG` is bootstrap (`.env`). `GITHUB_OWNER`/`GITHUB_REPO` point at the **Shopify
theme repo** the console operates on (the one with `live` / `staging` / person branches
connected to Shopify) — this is **not** the console app's own repo
(`valiermedia/moment-skis-publish-console`). The owner/repo/branches can be set in the
in-app Settings panel after launch; `.env` values act as defaults.

```
GITHUB_ORG=moment-skis                   # the org everyone must belong to for access
GITHUB_OWNER=moment-skis
GITHUB_REPO=<the-shopify-theme-repo>     # e.g. moment-skis-theme
LIVE_BRANCH=live
STAGING_BRANCH=staging
```

Login is granted **only** to members of `moment-skis` who have **write** access to
`GITHUB_OWNER/GITHUB_REPO` (super-admins in `SUPER_ADMIN_LOGINS`, e.g. `valiermedia`, are
always allowed). Everyone else is held at the request-access screen.

## 4. Branch protection (requires GitHub Team on the org)

Protect `staging` and `live` so **only the GitHub App** (plus you, for emergencies) can
push. In the repo's **Settings → Branches → Add rule** for each of `staging` and `live`:

- Require pull request / restrict who can push → allow only the GitHub App (and operator).
- This is what makes "humans can't push to staging/live directly" real. Branch protection
  on private repos needs the org on **GitHub Team** or higher.

## 5. GitHub → Shopify integration (you confirm; not this app)

Confirm in Shopify that the GitHub integration connects:

- `live` → the **published** theme
- `staging` → the staging/QA theme
- each person-branch (`merritt` / `luke` / `max`) → that person's theme

This app orchestrates branches; the integration is what turns a branch update into a
Shopify theme update.

## 6. `config/themes.yml` — theme ids

Edit `config/themes.yml` (committed) with the real Shopify theme ids. These are used
**only for reads** (preview URLs, live-version label). A wrong id = wrong readout, never a
wrong publish.

```yaml
branches:
  live:    { theme_id: <published theme id> }
  staging: { theme_id: <staging theme id> }
  merritt: { theme_id: <merritt theme id> }
  luke:    { theme_id: <luke theme id> }
  max:     { theme_id: <max theme id> }
```

## 7. Shopify Admin API token (READ-ONLY)

Create a **custom app** in the Shopify admin (**Settings → Apps and sales channels →
Develop apps**) with **`read_themes`** scope only. Install it, copy the **Admin API access
token**:

```
SHOPIFY_STORE_DOMAIN=moment-skis.myshopify.com
SHOPIFY_ADMIN_API_TOKEN=shpat_...
SHOPIFY_API_VERSION=2025-01
```

If you skip this, the app still works off GitHub — it just won't show preview links or the
live theme name.

## 8. Client-facing bits

```
DEV_EMAIL=developer@momentskis.com     # the "Ask your developer" mailto
STORE_PUBLIC_DOMAIN=momentskis.com     # shown in the header + live bar
```

## 9. Domain / subdomain

Pick the console's subdomain (suggested `moment-skis.valier.dev`) and point DNS at the
droplet `64.23.224.85`. Add the Caddy block in `deploy/Caddyfile.snippet` (Caddy issues the
TLS cert automatically on first request).

---

### Values the app needs from you — checklist

- [ ] `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` (OAuth App)
- [ ] `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- [ ] `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, private key (path or inline)
- [ ] `GITHUB_ORG` / `GITHUB_OWNER` / `GITHUB_REPO` confirmed
- [ ] Branch protection on `staging` + `live`
- [ ] GitHub→Shopify integration confirmed
- [ ] `config/themes.yml` real theme ids
- [ ] `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_API_TOKEN` (read scope)
- [ ] `DEV_EMAIL`, `STORE_PUBLIC_DOMAIN`
- [ ] DNS + subdomain
