let currentAudio: HTMLAudioElement | null = null;

export async function speakText(text: string, voiceId: string = "EXAVITQu4vr4xnSDxMaL"): Promise<void> {
  try {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }

    // Use fetch directly for binary audio (not supabase.functions.invoke which expects JSON)
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/text-to-speech`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ text, voiceId }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "TTS failed" }));
      throw new Error(err.error || `TTS request failed: ${response.status}`);
    }

    const audioBlob = await response.blob();
    const url = URL.createObjectURL(audioBlob);

    currentAudio = new Audio(url);
    currentAudio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
    };

    await currentAudio.play();
  } catch (error) {
    console.error("Error speaking text:", error);
    throw error;
  }
}

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

export type DirectorVoiceProvider = "auto" | "local" | "cloud";

/**
 * Director voice: cheapest lane first. Calls the director-voice edge
 * (gateway-local Voicebox, then ElevenLabs cloud); when every server
 * lane fails, falls back to free on-device browser speech so the
 * Director is never silently mute. Returns the lane that spoke.
 */
export async function speakDirectorText(
  text: string,
  provider: DirectorVoiceProvider = "auto",
): Promise<"local" | "cloud" | "browser"> {
  stopSpeaking();
  try {
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  } catch {
    // no browser speech — server lanes only
  }
  const short = text.trim().slice(0, 280);
  if (!short) return "browser";
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/director-voice`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ text: short, provider }),
      },
    );
    if (!response.ok) throw new Error(`voice ${response.status}`);
    const lane = response.headers.get("X-Voice-Lane") === "local" ? "local" : "cloud";
    const audioBlob = await response.blob();
    const url = URL.createObjectURL(audioBlob);
    currentAudio = new Audio(url);
    currentAudio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
    };
    await currentAudio.play();
    return lane;
  } catch {
    // Last lane: on-device speech, free and offline-capable.
    try {
      if (typeof speechSynthesis !== "undefined") {
        speechSynthesis.speak(new SpeechSynthesisUtterance(short));
        return "browser";
      }
    } catch {
      // device cannot speak either
    }
    return "browser";
  }
}
