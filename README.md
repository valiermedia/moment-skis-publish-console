# Publish Console — Moment Skis

A self-serve deployment console for the Moment Skis Shopify theme. Each team member
works in their **own theme**, their edits auto-commit to their **own GitHub branch**,
and this console moves that work **up to a shared `staging` branch** and finally **to
`live`**. Shopify updates itself through the existing GitHub↔Shopify theme integration
— this app orchestrates **git branches**, and Shopify follows.

> **There is no theme-publish code path anywhere in this app.** Going live is *always*
> a git merge (`staging → live`); Shopify auto-publishes because the `live` branch is
> connected to the already-published theme. The Shopify token is **read-only**.

---

## How the workflow maps to git

| In the UI | Under the hood |
|-----------|----------------|
| **Add to staging** | merge person-branch **up** into `staging`, then merge `staging` back **down** into the branch to re-level it |
| **Sync from staging** | merge `staging` **down** into the person-branch |
| **QA Review** | open the staging theme's Shopify preview + record a sign-off for the current `staging` SHA |
| **Publish to live** | merge `staging` **into** `live` (Shopify auto-publishes) |
| **Undo last publish** | `git revert` the last commit on `live` |
| **Restore this version** | `git revert` `live` back down to the chosen commit |

All writes are performed by the **GitHub App installation** (never a user token), gated
by an org-membership + repo-write check at sign-in. Every `live` change is confirmed in
the UI, reversible, and written to an audit log.

**In-app Settings (super-admin).** The GitHub login(s) in `SUPER_ADMIN_LOGINS` (default
`valiermedia`) get a **Settings** panel to manage operational secrets/config live on prod
— GitHub App key, Shopify token, repo/branches, theme ids — without editing `.env` or
redeploying. Secrets are AES-256-GCM encrypted at rest and never returned to the browser.
Only true bootstrap values (OAuth, NextAuth secret, org, super-admin list) stay in `.env`,
so an admin can never lock themselves out. See `OPERATOR-SETUP.md`.

---

## Architecture

- **Next.js 15 (App Router, TypeScript)** — one deployable serving the UI + server API.
- **Auth.js / NextAuth v5 (GitHub provider)** — identity. Authorization = GitHub org access.
- **Octokit + GitHub App installation auth** — all repo writes.
- **Server-side git clone** (`simple-git`) at `REPO_CLONE_PATH` — conflict detection
  (real merges in throwaway worktrees), per-file resolution, merges, reverts.
- **better-sqlite3** — the only local state: QA sign-offs + audit log (`DATABASE_PATH`).
- **Shopify Admin API (read-only)** — theme preview URLs (QA) and the live theme's name.

Source of truth is **GitHub**; almost nothing is persisted locally.

```
src/
  auth.ts / auth.config.ts   NextAuth (node) + edge-safe base for middleware
  middleware.ts              route gate: /login, /request-access, console
  lib/
    config.ts                env + config/themes.yml loader
    github-access.ts         org membership + repo-write check (user token, sign-in only)
    octokit.ts               GitHub App installation client + push token
    git.ts                   the git engine (worktree merges, conflict hunks, reverts)
    console-state.ts         builds the whole console state from GitHub + sqlite + Shopify
    db.ts                    qa_signoffs + audit_log (sqlite)
    shopify.ts               READ-ONLY theme reads (no publish)
    guard.ts / picks.ts / ui.ts
  app/
    page.tsx                 the console (server → <Console/>)
    login/ request-access/   auth states
    api/                     state, add-to-staging, sync-from-staging, publish,
                             undo, restore, qa, health, auth/[...nextauth]
  components/Console.tsx      the UI (ported from publish-console-mockup.jsx)
config/themes.yml            branch → Shopify theme map (operator-owned)
deploy/                      ecosystem.config.cjs (PM2), Caddyfile.snippet, deploy.sh
```

---

## Local development

```bash
cp .env.example .env      # then fill it in (see OPERATOR-SETUP.md)
npm install
npm run dev               # http://localhost:3006
```

Without real GitHub App / Shopify credentials the UI loads but `/api/state` will show
"Couldn't reach the store's history" — that's expected until the operator provides the
values in OPERATOR-SETUP.md.

Useful scripts: `npm run build`, `npm run start`, `npm run typecheck`.

---

## Deployment (droplet)

The target droplet uses **Caddy** (reverse proxy + auto-HTTPS) and **PM2**. See
`deploy/DEPLOY.md` for the full runbook. Summary:

1. Operator creates the app dir + `.env.production` (0600) on the droplet, adds a Caddy
   block (`deploy/Caddyfile.snippet`) and a PM2 entry (`deploy/ecosystem.config.cjs`).
2. `deploy/deploy.sh` clones the repo, `npm ci`, `npm run build`, flips the `current`
   symlink, and `pm2 restart`.

> This app is **not** yet registered with the Valier `agent-api` deploy endpoint. The
> first deploy needs the one-time droplet setup in `deploy/DEPLOY.md` (ask the operator
> before making infra changes on the droplet).

---

## Security notes

- Secrets are server-side only (`.env` / `.env.production`, never committed). `.gitignore`
  excludes `.env*`, `/data`, and `*.pem`.
- The user's GitHub OAuth token is used **once** at sign-in for the access check and is
  **not persisted** — only the resulting allowed/member/write booleans are kept.
- Humans cannot push to `staging`/`live`; branch protection restricts those to the GitHub
  App + operator (see OPERATOR-SETUP.md). This app never force-pushes and never discards
  work to "resolve" a conflict — if it can't merge safely it stops and surfaces it.
- The Shopify token is read scope. Grep-test the guarantee: there is no `themePublish` /
  `PUT themes` / `role: main` call anywhere in `src/`.
