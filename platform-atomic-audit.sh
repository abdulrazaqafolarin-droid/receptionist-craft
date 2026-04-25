#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
if [ ! -f "scripts/platform_atomic_audit.py" ]; then
  echo "ERROR: scripts/platform_atomic_audit.py not found" >&2
  exit 1
fi
if command -v python3 >/dev/null 2>&1; then
  python3 scripts/platform_atomic_audit.py
else
  python scripts/platform_atomic_audit.py
fi
