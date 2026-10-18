import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decodeTaskCursor, encodeTaskCursor, parseTaskPageSize } from "./workerTaskPagination.ts";

Deno.test("task cursor round-trips a stable timestamp and UUID", () => {
  const task = {
    id: "61000000-0000-4000-8000-000000000001",
    created_at: "2026-10-18T17:00:00.123+00:00",
  };
  const cursor = encodeTaskCursor(task);
  if (!cursor) throw new Error("valid task should produce a cursor");
  assertEquals(decodeTaskCursor(cursor), {
    id: task.id,
    created_at: "2026-10-18T17:00:00.123+00:00",
  });

  const precise = encodeTaskCursor({
    id: task.id,
    created_at: "2026-10-18T17:00:00.123456+00:00",
  });
  if (!precise) throw new Error("microsecond timestamp should produce a cursor");
  assertEquals(decodeTaskCursor(precise)?.created_at, "2026-10-18T17:00:00.123456+00:00");
});

Deno.test("task cursor rejects malformed, oversized and non-UUID payloads", () => {
  assertEquals(decodeTaskCursor("not-a-cursor"), null);
  assertEquals(decodeTaskCursor("A".repeat(513)), null);
  const payload = btoa(JSON.stringify({ id: "not-a-uuid", created_at: "2026-10-18T00:00:00Z" }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  assertEquals(decodeTaskCursor(payload), null);
  assertEquals(encodeTaskCursor({ id: "bad", created_at: "2026-10-18T00:00:00Z" }), null);
});

Deno.test("task page size has a bounded default and rejects invalid values", () => {
  assertEquals(parseTaskPageSize(undefined), 50);
  assertEquals(parseTaskPageSize(1), 1);
  assertEquals(parseTaskPageSize(100), 100);
  assertEquals(parseTaskPageSize(0), null);
  assertEquals(parseTaskPageSize(101), null);
  assertEquals(parseTaskPageSize("50"), null);
  assertEquals(parseTaskPageSize(2.5), null);
});
