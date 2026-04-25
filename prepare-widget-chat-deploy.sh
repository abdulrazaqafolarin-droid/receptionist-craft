#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$SCRIPT_DIR/scripts/prepare-widget-chat-deploy.sh"

if [[ ! -f "$TARGET" ]]; then
  echo "ERROR: Cannot find $TARGET"
  echo "Run this command from the repository root, or provide full repo path."
  exit 1
fi

if [[ ! -x "$TARGET" ]]; then
  chmod +x "$TARGET"
fi

exec "$TARGET" "$@"
