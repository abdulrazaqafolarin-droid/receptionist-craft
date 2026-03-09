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
