#!/bin/sh
set -e

echo "Running database migrations…"
./migrate

echo "Starting PaisaLog API…"
exec ./paisalog
