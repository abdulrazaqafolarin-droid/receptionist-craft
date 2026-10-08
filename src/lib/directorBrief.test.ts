/**
 * Director briefing + grants gate: lines cite real rows, grants deny by default.
 *
 * Run: deno test --no-check --unstable-sloppy-imports src/lib/directorBrief.test.ts
 */

import { assembleBriefing } from "./directorBrief.ts";
import { checkGrant } from "./directorGrantRules.ts";

// Minimal ambient so tsc (which typechecks src/) accepts the Deno runner.
declare const Deno: { test(name: string, fn: () => void): void };

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

Deno.test("brief cites every open item with somewhere to go", () => {
  const lines = assembleBriefing({
    operators: [{
      id: "1", business_name: "Pharmacy", name: null, business_model: "internal",
      operator_kind: "ops", upcomingBookings: 0, openEscalations: 0,
      stockNeeds: 2, overdueTasks: 1,
    }],
    failedJobs: 1,
    activeJobs: 0,
    connectorsNeedingAttention: ["Gmail"],
  });
  check(lines.length === 4, `four lines (got ${lines.length})`);
  check(lines[0].text.includes("1 background job") && lines[0].path === "/diagnostics", "failures first, linked");
  check(lines.some((l) => l.text.includes("2 stock items") && l.path === "/services"), "stock cited + linked");
  check(lines.some((l) => l.text.includes("1 overdue task") && l.path === "/console"), "tasks cited + linked");
  check(lines.some((l) => l.text.includes("Gmail") && l.path === "/connections"), "connector cited + linked");
});

Deno.test("empty input is an explicit all-clear, never filler", () => {
  const lines = assembleBriefing({ operators: [], failedJobs: 0, activeJobs: 0, connectorsNeedingAttention: [] });
  check(lines.length === 0, "silence, not filler (UI renders the all-clear)");
});

Deno.test("running jobs with nothing open say exactly that", () => {
  const lines = assembleBriefing({ operators: [], failedJobs: 0, activeJobs: 2, connectorsNeedingAttention: [] });
  check(lines.length === 1 && lines[0].path === null && lines[0].text.includes("2 jobs"), "patience line, nowhere to go");
});

Deno.test("grants deny by default, grant exactly", () => {
  check(checkGrant([], "build_helpers") === false, "no grants, no solo moves");
  check(checkGrant([{ scope: "build_helpers", allowed: false }], "build_helpers") === false, "explicit no respected");
  check(checkGrant([{ scope: "build_helpers", allowed: true }], "build_helpers") === true, "granted scope passes");
  check(checkGrant([{ scope: "build_helpers", allowed: true }], "delete_everything") === false, "unknown scope never passes");
});

Deno.test("director actions map to real grant scopes", async () => {
  const { DIRECTOR_ACTIONS } = await import("./directorActionDefs.ts");
  const { GRANT_SCOPES } = await import("./directorGrantRules.ts");
  const scopes = new Set(GRANT_SCOPES.map((s) => s.scope));
  check(DIRECTOR_ACTIONS.length === 3, "three shipped actions");
  for (const a of DIRECTOR_ACTIONS) {
    check(scopes.has(a.scope), `${a.key} maps to a real scope`);
    check(a.does.length > 20, `${a.key} explains itself`);
  }
});
