#!/usr/bin/env python3
"""Rutex Runner — the Director's shell on this machine.

Polls your Rutex project for `run_cli` work the brain queued, executes
it in a subprocess, and posts structured results back. Same protocol as
the companions (pair, poll, complete, heartbeat), same gates (enabled
flag, revoke, ask-every-time). The ONLY thing it runs is shell commands,
and the refusal list below is checked before anything executes.

Stdlib only — no pip install. Python 3.9+.

First run asks for two things (saved to config.json beside this file):
  1. Supabase URL  (https://<ref>.supabase.co)
  2. Device secret (Director > Computers > Pair, platform Runner;
     shown ONCE there — paste it here)
Then it polls every 2.5s. Ctrl-C stops everything instantly.
"""

import json
import os
import re
import subprocess
import sys
import time
import urllib.request

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
POLL_MS = 2500
DEFAULT_TIMEOUT = 60
MAX_TIMEOUT = 300
OUTPUT_CAP = 32 * 1024

# Refused before execution, no exceptions. Patterns match on the
# lowercased command with extra whitespace collapsed.
REFUSED = [
    (r":\(\)\s*\{", "fork bomb"),
    (r"\brm\s+(-[a-z]*r[a-z]*\s+)+/\s*( |$)", "recursive delete of /"),
    (r"\brm\s+(-[a-z]*r[a-z]*\s+)+~([/ ]|$)", "recursive delete of home"),
    (r"\brm\s+(-[a-z]*r[a-z]*\s+)+\.\s*$", "recursive delete of ."),
    (r"\bmkfs\b", "filesystem format"),
    (r"\bdd\s+.*of=/dev/", "raw disk write"),
    (r"\b(shutdown|reboot|halt|poweroff|init\s+[06])\b", "power control"),
    (r"\bstop-computer\b|\brestart-computer\b", "power control"),
    (r"\bformat\s+[a-z]:", "disk format"),
    (r"\bdiskpart\b", "disk partitioning"),
    (r"\brd\s+/s", "recursive Windows delete"),
    (r"\bdel\s+/f\s+/s", "force Windows delete"),
    (r"\breg\s+delete\b", "registry delete"),
    (r"\\windows\\system32", "system directory target"),
    (r"c:\\windows", "system directory target"),
]
REFUSED_COMPILED = [(re.compile(p), why) for p, why in REFUSED]


def fail(msg):
    return False, None, msg[:300]


def check_refused(command):
    norm = " ".join(command.lower().split())
    for pattern, why in REFUSED_COMPILED:
        if pattern.search(norm):
            return why
    return None


def run_cli(args):
    command = args.get("command", "")
    if not isinstance(command, str) or not command.strip():
        return fail("no command given")
    if len(command) > 4000:
        return fail("command too long (4000 char cap)")
    why = check_refused(command)
    if why:
        return fail("refused (%s) — ask the owner to run it themselves" % why)
    try:
        timeout = args.get("timeout", DEFAULT_TIMEOUT)
        timeout = max(5, min(int(timeout), MAX_TIMEOUT))
    except (TypeError, ValueError):
        timeout = DEFAULT_TIMEOUT
    try:
        proc = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout,
            errors="replace",
        )
    except subprocess.TimeoutExpired as e:
        out = (e.stdout or "")[-OUTPUT_CAP:]
        err = (e.stderr or "")[-OUTPUT_CAP:]
        return True, {
            "exit_code": None,
            "timed_out": True,
            "stdout": out,
            "stderr": (err + "\n[TIMEOUT after %ss]" % timeout)[-OUTPUT_CAP:],
        }, None
    except Exception as e:
        return fail("could not start: %s" % str(e).split("\n")[0][:160])
    stdout = proc.stdout[-OUTPUT_CAP:]
    stderr = proc.stderr[-OUTPUT_CAP:]
    return True, {
        "exit_code": proc.returncode,
        "stdout": stdout,
        "stderr": stderr,
        "truncated": len(proc.stdout) > OUTPUT_CAP or len(proc.stderr) > OUTPUT_CAP,
    }, None


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
            print("link error (retrying): %s" % str(e).split("\n")[0][:160])
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
    print("Rutex Runner — first run.")
    url = input("Supabase URL (https://<ref>.supabase.co): ").strip().rstrip("/")
    secret = input("Device secret (Director > Computers > Pair, shown once): ").strip()
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
    print("Saved. Starting shell hands — Ctrl-C stops everything.")
    return cfg


def main():
    cfg = load_config() or first_run()
    if cfg is None:
        return 1
    link = Link(cfg["supabase_url"], cfg["device_secret"])
    print("Shell hands live. Polling every %sms — Ctrl-C stops everything."
          % cfg.get("poll_ms", POLL_MS))
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
                    if tool == "run_cli":
                        ok, result, error = run_cli(cmd.get("args") or {})
                    else:
                        ok, result, error = fail("runner only runs run_cli (got %s)" % tool[:40])
                    link.complete(cmd.get("id", ""), ok, result, error)
                    print("  done" if ok else "  FAILED: %s" % error, flush=True)
            except Exception as e:
                print("loop error (retrying): %s" % str(e).split("\n")[0][:160], flush=True)
            time.sleep(cfg.get("poll_ms", POLL_MS) / 1000.0)
    except KeyboardInterrupt:
        print("\nStopped. Nothing left running.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
