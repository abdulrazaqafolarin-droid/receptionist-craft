#!/usr/bin/env python3
"""Diagnose why local changes are not visible on live Vercel deployment."""
from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(cmd: str) -> tuple[int, str]:
    p = subprocess.run(cmd, shell=True, cwd=ROOT, capture_output=True, text=True)
    return p.returncode, (p.stdout + p.stderr).strip()


def ok(label: str, detail: str) -> str:
    return f"✅ {label}: {detail}"


def warn(label: str, detail: str) -> str:
    return f"⚠️ {label}: {detail}"


def fail(label: str, detail: str) -> str:
    return f"❌ {label}: {detail}"


def main() -> int:
    lines: list[str] = []
    blockers = 0

    code, branch = run("git branch --show-current")
    branch = branch.strip()
    if code == 0:
        if branch == "main":
            lines.append(ok("Branch", "currently on main"))
        else:
            blockers += 1
            lines.append(fail("Branch", f"currently on '{branch}', not 'main'"))
    else:
        blockers += 1
        lines.append(fail("Branch", branch))

    code, remotes = run("git remote")
    if code == 0:
        remotes_list = [r for r in remotes.splitlines() if r.strip()]
        if remotes_list:
            lines.append(ok("Git remote", ", ".join(remotes_list)))
        else:
            blockers += 1
            lines.append(fail("Git remote", "no git remote configured in this clone"))
    else:
        blockers += 1
        lines.append(fail("Git remote", remotes))

    code, status = run("git status --short")
    if code == 0:
        if status.strip():
            blockers += 1
            lines.append(fail("Working tree", "has uncommitted changes"))
        else:
            lines.append(ok("Working tree", "clean"))
    else:
        blockers += 1
        lines.append(fail("Working tree", status))

    code, tracking = run("git rev-parse --abbrev-ref --symbolic-full-name @{u}")
    if code == 0:
        lines.append(ok("Upstream", tracking.strip()))
        code2, ahead = run("git rev-list --left-right --count HEAD...@{u}")
        if code2 == 0 and ahead.strip():
            behind_count, ahead_count = ahead.strip().split()
            if int(ahead_count) > 0:
                blockers += 1
                lines.append(fail("Push status", f"{ahead_count} commit(s) ahead of upstream (not pushed)"))
            else:
                lines.append(ok("Push status", "local branch is pushed"))
            if int(behind_count) > 0:
                lines.append(warn("Sync", f"{behind_count} commit(s) behind upstream"))
    else:
        blockers += 1
        lines.append(fail("Upstream", "no upstream branch configured"))

    vercel_json = ROOT / "vercel.json"
    if vercel_json.exists():
        lines.append(ok("vercel.json", "present"))
    else:
        blockers += 1
        lines.append(fail("vercel.json", "missing"))

    vercel_link = ROOT / ".vercel" / "project.json"
    if vercel_link.exists():
        lines.append(ok("Vercel link", ".vercel/project.json present"))
    else:
        lines.append(warn("Vercel link", "no .vercel/project.json in repo clone"))

    code, head = run("git rev-parse --short HEAD")
    if code == 0:
        lines.append(ok("HEAD", head.strip()))

    print("# Deploy Sync Diagnostics\n")
    for line in lines:
        print(line)

    print("\nSummary:")
    if blockers:
        print(f"❌ {blockers} blocking issue(s) detected. Resolve blockers before expecting live Vercel changes.")
    else:
        print("✅ No local git/deploy-sync blockers detected.")

    return 1 if blockers else 0


if __name__ == "__main__":
    raise SystemExit(main())
