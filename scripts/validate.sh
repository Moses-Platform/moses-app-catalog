#!/usr/bin/env bash
# Thin shell wrapper over the Node validator.
# Contributors can run this locally: `bash scripts/validate.sh`.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."

if ! command -v node >/dev/null 2>&1; then
  echo "error: node is required (tested with Node 20)." >&2
  exit 2
fi

if [[ ! -d node_modules ]]; then
  echo "installing catalog toolchain (one-time) ..."
  npm install --no-audit --no-fund --silent
fi

node scripts/validate.mjs "$@"
