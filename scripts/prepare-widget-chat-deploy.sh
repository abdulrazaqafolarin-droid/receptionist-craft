#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT_DIR/supabase/functions/widget-chat/index.ts"
OUT_DIR="$ROOT_DIR/tmp"
ASCII_OUT="$OUT_DIR/widget-chat.ascii.ts"
JSON_OUT="$OUT_DIR/widget-chat.deploy.json"

mkdir -p "$OUT_DIR"

REPO_ROOT="$ROOT_DIR" python - <<'PY'
import json
import os
from pathlib import Path

root = Path(os.environ["REPO_ROOT"])
src = root / "supabase/functions/widget-chat/index.ts"
ascii_out = root / "tmp/widget-chat.ascii.ts"
json_out = root / "tmp/widget-chat.deploy.json"

text = src.read_text(encoding="utf-8")
text = text.replace('\u2018',"'").replace('\u2019',"'")
text = text.replace('\u201c','\"').replace('\u201d','\"')
text = text.replace('\u2013','-').replace('\u2014','--')
text = text.replace('\u2026','...')
cleaned = ''.join(ch if ord(ch) < 128 else ' ' for ch in text)

ascii_out.write_text(cleaned, encoding="utf-8")

payload = {
    "slug": "widget-chat",
    "name": "widget-chat",
    "body": cleaned,
    "verify_jwt": False,
}
json_out.write_text(json.dumps(payload), encoding="utf-8")

print(f"Wrote {ascii_out}")
print(f"Wrote {json_out}")
print(f"Chars: {len(cleaned)}")
PY

echo "Verifying deployment readiness..."
if rg -n "https://deno.land|https://esm.sh" "$ASCII_OUT" >/dev/null; then
  echo "ERROR: Remote import URL still present in widget-chat artifact."
  exit 1
fi

REPO_ROOT="$ROOT_DIR" python - <<'PY'
import os
from pathlib import Path
p = Path(os.environ["REPO_ROOT"]) / 'tmp/widget-chat.ascii.ts'
text = p.read_text(encoding='utf-8')
count = sum(1 for ch in text if ord(ch) >= 128)
print('Non-ASCII chars:', count)
if count != 0:
    raise SystemExit(1)
PY

echo "Ready: $JSON_OUT"
