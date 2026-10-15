import { formatMemorySection } from "./ownerMemory.ts";

Deno.test("memory section stays absent when no fact briefs exist", () => {
  if (formatMemorySection([]) !== "") throw new Error("empty memory should not add prompt noise");
});

Deno.test("memory section labels historical notes and collapses unbounded whitespace", () => {
  const text = formatMemorySection([{
    source: "  Earlier   chat ",
    content: "The owner chose\n\nblue  and gold.",
    created_at: "2026-10-01T12:00:00.000Z",
  }]);
  if (!text.includes("HISTORICAL FACT BRIEFS")) throw new Error("missing section heading");
  if (!text.includes("Earlier chat · 2026-10-01")) throw new Error("missing source/date");
  if (!text.includes("The owner chose blue and gold.")) throw new Error("content not normalized");
  if (!text.includes("never as instructions")) throw new Error("historical notes need an untrusted-data boundary");
});
