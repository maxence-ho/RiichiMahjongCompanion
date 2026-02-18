#!/bin/sh
set -eu

PROJECT_ID="${FIREBASE_PROJECT_ID:-demo-mahjong-club}"
SEED_DIR="${EMULATOR_SEED_DIR:-.emulator-seed-admin/export}"
SEED_METADATA="${SEED_DIR}/firebase-export-metadata.json"
SEED_ON_START="${SEED_ON_START:-true}"

export FIREBASE_PROJECT_ID="${PROJECT_ID}"
export GCLOUD_PROJECT="${PROJECT_ID}"

mkdir -p "${SEED_DIR}"

if [ "${SEED_ON_START}" = "true" ] || [ ! -f "${SEED_METADATA}" ]; then
  echo "Seeding admin-only local dataset into ${SEED_DIR}..."
  npx firebase-tools emulators:exec \
    --project "${PROJECT_ID}" \
    --only firestore,auth \
    --export-on-exit="${SEED_DIR}" \
    "npm run seed:local:admin -w functions"
fi

echo "Building Firebase Functions..."
npm run build -w functions

echo "Starting Firebase emulators..."
exec npx firebase-tools emulators:start \
  --project "${PROJECT_ID}" \
  --only functions,firestore,auth \
  --import="${SEED_DIR}" \
  --export-on-exit="${SEED_DIR}"
