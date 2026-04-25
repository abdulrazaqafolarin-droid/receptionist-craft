#!/usr/bin/env python3
"""
Atomic platform audit: codebase, database, cloud config, routing, deployment readiness.
Produces docs/PLATFORM_ATOMIC_AUDIT.md
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOC_OUT = ROOT / "docs" / "PLATFORM_ATOMIC_AUDIT.md"


@dataclass
class Finding:
    area: str
    severity: str
    title: str
    detail: str
    fix: str


def find_remote_imports() -> list[str]:
    results: list[str] = []
    for path in (ROOT / "supabase" / "functions").rglob("*.ts"):
        text = path.read_text(encoding="utf-8", errors="ignore")
        if "https://deno.land" in text or "https://esm.sh" in text:
            results.append(str(path.relative_to(ROOT)))
    return sorted(results)


def find_non_ascii_widget() -> int:
    path = ROOT / "supabase" / "functions" / "widget-chat" / "index.ts"
    if not path.exists():
        return -1
    text = path.read_text(encoding="utf-8", errors="ignore")
    return sum(1 for ch in text if ord(ch) >= 128)


def migration_stats() -> tuple[int, list[str]]:
    mig_dir = ROOT / "supabase" / "migrations"
    files = sorted(p.name for p in mig_dir.glob("*.sql")) if mig_dir.exists() else []
    prefixes = {}
    dupes = []
    for f in files:
        m = re.match(r"^(\d+)_", f)
        if not m:
            continue
        pref = m.group(1)
        prefixes[pref] = prefixes.get(pref, 0) + 1
    for k, v in prefixes.items():
        if v > 1:
            dupes.append(k)
    return len(files), sorted(dupes)


def rls_policy_stats() -> tuple[int, int]:
    enabled = 0
    policies = 0
    for path in (ROOT / "supabase" / "migrations").glob("*.sql"):
        text = path.read_text(encoding="utf-8", errors="ignore").lower()
        enabled += text.count("enable row level security")
        policies += text.count("create policy")
    return enabled, policies


def app_route_stats() -> tuple[int, list[str]]:
    app_path = ROOT / "src" / "App.tsx"
    text = app_path.read_text(encoding="utf-8", errors="ignore") if app_path.exists() else ""
    routes = re.findall(r"<Route\s+path=\"([^\"]+)\"", text)
    dupes = sorted({r for r in routes if routes.count(r) > 1})
    return len(routes), dupes


def cloud_findings() -> list[Finding]:
    findings: list[Finding] = []
    vercel = ROOT / "vercel.json"
    if not vercel.exists():
        findings.append(Finding("cloud", "high", "Missing vercel.json", "No deployment rewrite/header config file found.", "Add vercel.json with SPA rewrites and explicit headers."))
        return findings

    data = json.loads(vercel.read_text(encoding="utf-8"))
    headers = data.get("headers", [])
    widget_header = next((h for h in headers if h.get("source") == "/widget"), None)
    if not widget_header:
        findings.append(Finding("cloud", "medium", "Missing /widget headers", "No dedicated /widget frame policy found.", "Add frame-ancestors policy for embeddable widget route."))
    return findings


def main() -> int:
    findings: list[Finding] = []
    deployment_blockers = 0

    remotes = find_remote_imports()
    if remotes:
        deployment_blockers += 1
        findings.append(Finding(
            "deployment", "critical", "Remote imports detected in edge functions",
            f"Remote imports found in {len(remotes)} function files: {', '.join(remotes[:6])}",
            "Bundle or replace remote imports with vendored/local equivalents before deployment.",
        ))

    non_ascii = find_non_ascii_widget()
    if non_ascii > 0:
        findings.append(Finding(
            "deployment", "high", "Non-ASCII characters in widget-chat function",
            f"widget-chat contains {non_ascii} non-ASCII characters that may break strict deploy paths.",
            "Run scripts/prepare_widget_chat_deploy.py before deployment and keep source ASCII-safe.",
        ))

    mig_count, dupes = migration_stats()
    enabled_count, policy_count = rls_policy_stats()
    if dupes:
        findings.append(Finding(
            "database", "high", "Duplicate migration timestamps",
            f"Duplicate migration prefixes detected: {', '.join(dupes)}",
            "Rename duplicate migration files so timestamps are unique and deterministic.",
        ))

    route_count, route_dupes = app_route_stats()
    if route_dupes:
        findings.append(Finding(
            "routing", "medium", "Duplicate route paths in App.tsx",
            f"Duplicate routes found: {', '.join(route_dupes)}",
            "Consolidate duplicate routes or document intentional overlaps.",
        ))

    findings.extend(cloud_findings())

    if not findings:
        findings.append(Finding(
            "overall", "low", "No blocking findings detected by static audit",
            "Static checks passed for configured rules.",
            "Continue with live E2E and observability checks after each deployment.",
        ))

    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    findings.sort(key=lambda f: severity_order.get(f.severity, 9))

    lines = [
        "# Platform Atomic Audit",
        "",
        "Generated by `scripts/platform_atomic_audit.py`.",
        "",
        "## Coverage",
        f"- Edge function remote import scan: {'issues found' if remotes else 'clean'}",
        f"- widget-chat non-ASCII count: {non_ascii if non_ascii >= 0 else 'missing file'}",
        f"- Migration files: {mig_count}",
        f"- RLS mentions: enabled={enabled_count}, policies={policy_count}",
        f"- Route declarations in App.tsx: {route_count}",
        "",
        "## Findings",
    ]

    for i, f in enumerate(findings, start=1):
        lines.extend([
            f"### {i}. [{f.severity.upper()}] {f.title}",
            f"- Area: {f.area}",
            f"- Detail: {f.detail}",
            f"- Recommended fix: {f.fix}",
            "",
        ])

    DOC_OUT.parent.mkdir(parents=True, exist_ok=True)
    DOC_OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {DOC_OUT.relative_to(ROOT)} with {len(findings)} finding(s).")
    if deployment_blockers:
        print(f"FAIL: {deployment_blockers} deployment blocker(s) detected.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
