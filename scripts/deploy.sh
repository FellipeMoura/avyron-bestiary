#!/usr/bin/env bash
# Deploy the bestiary from the current HEAD of origin/main.
#
# Runs on the VPS as the `deploy` user (not root). Every step exits on
# failure, so partial deploys don't leave the process serving mixed code.
# Order matches quartzo's deploy.sh: pull → install → build → migrate →
# reload → healthcheck. Migrations run in a transaction (drizzle-kit),
# so a schema failure rolls back and the reload never happens.
#
# Usage:
#   cd /srv/bestiary/current && ./scripts/deploy.sh

set -euo pipefail

# ---------------------------------------------------------------------------
# SERVICO APOSENTADO — parado na versao 0.104.
#
# O processo PM2 foi removido e o site desligado no Nginx. Rodar este script
# ressuscita os dois em silencio (`pm2 reload` recria o processo), e a partir
# dai existem dois bancos divergindo: o snapshot no repositorio e o Postgres
# da VPS. Ver docs/VPS_RUNBOOK.md.
#
# Para religar de proposito: DEPLOY_RETIRED=0 ./scripts/deploy.sh
# ---------------------------------------------------------------------------
if [[ "${DEPLOY_RETIRED:-1}" != "0" ]]; then
  echo "deploy abortado: o bestiario em producao esta aposentado (0.104)."
  echo "A fonte de verdade e packages/db/snapshot/ no repositorio."
  echo "Para religar de proposito: DEPLOY_RETIRED=0 $0"
  exit 1
fi

APP_DIR="/srv/bestiary/current"
LOG_DIR="/srv/bestiary/logs"
HEALTH_URL="https://bestiary.sysnode.com.br/health"
ECOSYSTEM="ecosystem.config.cjs"

mkdir -p "$LOG_DIR"
cd "$APP_DIR"

log() { printf '[%s] %s\n' "$(date +'%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG_DIR/deploy.log"; }

log "deploy start (pid $$)"

# 1. Sync source. `reset --hard` is fine because /srv/bestiary/current is a
#    dedicated checkout — nobody edits it by hand.
log "git fetch + reset"
git fetch --tags --prune
git reset --hard origin/main

# 2. Install dependencies with a frozen lockfile so builds are reproducible.
log "pnpm install"
pnpm install --frozen-lockfile

# 3. Build every workspace (api compiles to dist/, web to apps/web/dist/).
log "pnpm build"
pnpm build

# 4. Apply pending migrations. Drizzle wraps this in a transaction; failure
#    leaves the schema untouched and this script exits before reload.
log "pnpm db:migrate"
pnpm db:migrate

# 5. Zero-downtime reload — PM2 waits for the new process to be ready
#    before killing the old one.
log "pm2 reload"
pm2 reload "$ECOSYSTEM" --update-env

# 6. Healthcheck retry — hit the public endpoint through Nginx, not
#    localhost, so we validate the whole path end-to-end.
log "healthcheck"
for i in $(seq 1 10); do
    if curl -sfo /dev/null "$HEALTH_URL"; then
        log "healthcheck ok on attempt $i"
        log "deploy done"
        exit 0
    fi
    sleep 3
done

log "healthcheck FAILED after 10 attempts — check pm2 logs bestiary-api"
exit 1
