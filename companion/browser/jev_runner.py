#!/usr/bin/env python3
"""Rutex browser lane — Jev's eyes and hands, the Director's goals.

Polls your Rutex project for `browse_task` work the brain queued and
runs the absorbed jev-ultrafast loop toward it: fresh indexed element
table every observation, one TypeSafe decision per round trip, act,
re-observe, until DONE, BLOCKED, or the caps below. Results go back
with the step history so the brain sees what actually happened.

Needs (local .env beside this file — never the repo):
  TYPESAFE_API_KEY   per-step decisions (the fast brain)
  TEXT_MODEL_API_KEY typing values (OpenAI-compatible helper)
  TEXT_MODEL_BASE_URL + TEXT_MODEL (+ TEXT_MODEL_REASONING=none)

Refusals, checked before the browser even opens: logins, passwords,
payments, checkouts — those need the owner, never the loop. Anything
else the loop itself can mark BLOCKED with its reason.

Stdlib here + the vendored jev package + browser-harness/httpx
(pip install browser-harness httpx). Python 3.12+.
Ctrl-C stops everything instantly.
"""

import json
import os
import re
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

CONFIG_PATH = os.path.join(HERE, "config.json")
POLL_MS = 2500
WALL_CLOCK_S = 360
STEP_CAP = 40

REFUSE_GOAL = re.compile(
    r"log\s*[\-\s]*in|sign\s*[\-\s]*in|password|passcode|pay(ment|ing)?|checkout|credit\s*card|2fa|otp|verify.*(code|identity)",
    re.I,
)

from third_party.jev_ultrafast.agent import Agent  # noqa: E402


def fail(msg):
    return False, None, msg[:300]


def load_dotenv():
    path = os.path.join(HERE, ".env")
    try:
        with open(path, encoding="utf-8") as f:
            for line in f.read().splitlines():
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())
    except OSError:
        pass


class Link:
    def __init__(self, base, secret):
        self.endpoint = base.rstrip("/") + "/functions/v1/companion-link"
        self.secret = secret

    def call(self, body, timeout=70):
        data = json.dumps(body).encode()
        req = urllib.request.Request(
            self.endpoint, data=data,
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + self.secret},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                if r.status != 200:
                    return None
                return json.loads(r.read().decode())
        except Exception as e:
            print("link error (retrying): %s" % str(e).split("\n")[0][:160], flush=True)
            return None

    def poll(self):
        res = self.call({"action": "poll"})
        if not res or not isinstance(res.get("command"), dict):
            return None
        return res["command"]

    def complete(self, cmd_id, ok, result, error):
        self.call({"action": "complete", "command_id": cmd_id, "ok": ok,
                   "result": result, "error": error})

    def heartbeat(self):
        self.call({"action": "heartbeat"})


def run_task(args):
    goal = args.get("goal", "")
    url = args.get("url", "")
    if not isinstance(goal, str) or not goal.strip():
        return fail("no goal given")
    if not isinstance(url, str) or not url.strip():
        return fail("no start url given")
    if REFUSE_GOAL.search(goal):
        return fail("refused (logins and payments need the owner) — never the loop")
    if not os.environ.get("TYPESAFE_API_KEY"):
        return fail("no TYPESAFE_API_KEY in the runner .env")
    goal = goal.strip()[:1000]
    url = url.strip()[:2000]
    started = time.time()
    steps = 0
    outcome = "blocked"
    final_url = url
    trail = []
    try:
        with Agent(url, goal) as agent:
            for snap in agent.run():
                steps += 1
                hist = snap.get("history", [])
                if hist:
                    last = hist[-1]
                    trail.append("%s: %s" % (last.get("kind", "?"), str(last.get("action", ""))[:100]))
                final_url = snap.get("page", {}).get("url", final_url) if isinstance(snap.get("page"), dict) else final_url
                if snap.get("status") in ("done", "blocked"):
                    outcome = snap["status"]
                    break
                if steps >= STEP_CAP or time.time() - started > WALL_CLOCK_S:
                    outcome = "blocked"
                    trail.append("runner caps: %d steps / %ds wall clock" % (STEP_CAP, WALL_CLOCK_S))
                    break
    except Exception as e:
        return True, {
            "outcome": "blocked",
            "url": final_url,
            "steps": steps,
            "note": "loop crashed, nothing executed blind: %s" % str(e).split("\n")[0][:200],
            "trail": trail[-10:],
        }, None
    ok = outcome == "done"
    # Jev's own rule, kept: a DONE choice is not proof of success.
    # The trail lets the brain verify the outcome independently.
    return True, {
        "outcome": outcome,
        "url": final_url,
        "steps": steps,
        "trail": trail[-15:],
    }, None if ok else "loop ended blocked — see trail"


def load_config():
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            cfg = json.load(f)
        if cfg.get("supabase_url") and (cfg.get("device_secret") or "").startswith("rcd_"):
            return cfg
    except (OSError, ValueError):
        pass
    return None


def first_run():
    print("Rutex browser lane — first run.")
    url = input("Supabase URL (https://<ref>.supabase.co): ").strip().rstrip("/")
    secret = input("Device secret (Director > Computers > Pair platform Browser, shown once): ").strip()
    if not url.startswith("http") or not secret.startswith("rcd_"):
        print("Need both values — run me again when you have them.")
        return None
    cfg = {"supabase_url": url, "device_secret": secret, "poll_ms": POLL_MS}
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
    try:
        os.chmod(CONFIG_PATH, 0o600)
    except OSError:
        pass
    print("Saved. Put TYPESAFE_API_KEY (+TEXT keys) in .env beside me, then run again.")
    return cfg


def main():
    load_dotenv()
    cfg = load_config() or first_run()
    if cfg is None:
        return 1
    link = Link(cfg["supabase_url"], cfg["device_secret"])
    print("Browser lane live. Polling every %sms — Ctrl-C stops everything."
          % cfg.get("poll_ms", POLL_MS), flush=True)
    last_beat = 0.0
    try:
        while True:
            try:
                if time.time() - last_beat > 60:
                    last_beat = time.time()
                    link.heartbeat()
                cmd = link.poll()
                if cmd:
                    tool = cmd.get("tool", "")
                    print("[%s] %s" % (time.strftime("%H:%M:%S"), tool), flush=True)
                    if tool == "browse_task":
                        ok, result, error = run_task(cmd.get("args") or {})
                    else:
                        ok, result, error = fail("browser lane only runs browse_task (got %s)" % str(tool)[:40])
                    link.complete(cmd.get("id", ""), ok, result, error)
                    print("  done" if ok else "  FAILED: %s" % error, flush=True)
            except Exception as e:
                print("loop error (retrying): %s" % str(e).split("\n")[0][:160], flush=True)
            time.sleep(cfg.get("poll_ms", POLL_MS) / 1000.0)
    except KeyboardInterrupt:
        print("\nStopped. Browser closed, nothing left running.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
