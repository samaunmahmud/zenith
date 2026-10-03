#!/usr/bin/env bash
# Deploys Zenith to Nebius Serverless AI Endpoints: build the image, push it to Nebius Container Registry, store the
# API keys in SecretStash (MysteryBox), and create a public CPU endpoint.
#
# Prerequisites: the nebius CLI, logged in to your project (`nebius profile create`), plus docker and jq.
# Keys are read from .env and sent only to SecretStash: never printed, typed, or baked into the image.
#
#   scripts/deploy-nebius.sh               first deploy
#   REGION_ID=eu-west1 scripts/deploy-nebius.sh
#
# Settings (environment variables, all optional):
#   REGION_ID          Nebius region for the registry (default eu-north1)
#   PUBLIC_SPEND_USD   MAX_SPEND_USD on the endpoint (default 3.00). The image carries cache/_spend.json, so this is a
#                      cap on the running total including what was spent locally, not an extra allowance.
#   PLATFORM, PRESET   compute for the endpoint (default cpu-d3, 4vcpu-16gb). Never leave these to the CLI: its
#                      default is a GPU platform, which this app doesn't need.
set -euo pipefail

cd "$(dirname "$0")/.."

REGION_ID="${REGION_ID:-eu-north1}"
PUBLIC_SPEND_USD="${PUBLIC_SPEND_USD:-3.00}"
PLATFORM="${PLATFORM:-cpu-d3}"
PRESET="${PRESET:-4vcpu-16gb}"
NAME=zenith
SECRET=zenith-keys
TAG="$(git rev-parse --short HEAD)"

for cmd in nebius docker jq git; do
  command -v "$cmd" >/dev/null || { echo "Missing '$cmd'. Install it first (nebius: curl -sSL https://artifacts.nebius.cloud/cli/install.sh | bash)." >&2; exit 1; }
done
[ -f .env ] || { echo "No .env found: the API keys are read from it." >&2; exit 1; }
if [ -n "$(git status --porcelain -- backend frontend)" ]; then
  echo "backend/ or frontend/ has uncommitted changes; commit first so the image tag ($TAG) matches the code." >&2
  exit 1
fi

# Reads one KEY=value from .env without sourcing the file (so nothing else in it runs or leaks into this shell).
env_value() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

echo "==> Checking what the image will carry"
spent="$(jq -r '.totalUsd // 0' cache/_spend.json 2>/dev/null || echo 0)"
printf '    spend already counted in cache/_spend.json: $%.3f; endpoint cap: $%s\n' "$spent" "$PUBLIC_SPEND_USD"
if awk -v s="$spent" -v c="$PUBLIC_SPEND_USD" 'BEGIN { exit !(s >= c) }'; then
  echo "PUBLIC_SPEND_USD is not above what's already spent, so the endpoint would start with AI calls switched off." >&2
  exit 1
fi
for t in $(env_value DEMO_TICKERS | tr ',' ' '); do
  [ -f "cache/$t/last-committee.json" ] || echo "    warning: $t has no saved session, so it will run live (and cost) on first visit"
done

echo "==> Container Registry ($REGION_ID)"
registry_id="$(nebius registry list --format json | jq -r --arg n "$NAME" '(.items // [])[] | select(.metadata.name == $n) | .metadata.id' | head -1)"
if [ -z "$registry_id" ]; then
  registry_id="$(nebius registry create --name "$NAME" --format json | jq -r '.metadata.id')"
  echo "    created registry $registry_id"
else
  echo "    using registry $registry_id"
fi
image="cr.$REGION_ID.nebius.cloud/$(echo "$registry_id" | cut -d- -f2)/$NAME:$TAG"
nebius registry configure-helper >/dev/null

echo "==> Building and pushing $image"
docker build --platform linux/amd64 -t "$image" .
docker push "$image"

echo "==> API keys in SecretStash ($SECRET)"
if nebius mysterybox secret get-by-name --name "$SECRET" >/dev/null 2>&1; then
  echo "    secret exists; leaving it as is (update it in the console if a key has changed)"
else
  payload="$(jq -n \
    --arg tf "$(env_value TOKEN_FACTORY_API_KEY)" \
    --arg fmp "$(env_value FMP_API_KEY)" \
    --arg fh "$(env_value FINNHUB_API_KEY)" \
    --arg ti "$(env_value TIINGO_API_KEY)" \
    '[{key: "TOKEN_FACTORY_API_KEY", string_value: $tf}, {key: "FMP_API_KEY", string_value: $fmp}, {key: "FINNHUB_API_KEY", string_value: $fh},
      {key: "TIINGO_API_KEY", string_value: $ti}]
     | map(select(.string_value != ""))')"
  [ "$(echo "$payload" | jq 'map(.key) | index("TOKEN_FACTORY_API_KEY") != null and index("FMP_API_KEY") != null')" = true ] \
    || { echo "TOKEN_FACTORY_API_KEY and FMP_API_KEY must both be set in .env." >&2; exit 1; }
  nebius mysterybox secret create --name "$SECRET" --description "Zenith API keys" --secret-version-payload "$payload" >/dev/null
  echo "    created"
fi

echo "==> Endpoint"
if nebius ai endpoint list --format json | jq -e --arg n "$NAME" '(.items // [])[] | select(.metadata.name == $n)' >/dev/null; then
  echo "An endpoint named '$NAME' already exists. The image is pushed as $image;" >&2
  echo "delete the old endpoint (nebius ai endpoint delete --id <ID>) and run this again to deploy it." >&2
  exit 1
fi

env_secrets=(--env-secret "TOKEN_FACTORY_API_KEY=$SECRET" --env-secret "FMP_API_KEY=$SECRET")
[ -n "$(env_value FINNHUB_API_KEY)" ] && env_secrets+=(--env-secret "FINNHUB_API_KEY=$SECRET")
[ -n "$(env_value TIINGO_API_KEY)" ] && env_secrets+=(--env-secret "TIINGO_API_KEY=$SECRET")

# PORT is left alone: the image sets 8080 to match --container-port. DEMO_MODE stays off so prices keep updating
# (the "Since this ruling" panel and the chair's watch list are checked against new closes).
endpoint_id="$(nebius ai endpoint create \
  --name "$NAME" \
  --image "$image" \
  --container-port 8080 \
  --platform "$PLATFORM" \
  --preset "$PRESET" \
  --public \
  "${env_secrets[@]}" \
  --env "MAX_SPEND_USD=$PUBLIC_SPEND_USD" \
  --env "REUSE_HOURS=1000" \
  --env "LIVE_RUNS_PER_HOUR=10" \
  --env "MAX_CONCURRENT_RUNS=2" \
  --env "SEARCHES_PER_DAY=60" \
  --env "DEMO_TICKERS=$(env_value DEMO_TICKERS)" \
  --format json | jq -r '.metadata.id')"
echo "    created $endpoint_id (it takes about five minutes to start)"

echo "==> Waiting for the public URL"
for _ in $(seq 1 60); do
  url="$(nebius ai endpoint get "$endpoint_id" --format json | jq -r '(.status.public_endpoints // [])[] | select(startswith("https://"))' | head -1)"
  if [ -n "$url" ] && curl -fsS "$url/api/health" >/dev/null 2>&1; then
    echo "    live: $url"
    curl -fsS "$url/api/health"; echo
    exit 0
  fi
  sleep 10
done
echo "Not answering yet after 10 minutes. Check: nebius ai endpoint get $endpoint_id" >&2
exit 1
