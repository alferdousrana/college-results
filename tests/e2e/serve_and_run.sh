#!/usr/bin/env bash
# Builds, serves the production build and runs the browser checks. Usage: bash tests/e2e/serve_and_run.sh
set -e
cd "$(dirname "$0")/../.."
npx vite build >/dev/null
npx vite preview --port 4173 --strictPort >/tmp/crms-preview.log 2>&1 &
PID=$!
trap "kill $PID" EXIT
for i in $(seq 1 30); do curl -s localhost:4173 >/dev/null && break; sleep 0.5; done
python3 tests/e2e/run_e2e.py
