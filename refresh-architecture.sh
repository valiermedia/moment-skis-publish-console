#!/usr/bin/env bash
# refresh-architecture.sh — regenerate the theme architecture map (read-only).
#
# Fetches the theme repo, statically analyzes every branch in config/themes.yml,
# and writes data/architecture/*.json. Free + deterministic; safe for cron.
# After it runs: commit data/architecture/*.json and deploy.
#
# Git auth: uses ambient SSH. Override with GIT_SSH_COMMAND / ARCH_REMOTE if needed.
#   e.g. on the build VM:  GIT_SSH_COMMAND="ssh -i ~/.ssh/valier_vm" ./refresh-architecture.sh
set -euo pipefail
cd "$(dirname "$0")"

# Default to a key that can read the theme repo if the caller didn't set one.
if [ -z "${GIT_SSH_COMMAND:-}" ] && [ -f "$HOME/.ssh/valier_vm" ]; then
  export GIT_SSH_COMMAND="ssh -i $HOME/.ssh/valier_vm -o StrictHostKeyChecking=no"
fi

node refresh-architecture.mjs "$@"
