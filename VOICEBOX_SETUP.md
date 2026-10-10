# Voicebox host setup — free Director voice on the gateway machine

The Director's local voice lane works when this server runs **on the same
machine as the Rutex gateway** (the gateway agent curls it on localhost).
Nothing gateway-side needs changing — the speak instruction rides inside
the `director-voice` edge function's prompt.

## 1. Unpack (gateway host)

```bash
unzip ~/Downloads/voicebox-main.zip -d ~/voicebox && cd ~/voicebox/voicebox-main
```

## 2. Python env + backend deps

Python 3.10–3.12, CPU is fine (Kokoro-82M is CPU-realtime).

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
```

## 3. Start the server (port 8000 — the edge function expects this)

```bash
cd backend && python server.py
# or: uvicorn app:app --host 127.0.0.1 --port 8000
```

First speak downloads the Kokoro model (~300MB) from HuggingFace
(`hexgrad/Kokoro-82M`) — needs internet once, then it is cached.

## 4. Verify it speaks

```bash
curl -s -X POST http://localhost:8000/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"model":"kokoro","input":"Hello, this is your Director speaking.","voice":"af_heart","response_format":"mp3"}' \
  -o /tmp/vb-test.mp3 && ls -la /tmp/vb-test.mp3
# expect a real mp3 (tens of KB), not JSON
```

## 5. Keep it alive (it must outlive your terminal)

```bash
nohup python server.py > voicebox.log 2>&1 &
# or pm2 / systemd if you have it — anything that restarts it
```

## 6. Prove the whole lane from Rutex

In the Director chat: tap the speaker icon, set provider to `local`,
send any message. Or curl the edge directly:

```bash
curl -s -X POST https://esvrhnlwquunsdduvbnr.supabase.co/functions/v1/director-voice \
  -H "Content-Type: application/json" -H "apikey: <anon>" \
  -d '{"text":"Hello, this is your Director speaking.","provider":"local"}' \
  -o /tmp/dv.mp3
```

A real mp3 means the full chain works: browser → edge → gateway
agent → your Voicebox → audio back. If it 502s with
"local voice unavailable", the server is not up or not on port 8000.

## Notes

- Default voice is `af_heart` (warm female US). Other Kokoro voices work
  by name — tell the owner which to set and the edge default changes in
  one line (`supabase/functions/director-voice/index.ts`).
- This lane is free and private (audio never leaves your machines except
  through your own gateway), but slower than cloud: the gateway round
  trip runs 5–15s. The `auto` provider tries local first (20s cap) and
  falls back to ElevenLabs, so owners never wait on a dead lane.
- Voicebox also bundles OmniVoice/Chatterbox/Qwen backends — same
  endpoint, different `model` value, heavier hardware. Kokoro is the
  starting point because it runs on CPU.
