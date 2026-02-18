#!/bin/bash
# Backup script for Watercooler
# Usage: ./infra/backup.sh
# Cron example: 0 3 * * * /path/to/project/infra/backup.sh

set -euo pipefail

BACKUP_DIR="/data/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/watercooler_backup_${TIMESTAMP}.sql.gz"

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

# Run pg_dump inside the postgres container
docker compose exec -T postgres pg_dump \
  -U "${POSTGRES_USER:-watercooler}" \
  -d "${POSTGRES_DB:-watercooler}" \
  --clean --if-exists \
  | gzip > "${BACKUP_FILE}"

echo "Backup created: ${BACKUP_FILE}"

# Keep only last 30 backups
ls -t "${BACKUP_DIR}"/watercooler_backup_*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm --
echo "Old backups cleaned up. Done."
