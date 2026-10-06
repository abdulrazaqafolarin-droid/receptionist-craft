/** Isolate change-call hangs: trivial prompt vs slim change prompt, timed. */
import { askRutex } from "../supabase/functions/_shared/rutexMcp.ts";

async function timed(label: string, prompt: string, timeoutMs: number): Promise<void> {
  const t = Date.now();
  try {
    const r = await askRutex(`probe-${Date.now()}`, prompt, { timeoutMs });
    console.log(`${label}: OK in ${((Date.now() - t) / 1000).toFixed(1)}s, model=${r.model}, chars=${r.text.length}`);
  } catch (e) {
    console.log(`${label}: FAIL in ${((Date.now() - t) / 1000).toFixed(1)}s: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const trivial = 'Reply with exactly: {"ok": true}';
const changeLike = `You are the Configurator. OUTPUT FORMAT (STRICT JSON, no markdown fences):
{"config": {"operator_kind": "assistant"}, "reasoning_notes": "test"}
CURRENT CONFIGURATION (slim): {"operator_kind": "assistant", "capabilities": {"books_appointments": false}}
OWNER'S CHANGE REQUEST: "Add appointment booking."
Apply this change. Reply with the STRICT JSON object only.`;

await timed("trivial-60s", trivial, 60000);
await timed("changeLike-150s", changeLike, 150000);
