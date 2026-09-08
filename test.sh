#!/usr/bin/env sh
# jsd local test entry: install, build, then run the javac round-trip suite.
# Requires `node` (>=20), `javac` and `java` on PATH.
#
# Usage:
#   ./test.sh                 # run all fixtures
#   ./test.sh SyncShapes TWR  # run fixtures whose name matches any substring
set -e
cd "$(dirname "$0")"

npm install
npm run build
npm run test:unit
node test/run-e2e.mjs "$@"
node test/run-e2e.mjs --no-debug "$@"
