#!/bin/sh
# Runs once, when the Postgres volume is first created: a separate database and role for Keycloak.
set -eu
# DISABLED: sign-in is email + password; Keycloak (and its database) is commented out.
# psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
# CREATE ROLE keycloak LOGIN PASSWORD '${KEYCLOAK_DB_PASSWORD}';
# CREATE DATABASE keycloak OWNER keycloak;
# EOSQL
exit 0
