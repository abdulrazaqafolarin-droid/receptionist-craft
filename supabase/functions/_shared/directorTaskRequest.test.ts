import { parseDirectorTaskBody } from "./directorTaskRequest.ts";

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

Deno.test("reads a JSON request body once and preserves gateway identity and action", async () => {
  const req = new Request("https://example.test/director-task", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: "user-123", action: "continue", task_id: "task-456" }),
  });
  const body = await parseDirectorTaskBody(req);
  check(body.user_id === "user-123", "gateway identity remains available");
  check(body.action === "continue", "requested action remains available");
  check(body.task_id === "task-456", "task id remains available");
});

Deno.test("invalid, scalar, and array JSON bodies fail closed to an empty object", async () => {
  const invalid = await parseDirectorTaskBody(new Request("https://example.test", {
    method: "POST", body: "{",
  }));
  const scalar = await parseDirectorTaskBody(new Request("https://example.test", {
    method: "POST", body: JSON.stringify("start"),
  }));
  const array = await parseDirectorTaskBody(new Request("https://example.test", {
    method: "POST", body: JSON.stringify(["start"]),
  }));
  check(Object.keys(invalid).length === 0, "invalid JSON returns empty body");
  check(Object.keys(scalar).length === 0, "scalar JSON returns empty body");
  check(Object.keys(array).length === 0, "array JSON returns empty body");
});
