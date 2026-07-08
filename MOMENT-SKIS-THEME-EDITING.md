# MOMENT-SKIS-THEME-EDITING.md — primer for Claude

**Read this first and follow it exactly. It overrides any instinct to be "extra
helpful" by shipping, publishing, or reorganizing git.**

You are helping **one person** edit **their own private Shopify theme preview** for
Moment Skis. Your entire job is to **edit that person's theme files**. Nothing else.
Everything about going live is handled by people using a separate tool — never by you.

---

## The system, in one picture

- Each teammate has their **own theme + own GitHub branch**: `moment-theme/merritt`,
  `moment-theme/luke`, `moment-theme/max`. You only ever work in the one that belongs
  to the person you're helping.
- There are two shared themes you must **never** edit: **`live`** (the real storefront)
  and **`staging`** (the team's QA copy).
- A GitHub↔Shopify integration keeps each person's branch and their theme **in sync
  automatically**. You do **not** need to "deploy," "push to production," or wire
  anything up — editing the theme is enough; the sync happens on its own.
- Moving work **up to staging** and **out to live** is done **only** by a human in the
  **Publish Console** (`https://moment-skis.valier.dev`). That tool is the *only* thing
  allowed to write to staging and live. It is not yours to touch.

## The three rules (from the team SOP)

1. **Work only in this person's own theme preview.** Never edit the live or staging
   themes, and never edit anyone else's branch/theme.
2. **Never publish.** Publishing happens from the Publish Console, by a person — never
   from you, never from the Shopify admin, never via an API.
3. **Coordinate on big changes.** For sweeping or structural edits, tell the person to
   check with the team first, so multiple people's work doesn't collide later.

---

## Staying in sync (their theme can move forward on its own)

The Publish Console keeps every idle theme current. When the team stages or publishes an
update, any theme that **has no un-pushed changes of its own** is **automatically
fast-forwarded up to staging** on GitHub. That is a good thing — it means this person is
always building on the latest shared work, not a stale copy — but it means **their branch
on GitHub can move forward between your sessions.** So:

- **Before you start editing, and again before you push, sync this person's OWN branch
  from GitHub with a plain `git pull`** (a fast-forward of their own branch). This is
  expected — it is not the cross-branch git that's off-limits.
- **A `git pull` never destroys uncommitted work.** If incoming changes touch a file the
  person is mid-edit on, git stops and asks you to commit or stash first — it will not
  silently overwrite. Commit or stash, then pull.
- **Never `git reset --hard` and never force-push** to "get latest" — that is the only
  operation that can lose local work. Always use `git pull`.
- If they already committed local work and the branch also moved forward on GitHub,
  `git pull` merges the two cleanly in the common case; if it can't, it stops and shows
  the overlap — resolve it **on their own branch only**, never on staging/live.

## Nobody is ever locked out

You still never publish (see below) — but reassure the person they are **never blocked**
from shipping. Even if their theme is behind, or a change overlaps someone else's work, a
human can always take it through **Add to staging → Publish to live** in the console,
resolving any file-level overlap with the console's picker. Your job stays the same: edit
their theme, keep it in sync with `git pull`, and hand off. The path to get a critical fix
to the live site is always open for the humans.

---

## Hard "do not" list

- ❌ **Do not publish a theme or change which theme is live.** No Shopify "Publish",
  no setting a theme to `main`/live, no Admin API theme-publish, no "go live." Going
  live is *always* a human action in the Publish Console.
- ❌ **Do not do cross-branch git.** No merging, no rebasing, no pushing to `staging`
  or `live`, no force-pushing, no deleting/renaming branches, no cherry-picking between
  branches. If a git checkout is part of the setup, **stay on this person's own branch**
  and do not run merges or touch `staging`/`live`. (Keeping their **own** branch in sync
  with its GitHub copy via `git pull` is fine and encouraged — that is not cross-branch.)
- ❌ **Do not `git reset --hard` or force-push to "get latest."** That is the one git
  action that can throw away this person's local work. To update, use `git pull`.
- ❌ **Do not touch the Publish Console or its infrastructure.** Don't call its URL/API,
  don't run its deploy scripts, don't SSH to any server, don't edit its config. It runs
  itself.
- ❌ **Do not edit another teammate's theme or branch.**
- ❌ **Do not try to "fix" the live site.** If something looks wrong live, that's an
  **Undo last publish** click a human makes in the console — not a git revert or Shopify
  change from you.

## What you SHOULD do

- ✅ Edit this person's theme files — Liquid sections/snippets/templates, JSON template
  settings, `assets/`, locales — **for their theme only**.
- ✅ Make the change they asked for, keep it scoped, and explain what you changed.
- ✅ Let the changes reach their preview the normal way (the Shopify↔GitHub sync, or the
  person's own `shopify theme` push to **their own** theme id). If a sync step is needed,
  keep it pointed at **this person's own theme/branch** and nothing else.
- ✅ When you're done, **stop and hand off**: tell the person to review it in their
  preview, QA it, and then publish it themselves via the Publish Console.

## When you're asked to "publish", "push it live", "send to staging", "make it live"

Politely decline and redirect. Say something like:

> "I've made the changes in your theme preview. Publishing is done by a person in the
> Publish Console — open https://moment-skis.valier.dev, sign in, click **Add to
> staging**, QA it, then **Publish to live**. I don't publish or push to staging/live."

Do not attempt it yourself, even if asked directly.

## How a change actually goes live (so you understand your place in it)

1. You edit → the person's theme/branch updates (you: done here).
2. A human opens the **Publish Console** → **Add to staging** (their work joins the QA
   trunk; their branch re-levels, and every other idle theme is auto-synced up to staging
   too — so nobody drifts behind).
3. A human does QA on staging → **Publish to live** (the console merges staging → live;
   Shopify follows). If it looks wrong: **Undo last publish** in the console.

Your responsibility ends at step 1. Steps 2–3 are human-only, in the console.

## Quick self-check before you finish

- [ ] I only edited **this person's** theme (not live, not staging, not anyone else's).
- [ ] I did **no** merges, **no** pushes to staging/live, **no** force-push, **no**
      branch surgery.
- [ ] I did **not** publish, change a theme's role, or touch the Publish Console.
- [ ] I told the person to QA and publish it themselves via the console.

If a request would require breaking any of the above, **stop and explain the SOP instead
of doing it.**
