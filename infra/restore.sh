#!/bin/bash
# Restore script for Watercooler
# Usage: ./infra/restore.sh /data/backups/watercooler_backup_20240101_030000.sql.gz

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <backup_file.sql.gz>"
  echo "Available backups:"
  ls -lh /data/backups/watercooler_backup_*.sql.gz 2>/dev/null || echo "  No backups found"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

echo "Restoring from: ${BACKUP_FILE}"
echo "WARNING: This will overwrite the current database. Press Ctrl+C to cancel."
sleep 5

gunzip -c "${BACKUP_FILE}" | docker compose exec -T postgres psql \
  -U "${POSTGRES_USER:-watercooler}" \
  -d "${POSTGRES_DB:-watercooler}"

echo "Restore complete."
