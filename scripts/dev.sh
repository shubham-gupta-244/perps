#!/usr/bin/env bash
#
# Boot the whole trading-engine stack for local development.
#
#   ./scripts/dev.sh            # infra + migrate + all backend services (watch mode)
#   ./scripts/dev.sh --no-infra # skip `docker compose up` (infra already running)
#   ./scripts/dev.sh --prod     # `bun start` instead of `bun dev` (no file watching)
#
set -euo pipefail
cd "$(dirname "$0")/.."

INFRA=1
TASK=dev
for arg in "$@"; do
  case "$arg" in
    --no-infra) INFRA=0 ;;
    --prod) TASK=start ;;
    *) echo "unknown flag: $arg" >&2; exit 1 ;;
  esac
done

if [[ "$INFRA" == "1" ]]; then
  echo "▶ starting redis + postgres"
  docker compose up -d
  # wait for postgres
  until docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do
    echo "  waiting for postgres..."; sleep 1
  done
fi

echo "▶ applying database migrations"
( cd packages/db && bunx prisma migrate deploy && bunx prisma generate )

SERVICES=(engine index-price-observer db-writer backend ws)
FILTERS=()
for s in "${SERVICES[@]}"; do FILTERS+=("--filter=$s"); done

echo "▶ launching services: ${SERVICES[*]}  (task: $TASK)"
exec bunx turbo run "$TASK" "${FILTERS[@]}"
