#!/usr/bin/env bash
# Deploys Zenith to a Hugging Face Space (Docker SDK, free CPU basic hardware). The Space builds the same Dockerfile
# as the Nebius deploy; the models still run on Nebius Token Factory.
#
# Prerequisites: a Hugging Face account, a Docker Space (e.g. "zenith") created at https://huggingface.co/new-space,
# and a write token from https://huggingface.co/settings/tokens. Git asks for it on the first push: username = your
# HF username, password = the token. macOS keeps it in the keychain after that.
#
#   HF_USER=yourname scripts/deploy-hf.sh
#   HF_USER=yourname HF_SPACE=zenith-test scripts/deploy-hf.sh
#   HF_USER=yourname DRY_RUN=1 scripts/deploy-hf.sh     list what would be pushed, push nothing
#
# What gets pushed: tracked files only (git archive, so .env, CLAUDE.md and docs/private can't leak) minus the README
# images, plus cache/ (the pre-cached demo tickers and saved sessions; run `npm run precache` first). The Space is
# public, so everything pushed is public. API keys go in the Space's Settings → Variables and secrets, never here.
set -euo pipefail

cd "$(dirname "$0")/.."

HF_USER="${HF_USER:?Set HF_USER to your Hugging Face username}"
HF_SPACE="${HF_SPACE:-zenith}"
REMOTE="https://huggingface.co/spaces/$HF_USER/$HF_SPACE"
TAG="$(git rev-parse --short HEAD)"

if [ -n "$(git status --porcelain -- backend frontend Dockerfile package.json package-lock.json)" ]; then
  echo "Uncommitted changes in the app; commit first so the Space runs $TAG exactly." >&2
  exit 1
fi
[ -d cache ] || { echo "No cache/ folder: run npm run precache first." >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "==> Assembling $TAG for $REMOTE"
git archive HEAD Dockerfile .dockerignore package.json package-lock.json LICENSE backend frontend | tar -x -C "$work"
mkdir -p "$work/cache"
# Market data and saved sessions only: no lock files, nothing outside cache/.
(cd cache && find . -type f -name '*.json' -print0 | while IFS= read -r -d '' f; do
  mkdir -p "$work/cache/$(dirname "$f")" && cp "$f" "$work/cache/$f"
done)

# The Space page is built from README.md's front matter. app_port matches the image's PORT.
cat > "$work/README.md" <<EOF
---
title: Zenith
emoji: 📈
colorFrom: green
colorTo: gray
sdk: docker
app_port: 8080
license: mit
short_description: AI investment committee on NVIDIA Nemotron via Nebius
---

# Zenith: the AI investment committee

Three analyst agents (fundamentals, technicals, risk) argue a stock from figures computed in Java, rebut each other
once, and an NVIDIA Nemotron Ultra chair rules BUY / HOLD / SELL and records the dissent. Every model call runs on
**Nebius Token Factory** (Nemotron Nano, Super and Ultra). This Space only hosts the web app.

**Research and education only. Not financial advice.**

Source, design notes and setup: https://github.com/samaunmahmud/zenith (deployed from commit $TAG)
EOF

if [ "${DRY_RUN:-0}" = 1 ]; then
  (cd "$work" && find . -type f | sort)
  echo "    dry run: nothing pushed"
  exit 0
fi

echo "==> Pushing (git may ask for your HF username and token)"
cd "$work"
git init -q -b main
git add -A
git -c user.name="$(git -C "$OLDPWD" config user.name)" -c user.email="$(git -C "$OLDPWD" config user.email)" \
  commit -q -m "Deploy $TAG"
# Force: the Space's history is just deploy snapshots; GitHub is the source of truth.
git push -f "$REMOTE" main

echo "==> Pushed. The Space builds in about 5 minutes:"
echo "    page:   $REMOTE"
echo "    direct: https://$(echo "$HF_USER" | tr '[:upper:]_.' '[:lower:]--')-$HF_SPACE.hf.space"
