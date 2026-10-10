/**
 * director-voice — the Director's spoken voice, cheapest lane first.
 *
 * Lane 1 (local, free): the gateway agent relays to the Voicebox server
 * running beside it (localhost:8000/v1/audio/speech, OpenAI-compatible)
 * and returns base64 mp3 inside its text reply. Capped at 20s — a voice
 * that starts late feels broken, so slowness falls through instead of
 * making the owner wait.
 * Lane 2 (cloud, fast): ElevenLabs, same call as text-to-speech.
 * Lane 3 lives client-side: free browser speechSynthesis when both fail.
 *
 * Spoken text is sliced short on purpose: long replies risk base64
 * truncation through the text channel, and a PA should not monologue.
 * Anything unparseable drops to the next lane — never silence, never error
 * speech. Returns audio/mpeg, or JSON {error} when every lane fails.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { askRutex } from "../_shared/rutexMcp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOCAL_CAP_MS = 20000;
const SPEAK_MAX_CHARS = 280;
const VOICEBOX_URL = "http://localhost:8000/v1/audio/speech";

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Lane 1: gateway agent -> localhost Voicebox -> base64 mp3. Null on any failure. */
async function localSpeak(text: string): Promise<Uint8Array | null> {
  try {
    const payload = JSON.stringify({
      model: "kokoro",
      input: text,
      voice: "af_heart",
      response_format: "mp3",
    }).replace(/'/g, `'\"'\"'`);
    const prompt =
      `You are a TTS relay. Follow these steps exactly, no other actions.\n` +
      `1. Run exactly this shell command:\n` +
      `curl -s -m 15 -X POST ${VOICEBOX_URL} -H "Content-Type: application/json" -d '${payload}' -o /tmp/dv.mp3 && base64 -w0 /tmp/dv.mp3\n` +
      `2. Reply with ONLY this JSON and nothing else: {"audio_b64":"<the full base64 output>"}\n` +
      `Do not truncate the base64 string. Do not explain anything.\n` +
      `If curl fails or the server is unreachable, reply with ONLY: {"error":"voicebox_down"}`;
    const r = await askRutex("director-voice", prompt, { timeoutMs: LOCAL_CAP_MS });
    const clean = (r.text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(clean) as { audio_b64?: unknown; error?: unknown };
    if (typeof parsed.audio_b64 !== "string" || parsed.audio_b64.length < 1000) return null;
    return b64ToBytes(parsed.audio_b64);
  } catch {
    return null;
  }
}

/** Lane 2: ElevenLabs direct. Null on any failure. */
async function cloudSpeak(text: string, voiceId: string): Promise<Uint8Array | null> {
  try {
    const key = Deno.env.get("ELEVENLABS_API_KEY") || "";
    if (!key) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: { "xi-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            model_id: "eleven_turbo_v2_5",
            voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
          }),
          signal: ctrl.signal,
        },
      );
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const raw = typeof body.text === "string" ? body.text : "";
    const provider = body.provider === "local" || body.provider === "cloud" ? body.provider : "auto";
    const voiceId = typeof body.voiceId === "string" && body.voiceId ? body.voiceId : "EXAVITQu4vr4xnSDxMaL";
    const text = raw.trim().slice(0, SPEAK_MAX_CHARS);
    if (!text) return jsonRes({ error: "empty text" }, 400);

    if (provider === "auto" || provider === "local") {
      const local = await localSpeak(text);
      if (local) {
        return new Response(local.buffer as ArrayBuffer, { headers: { ...corsHeaders, "Content-Type": "audio/mpeg", "X-Voice-Lane": "local" } });
      }
      if (provider === "local") return jsonRes({ error: "local voice unavailable (is Voicebox running on the gateway host?)" }, 502);
    }
    const cloud = await cloudSpeak(text, voiceId);
    if (cloud) {
      return new Response(cloud.buffer as ArrayBuffer, { headers: { ...corsHeaders, "Content-Type": "audio/mpeg", "X-Voice-Lane": "cloud" } });
    }
    return jsonRes({ error: "all voice lanes failed" }, 502);
  } catch (e) {
    return jsonRes({ error: e instanceof Error ? e.message.slice(0, 200) : "unknown" }, 500);
  }
});
