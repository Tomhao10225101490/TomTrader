#!/bin/sh
# Local foreground runner. Never kills an unrelated process holding the port.
set -eu
cd "$(dirname "$0")/.."
if lsof -nP -iTCP:3100 -sTCP:LISTEN >/dev/null 2>&1; then
  echo 'Port 3100 is in use. Stop your existing TomTrader server before rebuilding.' >&2
  exit 1
fi
if [ "${TT_SKIP_BUILD:-0}" != '1' ]; then npm run build; fi
exec npm run start
