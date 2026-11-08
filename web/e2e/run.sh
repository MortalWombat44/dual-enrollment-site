#!/bin/bash
# End-to-end tests (Playwright). Builds the app, then runs each test against its own fresh, seeded
# database on http://localhost:3100 with demo accounts on.
# Usage: e2e/run.sh              (all tests)
#        e2e/run.sh 6 18         (just e2e6.js and e2e18.js)
#        SKIP_BUILD=1 e2e/run.sh (reuse the last build)
set -e
cd "$(dirname "$0")/.."
E2E=e2e
mkdir -p $E2E/shots
[ -z "$SKIP_BUILD" ] && npx next build > $E2E/build.log 2>&1 || { [ -z "$SKIP_BUILD" ] && { tail -40 $E2E/build.log; exit 1; }; }

fresh() {
  pkill -f "next start -p 3100" 2>/dev/null || true; pkill -f next-server 2>/dev/null || true; sleep 1
  rm -rf data
  (SHOW_DEMO_ACCOUNTS=1 npx next start -p 3100 > $E2E/server.log 2>&1 &)
  for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:3100/login && return; sleep 1; done
  echo "server did not start"; tail -20 $E2E/server.log; exit 1
}
run() { # each test gets a fresh database; files a test writes (like signed-form.pdf) stay
  for t in "$@"; do
    fresh; echo "=== e2e$t"
    node $E2E/e2e$t.js || { echo "FAILED: e2e$t.js (server log: $E2E/server.log)"; exit 1; }
  done
}

if [ $# -gt 0 ]; then run "$@"
else
  # Order matters: e2e13 writes signed-form.pdf, which 15, 17, 21 and 22 use.
  run 2 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26
fi
pkill -f next-server 2>/dev/null || true
echo "ALL E2E TESTS PASSED"
