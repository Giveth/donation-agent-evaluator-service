#!/usr/bin/env sh
# Entrypoint for Donation Agent Evaluator Service
# 1. Run database migrations
# 2. Start the application passed as CMD arguments
# If any step fails the script exits (set -e)

set -e

echo "Export SSL certificate path..."
export PGSSLROOTCERT=/usr/src/app/db-ca.crt
export DATABASE_SSL_REJECT_UNAUTHORIZED=true

echo "[entrypoint] Running database migrations..."
npm run migration:run

echo "[entrypoint] Starting application..."
exec "$@"
