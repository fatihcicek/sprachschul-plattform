#!/usr/bin/env bash
# Baut das Paket für das Hosting nach dist/: server.js, statische Dateien,
# Migrationen und die eingebettete Datenbank. Wird von GitHub Actions aufgerufen.
set -euo pipefail
rm -rf dist .next
npx next build
cp -r .next/standalone dist
mkdir -p dist/.next
cp -r .next/static dist/.next/static
[ -d public ] && cp -r public dist/public
cp -r drizzle dist/drizzle
rm -rf dist/node_modules/@electric-sql/pglite
mkdir -p dist/node_modules/@electric-sql
cp -r node_modules/@electric-sql/pglite dist/node_modules/@electric-sql/pglite
rm -rf dist/.env dist/src dist/node_modules/@img dist/node_modules/sharp dist/node_modules/typescript dist/node_modules/@next/swc-*
echo "Paket: $(du -sh dist | cut -f1)"
