#!/usr/bin/env python3
"""
Release + verify helper for Termux/CLI.

Primary goals:
1) ensure code is pushed to deploy branch
2) optionally trigger deploy webhook
3) optionally verify live URL responds

Env:
- APP_VERIFY_URL=https://your-app.vercel.app/money-mode
- VERCEL_DEPLOY_HOOK_URL=https://api.vercel.com/v1/integrations/deploy/... (optional)
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(cmd: str, check: bool = True) -> str:
    p = subprocess.run(cmd, shell=True, cwd=ROOT, capture_output=True, text=True)
    out = (p.stdout + p.stderr).strip()
    if check and p.returncode != 0:
        raise RuntimeError(f"{cmd}\n{out}")
    return out


def verify_url(url: str) -> tuple[int, str]:
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read().decode("utf-8", errors="ignore")
        return resp.getcode(), body[:800]


def trigger_webhook(hook_url: str) -> dict:
    req = urllib.request.Request(hook_url, method="POST", data=b"{}", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        raw = resp.read().decode("utf-8", errors="ignore")
    try:
        return json.loads(raw) if raw else {}
    except Exception:
        return {"raw": raw[:300]}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--branch", default="main", help="Branch to push to origin")
    parser.add_argument("--skip-push", action="store_true")
    parser.add_argument("--verify-url", default=os.getenv("APP_VERIFY_URL", ""))
    args = parser.parse_args()

    print("== Release Verify ==")
    print("HEAD:", run("git rev-parse --short HEAD", check=False))

    if not args.skip_push:
        remotes = run("git remote", check=False)
        if "origin" not in remotes.split():
            print("ERROR: missing git remote 'origin'. Configure remote first.")
            return 2

        branch = run("git branch --show-current")
        if branch != args.branch:
            print(f"ERROR: on branch '{branch}'. Switch/merge to '{args.branch}' before running this script.")
            return 2

        status = run("git status --short", check=False)
        if status:
            print("ERROR: working tree is dirty. Commit/stash first.")
            return 2

        print(f"Pushing {args.branch} to origin...")
        run(f"git push origin {args.branch}")

    hook_url = os.getenv("VERCEL_DEPLOY_HOOK_URL", "").strip()
    if hook_url:
        print("Triggering Vercel deploy webhook...")
        payload = trigger_webhook(hook_url)
        print("Webhook response:", payload)
    else:
        print("VERCEL_DEPLOY_HOOK_URL not set, skipping deploy trigger.")

    verify_target = args.verify_url.strip()
    if verify_target:
        print(f"Verifying URL: {verify_target}")
        code, preview = verify_url(verify_target)
        print(f"HTTP {code}")
        print(preview.replace("\n", " ")[:300])
    else:
        print("No APP_VERIFY_URL/--verify-url provided, skipping live URL verification.")

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
