#!/usr/bin/env python3
"""E2E validator for growth/automation behaviors.

Covers:
1) auto-switch correctness with hysteresis rules
2) interval analytics continuity across all windows
3) automation execution + dedupe behavior
4) single/multi selector correctness
5) KPI success on target families
6) deploy-time smoke checks + post-deploy live checks

All endpoints are configurable via environment variables so this can be used
across staging and production deployments.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


def env(name: str, default: str | None = None, required: bool = False) -> str:
    value = os.getenv(name, default)
    if required and (value is None or value.strip() == ""):
        print(f"ERROR: missing required env var: {name}", file=sys.stderr)
        raise SystemExit(2)
    return (value or "").strip()


BASE_URL = env("E2E_BASE_URL", required=True).rstrip("/")
ANON_KEY = env("E2E_ANON_KEY", required=True)
TIMEOUT_SECONDS = int(env("E2E_TIMEOUT_SECONDS", "45"))

# Endpoint paths (override as needed)
AUTO_SWITCH_PATH = env("E2E_AUTO_SWITCH_PATH", "/functions/v1/auto-switch-evaluate")
INTERVAL_ANALYTICS_PATH = env("E2E_INTERVAL_ANALYTICS_PATH", "/functions/v1/interval-analytics")
AUTOMATION_EXEC_PATH = env("E2E_AUTOMATION_EXEC_PATH", "/functions/v1/automation-execute")
SELECTOR_PATH = env("E2E_SELECTOR_PATH", "/functions/v1/selector-resolve")
KPI_PATH = env("E2E_KPI_PATH", "/functions/v1/kpi-summary")
LIVE_HEALTH_PATH = env("E2E_LIVE_HEALTH_PATH", "/functions/v1/live-health")

SINGLE_SELECTOR_ID = env("E2E_SINGLE_SELECTOR_ID", required=True)
MULTI_SELECTOR_IDS = [x.strip() for x in env("E2E_MULTI_SELECTOR_IDS", required=True).split(",") if x.strip()]

WINDOWS = [x.strip() for x in env("E2E_WINDOWS", "5m,15m,1h,24h,7d,30d").split(",") if x.strip()]
TARGET_FAMILIES = [
    x.strip() for x in env(
        "E2E_KPI_FAMILIES",
        "conversion,revenue,leak_reduction,lead_capture,no_show",
    ).split(",") if x.strip()
]
MIN_SUCCESS_RATE = float(env("E2E_MIN_SUCCESS_RATE", "0.90"))
LIVE_CHECK_LOOPS = int(env("E2E_LIVE_CHECK_LOOPS", "3"))
LIVE_CHECK_SLEEP_SECONDS = int(env("E2E_LIVE_CHECK_SLEEP_SECONDS", "20"))


@dataclass
class CheckResult:
    name: str
    ok: bool
    details: str


def post_json(path: str, payload: dict[str, Any]) -> tuple[int, Any]:
    url = f"{BASE_URL}{path}"
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {ANON_KEY}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
            raw = response.read().decode("utf-8", errors="replace")
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                data = {"raw": raw}
            return response.status, data
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            data = {"raw": raw}
        return exc.code, data


def get(path: str) -> tuple[int, str]:
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
        return response.status, response.read().decode("utf-8", errors="replace")


def check_deploy_smoke() -> list[CheckResult]:
    checks: list[CheckResult] = []
    for path in ["/", "/analytics", "/builder"]:
        try:
            code, _body = get(path)
            checks.append(CheckResult(f"deploy-smoke {path}", 200 <= code < 400, f"http={code}"))
        except Exception as exc:  # noqa: BLE001
            checks.append(CheckResult(f"deploy-smoke {path}", False, str(exc)))
    return checks


def check_auto_switch_hysteresis() -> CheckResult:
    payload = {
        "samples": [
            {"traffic": 0.59, "latencyMs": 220},
            {"traffic": 0.61, "latencyMs": 240},
            {"traffic": 0.60, "latencyMs": 245},
            {"traffic": 0.58, "latencyMs": 230},
            {"traffic": 0.62, "latencyMs": 250},
        ],
        "expectHysteresis": True,
    }
    code, data = post_json(AUTO_SWITCH_PATH, payload)
    switched = int(data.get("switchCount", -1))
    stable = bool(data.get("hysteresisStable", False))
    ok = code == 200 and stable and 0 <= switched <= 2
    return CheckResult(
        "auto-switch hysteresis",
        ok,
        f"http={code} switchCount={switched} stable={stable}",
    )


def check_interval_analytics_continuity() -> CheckResult:
    continuity_failures: list[str] = []
    for window in WINDOWS:
        code, data = post_json(INTERVAL_ANALYTICS_PATH, {"window": window})
        if code != 200:
            continuity_failures.append(f"{window}:http={code}")
            continue
        points = data.get("points")
        if not isinstance(points, list) or len(points) < 2:
            continuity_failures.append(f"{window}:insufficient_points")
            continue
        previous_end = None
        for p in points:
            start = p.get("start")
            end = p.get("end")
            if not start or not end:
                continuity_failures.append(f"{window}:missing_bounds")
                break
            if previous_end is not None and start < previous_end:
                continuity_failures.append(f"{window}:overlap")
                break
            previous_end = end
    ok = not continuity_failures
    return CheckResult(
        "interval analytics continuity",
        ok,
        "ok" if ok else "; ".join(continuity_failures),
    )


def check_automation_dedupe() -> CheckResult:
    request_id = f"e2e-{int(time.time())}"
    payload = {"requestId": request_id, "action": "optimize_campaign"}
    code1, data1 = post_json(AUTOMATION_EXEC_PATH, payload)
    code2, data2 = post_json(AUTOMATION_EXEC_PATH, payload)

    exec1 = data1.get("executionId")
    exec2 = data2.get("executionId")
    deduped = bool(data2.get("deduped", False))

    ok = code1 == 200 and code2 == 200 and exec1 and exec2 and (deduped or exec1 == exec2)
    return CheckResult(
        "automation execution dedupe",
        ok,
        f"http=({code1},{code2}) exec1={exec1} exec2={exec2} deduped={deduped}",
    )


def check_selector_correctness() -> CheckResult:
    code_single, single = post_json(SELECTOR_PATH, {"selectorIds": [SINGLE_SELECTOR_ID]})
    code_multi, multi = post_json(SELECTOR_PATH, {"selectorIds": MULTI_SELECTOR_IDS})

    single_items = single.get("items") if isinstance(single, dict) else None
    multi_items = multi.get("items") if isinstance(multi, dict) else None

    single_ok = code_single == 200 and isinstance(single_items, list) and len(single_items) == 1
    multi_ok = code_multi == 200 and isinstance(multi_items, list) and len(multi_items) == len(MULTI_SELECTOR_IDS)

    return CheckResult(
        "single/multi selector correctness",
        single_ok and multi_ok,
        f"single_http={code_single} single_count={len(single_items or [])} multi_http={code_multi} multi_count={len(multi_items or [])}",
    )


def check_kpi_families() -> CheckResult:
    failures: list[str] = []
    for family in TARGET_FAMILIES:
        code, data = post_json(KPI_PATH, {"family": family})
        success_rate = float(data.get("successRate", -1.0)) if isinstance(data, dict) else -1.0
        if code != 200 or success_rate < MIN_SUCCESS_RATE:
            failures.append(f"{family}(http={code},successRate={success_rate:.2f})")
    ok = not failures
    return CheckResult("KPI target families", ok, "ok" if ok else ", ".join(failures))


def check_post_deploy_live() -> CheckResult:
    failures: list[str] = []
    for i in range(LIVE_CHECK_LOOPS):
        code, data = post_json(LIVE_HEALTH_PATH, {"probe": i + 1})
        if code != 200:
            failures.append(f"probe{i+1}:http={code}")
        else:
            error_rate = float(data.get("errorRate", 1.0))
            live_events = int(data.get("eventsLast5m", 0))
            if error_rate > 0.05:
                failures.append(f"probe{i+1}:errorRate={error_rate:.2f}")
            if live_events <= 0:
                failures.append(f"probe{i+1}:no_live_events")
        if i < LIVE_CHECK_LOOPS - 1:
            time.sleep(LIVE_CHECK_SLEEP_SECONDS)

    ok = not failures
    return CheckResult("post-deploy live checks", ok, "ok" if ok else "; ".join(failures))


def main() -> int:
    checks: list[CheckResult] = []
    checks.extend(check_deploy_smoke())
    checks.append(check_auto_switch_hysteresis())
    checks.append(check_interval_analytics_continuity())
    checks.append(check_automation_dedupe())
    checks.append(check_selector_correctness())
    checks.append(check_kpi_families())
    checks.append(check_post_deploy_live())

    print("# E2E Validation Report")
    failures = 0
    for result in checks:
        icon = "✅" if result.ok else "❌"
        if not result.ok:
            failures += 1
        print(f"{icon} {result.name}: {result.details}")

    if failures:
        print(f"\nFAILED: {failures} check(s) failed")
        return 1

    print("\nPASS: all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
