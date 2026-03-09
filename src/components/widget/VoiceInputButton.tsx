import { useState, useRef, useCallback } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
}

type RecordingState = "idle" | "recording" | "processing";

export default function VoiceInputButton({ onTranscript, disabled, className }: VoiceInputButtonProps) {
  const [state, setState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const processAudio = useCallback(
    async (blob: Blob) => {
      setState("processing");
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Audio = btoa(binary);

        const { data, error: fnError } = await supabase.functions.invoke("voice-to-text", {
          body: { audio: base64Audio },
        });

        if (fnError) throw new Error(fnError.message);
        if (data?.text) {
          onTranscript(data.text);
          setError(null);
        } else if (data?.error) {
          throw new Error(data.error);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Transcription failed";
        setError(msg);
        setTimeout(() => setError(null), 3000);
      } finally {
        setState("idle");
      }
    },
    [onTranscript]
  );

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stopStream();
        const blob = new Blob(chunksRef.current, { type: mimeType });
        processAudio(blob);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setState("recording");
    } catch {
      setError("Microphone access denied");
      setState("idle");
      setTimeout(() => setError(null), 3000);
    }
  }, [processAudio, stopStream]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state === "recording") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  }, [state]);

  const handleClick = () => {
    if (state === "recording") stopRecording();
    else if (state === "idle") startRecording();
  };

  const isDisabled = disabled || state === "processing";

  return (
    <div className={`relative flex flex-col items-center gap-1 ${className ?? ""}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        aria-label={state === "recording" ? "Stop recording" : "Start voice input"}
        className={[
          "relative flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          state === "recording"
            ? "bg-destructive text-destructive-foreground shadow-lg scale-110"
            : state === "processing"
            ? "bg-muted text-muted-foreground cursor-not-allowed"
            : "bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground shadow-sm hover:shadow-md hover:scale-105",
          isDisabled && state !== "recording" ? "opacity-50 cursor-not-allowed" : "",
        ].join(" ")}
      >
        {state === "processing" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : state === "recording" ? (
          <>
            <Square className="h-4 w-4" />
            {/* Pulse ring while recording */}
            <span className="absolute inset-0 rounded-full bg-destructive opacity-30 animate-ping" />
          </>
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </button>

      {error && (
        <p className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
