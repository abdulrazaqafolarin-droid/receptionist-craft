#!/usr/bin/env python3
"""
Termux-friendly deploy artifact preparation for analytics.

Usage:
  python scripts/prepare_analytics_deploy.py
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "supabase/functions/analytics/index.ts"
OUT_DIR = ROOT / "tmp"
ASCII_OUT = OUT_DIR / "analytics.ascii.ts"
JSON_OUT = OUT_DIR / "analytics.deploy.json"


def normalize_ascii(text: str) -> str:
    text = text.replace("\u2018", "'").replace("\u2019", "'")
    text = text.replace("\u201c", '"').replace("\u201d", '"')
    text = text.replace("\u2013", "-").replace("\u2014", "--")
    text = text.replace("\u2026", "...")
    return "".join(ch if ord(ch) < 128 else " " for ch in text)


def main() -> int:
    if not SRC.exists():
        print(f"ERROR: missing source file: {SRC}")
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    raw = SRC.read_text(encoding="utf-8")
    cleaned = normalize_ascii(raw)
    ASCII_OUT.write_text(cleaned, encoding="utf-8")

    payload = {
        "slug": "analytics",
        "name": "analytics",
        "body": cleaned,
        "verify_jwt": False,
    }
    JSON_OUT.write_text(json.dumps(payload), encoding="utf-8")

    if "https://deno.land" in cleaned or "https://esm.sh" in cleaned:
        print("ERROR: Remote import URL still present in artifact.")
        return 1

    non_ascii = sum(1 for ch in cleaned if ord(ch) >= 128)
    if non_ascii != 0:
        print(f"ERROR: Non-ASCII chars detected: {non_ascii}")
        return 1

    print(f"Wrote {ASCII_OUT}")
    print(f"Wrote {JSON_OUT}")
    print(f"Chars: {len(cleaned)}")
    print("Ready for deployment payload generation.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
