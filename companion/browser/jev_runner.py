#!/usr/bin/env python3
"""Rutex browser lane — Jev's eyes and hands, the Director's judgment.

Polls your Rutex project for `browse_task` work the brain queued and
runs it in a real browser: fresh indexed element table every look
(absorbed snapshot.js), one brain decision per step (director-decide —
no model keys anywhere on this machine), act, re-observe, until DONE,
BLOCKED, or the caps below. Two modes: loop (messy tasks, decide
every step) and plan (simple flows, one full step list, stop on
mismatch and ask again).

Needs nothing but Python 3.12 + browser-harness + httpx here, and a
Chromium to drive. Pairing secret in config.json (never the repo);
file box in ./filebox for uploads and downloads.

Refusals, checked before the browser even opens: logins, passwords,
payments, checkouts. Ctrl-C stops everything instantly.
"""

import json
import os
import re
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
FILEBOX = os.path.join(HERE, "filebox")

CONFIG_PATH = os.path.join(HERE, "config.json")
POLL_MS = 2500
WALL_CLOCK_S = 360
STEP_CAP = 40
PLAN_STEP_CAP = 20
PLAN_STEP_CAP = 20

REFUSE_GOAL = re.compile(
    r"log\s*[\-\s]*in|sign\s*[\-\s]*in|password|passcode|pay(ment|ing)?|checkout|credit\s*card|2fa|\botp\b|verify.*(code|identity)",
    re.I,
)

from third_party.jev_ultrafast.browser import Browser, StalePage  # noqa: E402
from third_party.jev_ultrafast.model import action_space  # noqa: E402


def fail(msg):
    return False, None, msg[:300]


class Link:
    def __init__(self, base, secret):
        self.base = base.rstrip("/")
        self.secret = secret

    def call(self, path, body, timeout=70):
        data = json.dumps(body).encode()
        req = urllib.request.Request(
            self.base + path, data=data,
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
        res = self.call("/functions/v1/companion-link", {"action": "poll"})
        if not res or not isinstance(res.get("command"), dict):
            return None
        return res["command"]

    def complete(self, cmd_id, ok, result, error):
        self.call("/functions/v1/companion-link",
                  {"action": "complete", "command_id": cmd_id, "ok": ok,
                   "result": result, "error": error})

    def heartbeat(self):
        self.call("/functions/v1/companion-link", {"action": "heartbeat"})

    def decide(self, goal, url, table, history, mode):
        res = self.call("/functions/v1/director-decide",
                        {"goal": goal, "url": url, "table": table,
                         "history": history, "mode": mode}, timeout=75)
        if not res or not res.get("ok"):
            err = (res or {}).get("error", "brain unreachable")
            return None, str(err)[:200]
        return res.get("decision"), None


def table_text(elements):
    lines = []
    for el in elements:
        ops = ",".join(el.get("operations", []))
        lines.append("[%s] %s | %s" % (el.get("index", "?"), ops, el.get("label", "")[:80]))
        for opt in el.get("options", [])[:8]:
            lines.append("    %s %s" % (opt.get("index", "?"), str(opt.get("label", ""))[:60]))
    return "\n".join(lines)[:6000]


def index_map(targets):
    out = {}
    for group in targets.values():
        for idx, action in group.items():
            out[idx] = action
    return out


def box_files():
    try:
        return set(os.listdir(FILEBOX))
    except OSError:
        return set()


def run_task(link, args):
    goal = args.get("goal", "")
    url = args.get("url", "")
    mode = args.get("mode", "loop")
    if not isinstance(goal, str) or not goal.strip():
        return fail("no goal given")
    if not isinstance(url, str) or not url.strip():
        return fail("no start url given")
    if mode not in ("loop", "plan"):
        mode = "loop"
    if REFUSE_GOAL.search(goal):
        return fail("refused (logins and payments need the owner) — never the loop")
    goal = goal.strip()[:1000]
    url = url.strip()[:2000]
    os.makedirs(FILEBOX, exist_ok=True)

    trail = []
    steps = 0
    outcome = "blocked"
    final_url = url
    downloads = []
    started = time.time()
    browser = None
    try:
        browser = Browser(url)
    except Exception as e:
        return fail("browser would not start: %s" % str(e).split("\n")[0][:160])

    def note(s):
        trail.append(s[:160])
        print("  " + s[:160], flush=True)

    try:
        try:
            browser.call("Page.setDownloadBehavior", behavior="allow", downloadPath=FILEBOX)
        except Exception:
            pass
        seen_files = box_files()

        def snap():
            pg = browser.observe(screenshot=False)
            els, tgs, _controls = action_space(pg.get("actions", []))
            return pg, els, tgs

        def observe():
            page = browser.observe(screenshot=False)
            elements, targets, _controls = action_space(page.get("actions", []))
            return page, elements, targets

        def download_check():
            now = box_files() - seen_files
            fresh = sorted(now)
            for f in fresh:
                note("downloaded: %s" % f[:80])
                downloads.append(f[:80])
            return fresh

        def do_upload(action, filename):
            if not filename or "/" in filename or "\\" in filename or filename.startswith("."):
                return fail("upload needs a plain filename from the file box")[1]
            path = os.path.join(FILEBOX, filename)
            if not os.path.isfile(path):
                return "file not in the box: %s" % filename[:60]
            node = action.get("node")
            if not isinstance(node, int):
                return "upload target lost its element"
            probe = browser.call(
                "Runtime.evaluate",
                expression="(n) => { const e = window.__jevFast && window.__jevFast.nodes.get(n);"
                           " if (!e || !e.isConnected) return null;"
                           " const r = e.getBoundingClientRect();"
                           " if (!r.width || !r.height) return null; return true; }",
                arguments=[{"value": node}],
                returnByValue=True,
            )
            if not probe or not probe.get("result", {}).get("value"):
                return "upload target not interactable right now"
            ref = browser.call(
                "Runtime.evaluate",
                expression="(n) => window.__jevFast.nodes.get(n)",
                arguments=[{"value": node}],
                returnByValue=False,
            )
            obj_id = (ref.get("result") or {}).get("objectId")
            if not obj_id:
                return "upload target not resolvable"
            node_id = browser.call("DOM.requestNode", objectId=obj_id).get("nodeId")
            if not node_id:
                return "upload target not resolvable"
            try:
                browser.call("DOM.setFileInputFiles", nodeId=node_id, files=[path])
            except Exception as e:
                return "upload failed: %s" % str(e).split("\n")[0][:120]
            return None

        def execute(decision, page, by_index):
            op = decision.get("operation")
            if op in ("DONE", "BLOCKED"):
                return ("terminal", decision.get("reason", ""))
            if op in ("SCROLL_UP", "SCROLL_DOWN"):
                browser.call("Input.dispatchMouseEvent", type="mouseWheel",
                             x=550, y=400, deltaX=0, deltaY=-500 if op == "SCROLL_UP" else 500)
                return ("acted", "scrolled")
            if op == "WAIT":
                time.sleep(2)
                return ("acted", "waited")
            if op == "UPLOAD":
                action = by_index.get(str(decision.get("target", "")))
                if not action:
                    return ("stale", "upload target gone")
                err = do_upload(action, str(decision.get("filename", "")))
                if err:
                    return ("failed", err)
                return ("acted", "uploaded")
            action = by_index.get(str(decision.get("target", "")))
            if not action:
                return ("stale", "target gone from the table")
            text = decision.get("text") if op == "TYPE_TEXT" else None
            if op == "TYPE_TEXT" and not isinstance(text, str):
                return ("failed", "no text supplied")
            try:
                browser.act(action, page, text=text)
            except Exception as e:
                if isinstance(e, StalePage) or "StalePage" in type(e).__name__:
                    return ("stale", "page changed under us")
                return ("failed", str(e).split("\n")[0][:160])
            return ("acted", action.get("label", op)[:100])

        # Observe once up front; the loop below re-observes every step.
        page, elements, targets = snap()
        plan_steps = None
        if mode == "plan":
            decision, err = link.decide(goal, page.get("url", url), table_text(elements), [], "plan")
            if err or not decision or not isinstance(decision.get("plan"), list):
                return True, {
                    "outcome": "blocked", "url": page.get("url", url), "steps": 0,
                    "note": err or "plan came back unusable — ask again in loop mode",
                    "trail": [], "downloads": [],
                }, None
            plan_steps = [s for s in decision["plan"] if isinstance(s, dict)][:PLAN_STEP_CAP]
            note("plan: %d steps" % len(plan_steps))

        while time.time() - started < WALL_CLOCK_S and steps < STEP_CAP:
            if mode == "plan" and plan_steps is not None and steps < len(plan_steps):
                decision = plan_steps[steps]
            else:
                if mode == "plan":
                    break
                decision, err = link.decide(
                    goal, page.get("url", url), table_text(elements),
                    ["%d. %s" % (i + 1, t) for i, t in enumerate(trail[-10:])], "loop")
                if err or not isinstance(decision, dict):
                    note("brain unreachable (%s), retrying next step" % (err or "?"))
                    time.sleep(5)
                    page, elements, targets = snap()
                    continue
            op = decision.get("operation")
            if op == "DONE":
                outcome = "done"
                break
            if op == "BLOCKED":
                note("blocked: %s" % str(decision.get("reason", ""))[:120])
                break
            by_index = index_map(targets)
            status, info = execute(decision, page, by_index)
            steps += 1
            if status == "stale":
                note("stale (%s) — re-observing" % info)
                if mode == "plan":
                    note("plan diverged — stopping, ask again")
                    break
            elif status == "failed":
                note("failed: %s" % info)
                if mode == "plan":
                    break
            else:
                note("%s" % info)
            download_check()
            page, elements, targets = snap()
            final_url = page.get("url", final_url)

        download_check()
        ok = outcome == "done"
        return True, {
            "outcome": outcome,
            "url": final_url,
            "steps": steps,
            "trail": trail[-15:],
            "downloads": downloads,
        }, None if ok else "loop ended %s — see trail" % outcome
    finally:
        try:
            browser.close()
        except Exception:
            pass


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
    print("Saved. Polling for browse_task — Ctrl-C stops everything.")
    return cfg


def main():
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
                        ok, result, error = run_task(link, cmd.get("args") or {})
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
