#!/bin/sh
set -e

echo "Running database migrations..."
node /app/node_modules/tsx/dist/cli.mjs src/migrate.ts

echo "Starting API server..."
exec node /app/node_modules/tsx/dist/cli.mjs src/index.ts
