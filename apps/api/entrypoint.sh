#!/bin/sh
set -e

# Production migrates only in scripts/deploy-production.sh, from the new image
# and after a backup (docs/DEPLOY_ROLLBACK_HARDENING.md). A container start must
# never migrate there: after a failed migration Prisma refuses (P3009) and the
# old API would crash-loop on its next restart. docker-compose.yml passes
# MIGRATE_ON_START=false by default; set it to true only for a throwaway stack.
if [ "${MIGRATE_ON_START:-false}" = "true" ]; then
  echo "MIGRATE_ON_START=true: running Prisma migrations..."
  npx prisma migrate deploy
fi

echo "Starting NestJS API..."
exec node dist/src/main.js
