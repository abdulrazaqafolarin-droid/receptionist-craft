import { supabase } from "@/integrations/supabase/client";

let currentAudio: HTMLAudioElement | null = null;

export async function speakText(text: string, voice: string = "Sarah"): Promise<void> {
  try {
    // Stop any currently playing audio
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }

    const { data, error } = await supabase.functions.invoke('text-to-speech', {
      body: { text, voice }
    });

    if (error) throw error;

    if (data?.audioContent) {
      // Convert base64 to blob
      const binaryString = atob(data.audioContent);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      
      currentAudio = new Audio(url);
      currentAudio.onended = () => {
        URL.revokeObjectURL(url);
        currentAudio = null;
      };
      
      await currentAudio.play();
    }
  } catch (error) {
    console.error('Error speaking text:', error);
    throw error;
  }
}

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}
