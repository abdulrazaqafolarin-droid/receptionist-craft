#!/usr/bin/env python3
"""
Termux-friendly widget-chat smoke test.

Usage:
  ANON_KEY=... RECEPTIONIST_ID=... python scripts/e2e_widget_chat_smoke.py
Optional:
  PROJECT_REF=esvrhnlwquunsdduvbnr
  SUPABASE_URL=https://<project-ref>.supabase.co
  E2E_MESSAGES_JSON='["hi","i want booking", ...]'
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from typing import Any


def env(name: str, default: str | None = None) -> str:
    value = os.getenv(name, default)
    if value is None or value == "":
        print(f"ERROR: Set {name} environment variable.", file=sys.stderr)
        sys.exit(1)
    return value


def parse_project_ref_from_jwt(token: str) -> str | None:
    parts = token.split(".")
    if len(parts) != 3:
        return None
    payload = parts[1]
    payload += "=" * ((4 - len(payload) % 4) % 4)
    try:
        decoded = base64.urlsafe_b64decode(payload.encode("utf-8")).decode("utf-8")
        data = json.loads(decoded)
    except Exception:
        return None
    ref = data.get("ref")
    return ref if isinstance(ref, str) and ref else None


def resolve_base_url(anon_key: str) -> str:
    explicit_url = os.getenv("SUPABASE_URL", "").strip()
    if explicit_url:
        return explicit_url.rstrip("/") + "/functions/v1/widget-chat"

    explicit_ref = os.getenv("PROJECT_REF", "").strip()
    if explicit_ref:
        return f"https://{explicit_ref}.supabase.co/functions/v1/widget-chat"

    inferred_ref = parse_project_ref_from_jwt(anon_key)
    if inferred_ref:
        print(f"INFO: Inferred PROJECT_REF from ANON_KEY: {inferred_ref}", file=sys.stderr)
        return f"https://{inferred_ref}.supabase.co/functions/v1/widget-chat"

    default_ref = "esvrhnlwquunsdduvbnr"
    print(
        f"WARN: Could not infer PROJECT_REF from ANON_KEY, defaulting to {default_ref}.",
        file=sys.stderr,
    )
    return f"https://{default_ref}.supabase.co/functions/v1/widget-chat"


def get_messages() -> list[str]:
    override = os.getenv("E2E_MESSAGES_JSON", "").strip()
    if not override:
        return [
            "",
            "Hello, I'd like to book an appointment",
            "Tomorrow afternoon works",
            "My name is Smoke Test",
        ]
    try:
        messages = json.loads(override)
        if isinstance(messages, list) and all(isinstance(m, str) for m in messages) and len(messages) >= 4:
            return messages[:4]
    except Exception:
        pass
    print("ERROR: E2E_MESSAGES_JSON must be a JSON array of at least 4 strings.", file=sys.stderr)
    sys.exit(1)


ANON_KEY = env("ANON_KEY")
RECEPTIONIST_ID = env("RECEPTIONIST_ID")
BASE_URL = resolve_base_url(ANON_KEY)
SESSION_ID = f"smoke-{int(time.time())}"
MESSAGES = get_messages()


def call_widget(message: str) -> dict[str, Any]:
    payload = {
        "receptionistId": RECEPTIONIST_ID,
        "sessionId": SESSION_ID,
        "source": "widget",
        "message": message,
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        BASE_URL,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {ANON_KEY}",
        },
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"_raw": raw}


def run_step(label: str, message: str) -> dict[str, Any]:
    print(label, file=sys.stderr)
    try:
        result = call_widget(message)
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        print(f"HTTP ERROR: {exc.code} {exc.reason}\n{error_body}", file=sys.stderr)
        raise
    except urllib.error.URLError as exc:
        print(f"NETWORK ERROR: {exc.reason}", file=sys.stderr)
        raise
    preview = json.dumps(result)[:500]
    print(preview)
    return result


def has_reply(result: dict[str, Any]) -> bool:
    reply = result.get("reply")
    return isinstance(reply, str) and bool(reply.strip())


def main() -> int:
    print(f"INFO: Target endpoint: {BASE_URL}", file=sys.stderr)
    try:
        r1 = run_step("[1/4] greeting-store", MESSAGES[0])
        r2 = run_step("[2/4] initial user message", MESSAGES[1])
        r3 = run_step("[3/4] follow-up message", MESSAGES[2])
        r4 = run_step("[4/4] state continuity check", MESSAGES[3])
    except Exception:
        return 2

    if any(not has_reply(r) for r in [r2, r3, r4]):
        print("FAIL: Missing non-empty reply in one or more turns.", file=sys.stderr)
        return 1

    print("PASS: widget-chat returned non-empty replies across multi-turn smoke flow")
    if not has_reply(r1):
        print("WARN: greeting-store step returned empty reply (may be expected for some configs).", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
