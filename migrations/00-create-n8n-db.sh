#!/bin/bash
# Runs once on an empty data volume (docker-entrypoint-initdb.d): creates n8n's own metadata DB.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "CREATE DATABASE n8n"
