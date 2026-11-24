#!/usr/bin/env bash
# Copies the accounts' data from the catalogue's database to the accounts' own, once, as the accounts move to an
# application of their own: users, their sign-ins and sessions, the audit log, device sign-ins, last sessions and
# access records, offers, checkouts, credits, Patreon memberships and settings. User ids are kept, so no one signs up
# again, and the sessions too, so no one is signed out.
#
#   cd deploy
#   docker compose up -d db accounts-db
#   docker compose run --rm migrate              # the catalogue's, up to the release: every table copied is there
#   docker compose run --rm accounts-migrate     # the accounts' schema, empty
#   ./copy-accounts.sh
#   docker compose up -d
#
# It refuses to copy into an accounts database that already has users, and checks, table by table, that the copy holds
# as many rows as the catalogue's. The catalogue's own tables are left as they were: a later release drops them, once
# the copy has been checked.
#
# Where the databases are asked is a command each, compose's by default; the end-to-end tests' databases, for a trial:
#   CATALOGUE_DB='docker compose -f ../apps/catalogue/tests/e2e/compose.yaml exec -T db' \
#   ACCOUNTS_DB='docker compose -f ../apps/accounts/tests/e2e/compose.yaml exec -T db' ./copy-accounts.sh
set -euo pipefail

CATALOGUE_DB=${CATALOGUE_DB:-docker compose exec -T db}
ACCOUNTS_DB=${ACCOUNTS_DB:-docker compose exec -T accounts-db}

# The tables, in no particular order: the copy disables their triggers and foreign keys while it loads.
TABLES=(
  users sessions accounts verifications audit_log device_codes last_sessions access_records
  subscription_offers subscription_checkouts subscription_credits patreon_memberships catalogue_settings
)

catalogue() { $CATALOGUE_DB sh -c "$1"; }
accounts() { $ACCOUNTS_DB sh -c "$1"; }
count() { "$1" "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tA -c 'select count(*) from $2'"; }

existing=$(count accounts users)
if [ "$existing" != 0 ]; then
  echo "The accounts' database already has $existing users: nothing is copied." >&2
  exit 1
fi

dump_tables=""
for table in "${TABLES[@]}"; do dump_tables+=" -t public.$table"; done

echo "Copying ${#TABLES[@]} tables..."
# --disable-triggers: the rows are loaded as they were, with the accounts' trigger keeping the last session, and the
# foreign keys, held back until all are in. One transaction: all of it, or none.
# shellcheck disable=SC2016 # The variables are the database container's own, expanded there.
catalogue "pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" --data-only --disable-triggers --no-owner$dump_tables" |
  accounts 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 --single-transaction -q' >/dev/null

failed=0
for table in "${TABLES[@]}"; do
  from=$(count catalogue "$table")
  to=$(count accounts "$table")
  if [ "$from" = "$to" ]; then
    printf '  %-24s %s rows\n' "$table" "$to"
  else
    printf '  %-24s %s rows, but the catalogue has %s\n' "$table" "$to" "$from" >&2
    failed=1
  fi
done
if [ "$failed" = 1 ]; then
  echo 'The copy does not match: look into it before starting the accounts.' >&2
  exit 1
fi
echo 'The copy matches.'
