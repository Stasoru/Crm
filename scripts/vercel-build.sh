#!/usr/bin/env sh
# Build used by Vercel: applies migrations, optionally seeds demo data, then builds.
set -e
npx prisma generate
# Neon's pooled URL can't run migrations; use the direct one when provided.
if [ -n "$DATABASE_URL_UNPOOLED" ]; then
  DATABASE_URL="$DATABASE_URL_UNPOOLED" npx prisma migrate deploy
else
  npx prisma migrate deploy
fi
if [ "$SEED_DEMO" = "1" ]; then npx tsx prisma/seed.ts; fi
npx next build
