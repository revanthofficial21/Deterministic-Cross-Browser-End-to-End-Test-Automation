#!/usr/bin/env bash
# Runs a command with the SUT up, and always tears it down.
set -uo pipefail
PORT="${SUT_PORT:-4173}"
node sut/server.js > /tmp/sut.log 2>&1 &
SUT_PID=$!
for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${PORT}/_health" >/dev/null; then break; fi
  sleep 0.25
done
"$@"; RC=$?
kill "$SUT_PID" 2>/dev/null; wait "$SUT_PID" 2>/dev/null
exit $RC
