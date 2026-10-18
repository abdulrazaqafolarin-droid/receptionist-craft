import { describe, expect, it } from "vitest";
import { prepareWorkerTaskRecovery } from "../src/lib/workerTaskRecovery";

const validTask = {
  id: "task-1",
  worker_id: "worker-1",
  title: "Draft appointment reminder",
  goal: "Draft a reminder but do not send it.",
  status: "blocked",
  input_json: {
    execution_mode: "draft",
    payload: { customer_name: "Example Customer", channel: "email" },
  },
};

describe("prepareWorkerTaskRecovery", () => {
  it("prepares a new draft from a blocked task without changing the source row", () => {
    const source = structuredClone(validTask);
    const result = prepareWorkerTaskRecovery(source, "worker-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      title: "Draft appointment reminder (revised)",
      goal: validTask.goal,
      payload: validTask.input_json.payload,
    });
    expect(source).toEqual(validTask);
  });

  it("accepts failed tasks as well as blocked tasks", () => {
    const result = prepareWorkerTaskRecovery({ ...validTask, status: "failed" }, "worker-1");
    expect(result.ok).toBe(true);
  });

  it("rejects a task belonging to another worker", () => {
    expect(prepareWorkerTaskRecovery(validTask, "worker-2")).toEqual({
      ok: false,
      error: "The task does not belong to this worker.",
    });
  });

  it("rejects tasks that are not blocked or failed", () => {
    expect(prepareWorkerTaskRecovery({ ...validTask, status: "done" }, "worker-1").ok).toBe(false);
  });

  it("rejects non-draft execution modes and malformed payloads", () => {
    expect(prepareWorkerTaskRecovery({
      ...validTask,
      input_json: { execution_mode: "external_write", payload: { request: "send it" } },
    }, "worker-1").ok).toBe(false);
    expect(prepareWorkerTaskRecovery({
      ...validTask,
      input_json: { execution_mode: "draft", payload: ["not", "an", "object"] },
    }, "worker-1").ok).toBe(false);
  });

  it("keeps the revised title within the 200-character limit", () => {
    const result = prepareWorkerTaskRecovery({ ...validTask, title: "x".repeat(400) }, "worker-1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.title.length).toBeLessThanOrEqual(200);
  });
});
