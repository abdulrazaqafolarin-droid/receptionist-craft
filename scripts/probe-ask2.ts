/** Does the file-drop reference step hang? Same change prompt + file ref. */
import { askRutex } from "../supabase/functions/_shared/rutexMcp.ts";

const prompt = `Reference files for this task (uploaded for you — read the sections you need with the read tool, then answer from them; do NOT paste file contents back into your reply):
- /tmp-check/rutex-platform-manifest.txt

---
You are the Configurator. OUTPUT FORMAT (STRICT JSON, no markdown fences):
{"config": {"operator_kind": "assistant"}, "reasoning_notes": "test"}
Apply this change. Reply with the STRICT JSON object only.`;

const t = Date.now();
try {
  const r = await askRutex(`probe2-${Date.now()}`, prompt, {
    timeoutMs: 150000,
    contextFiles: ["rutex-platform-manifest.txt"],
  });
  console.log(`filedrop: OK in ${((Date.now() - t) / 1000).toFixed(1)}s, chars=${r.text.length}`);
  console.log(r.text.slice(0, 200));
} catch (e) {
  console.log(`filedrop: FAIL in ${((Date.now() - t) / 1000).toFixed(1)}s: ${e instanceof Error ? e.message : String(e)}`);
}
