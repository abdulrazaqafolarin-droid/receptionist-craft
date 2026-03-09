import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, X, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface VoiceChatOverlayProps {
  open: boolean;
  onClose: () => void;
  onSendMessage: (text: string) => Promise<string>;
  primaryColor: string;
  secondaryColor: string;
}

type VoiceState = "idle" | "listening" | "processing" | "speaking";

export default function VoiceChatOverlay({
  open,
  onClose,
  onSendMessage,
  primaryColor,
  secondaryColor,
}: VoiceChatOverlayProps) {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [aiText, setAiText] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [speakingLevel, setSpeakingLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number>(0);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    cancelAnimationFrame(animationFrameRef.current);
  }, []);

  const monitorAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    const tick = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(data);
      const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
      setAudioLevel(avg / 255);
      animationFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const speakResponse = useCallback(async (text: string) => {
    setState("speaking");
    setAiText(text);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/text-to-speech`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text, voiceId: "EXAVITQu4vr4xnSDxMaL" }),
        }
      );

      if (!response.ok) throw new Error("TTS failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudioRef.current = audio;

      // Animate speaking level from audio
      const actx = new AudioContext();
      const source = actx.createMediaElementSource(audio);
      const analyser = actx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(actx.destination);

      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const animateSpeaking = () => {
        if (state !== "speaking" && currentAudioRef.current !== audio) return;
        analyser.getByteFrequencyData(freqData);
        const avg = freqData.reduce((s, v) => s + v, 0) / freqData.length;
        setSpeakingLevel(avg / 255);
        if (!audio.paused) requestAnimationFrame(animateSpeaking);
      };

      audio.onplay = () => animateSpeaking();
      audio.onended = () => {
        URL.revokeObjectURL(url);
        actx.close();
        setSpeakingLevel(0);
        currentAudioRef.current = null;
        setState("idle");
        setAiText("");
        // Auto-listen again
        setTimeout(() => {
          if (open) startListening();
        }, 500);
      };

      await audio.play();
    } catch (err) {
      console.error("TTS error:", err);
      setState("idle");
      setAiText("");
    }
  }, [open]);

  const processAudio = useCallback(async (blob: Blob) => {
    setState("processing");
    setTranscript("Processing...");
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Audio = btoa(binary);

      const { data, error } = await supabase.functions.invoke("voice-to-text", {
        body: { audio: base64Audio },
      });

      if (error) throw new Error(error.message);
      if (!data?.text) throw new Error("No transcription");

      setTranscript(data.text);

      // Send to chat and get AI response
      const aiReply = await onSendMessage(data.text);
      
      // Speak the response
      await speakResponse(aiReply);
    } catch (err) {
      console.error("Voice processing error:", err);
      setTranscript("Sorry, I couldn't understand that.");
      setState("idle");
      setTimeout(() => setTranscript(""), 2000);
    }
  }, [onSendMessage, speakResponse]);

  const startListening = useCallback(async () => {
    setTranscript("");
    setAiText("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      // Set up audio analysis for visual feedback
      const actx = new AudioContext();
      audioContextRef.current = actx;
      const source = actx.createMediaStreamSource(stream);
      const analyser = actx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      monitorAudioLevel();

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stopStream();
        setAudioLevel(0);
        const blob = new Blob(chunksRef.current, { type: mimeType });
        processAudio(blob);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setState("listening");
    } catch {
      setTranscript("Microphone access denied");
      setState("idle");
    }
  }, [processAudio, stopStream, monitorAudioLevel]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && state === "listening") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  }, [state]);

  const handleClose = useCallback(() => {
    stopListening();
    stopStream();
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setState("idle");
    setTranscript("");
    setAiText("");
    setAudioLevel(0);
    setSpeakingLevel(0);
    onClose();
  }, [stopListening, stopStream, onClose]);

  // Auto-start listening when overlay opens
  useEffect(() => {
    if (open && state === "idle") {
      const timer = setTimeout(() => startListening(), 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [stopStream]);

  if (!open) return null;

  const bubbleScale = state === "listening"
    ? 1 + audioLevel * 0.6
    : state === "speaking"
    ? 1 + speakingLevel * 0.5
    : state === "processing"
    ? 1.05
    : 1;

  const bubbleGlow = state === "listening"
    ? audioLevel * 40
    : state === "speaking"
    ? speakingLevel * 50
    : 0;

  const statusText = state === "listening"
    ? "Listening..."
    : state === "processing"
    ? "Thinking..."
    : state === "speaking"
    ? "Speaking..."
    : "Tap to speak";

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/95 backdrop-blur-xl animate-in fade-in-0 duration-300">
      {/* Close button */}
      <button
        onClick={handleClose}
        className="absolute top-6 right-6 h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors"
        aria-label="Close voice chat"
      >
        <X className="h-5 w-5 text-muted-foreground" />
      </button>

      {/* Status text */}
      <p className="text-sm font-medium text-muted-foreground mb-8 animate-in fade-in-0 duration-500">
        {statusText}
      </p>

      {/* Dynamic bubble */}
      <button
        onClick={() => {
          if (state === "idle") startListening();
          else if (state === "listening") stopListening();
        }}
        className="relative flex items-center justify-center focus:outline-none"
        aria-label={state === "listening" ? "Stop listening" : "Start listening"}
      >
        {/* Outer glow rings */}
        <div
          className="absolute rounded-full transition-all duration-150 ease-out"
          style={{
            width: `${180 + bubbleGlow * 2}px`,
            height: `${180 + bubbleGlow * 2}px`,
            background: `radial-gradient(circle, ${primaryColor}15, transparent 70%)`,
            transform: `scale(${bubbleScale * 1.1})`,
          }}
        />
        <div
          className="absolute rounded-full transition-all duration-100 ease-out"
          style={{
            width: `${150 + bubbleGlow}px`,
            height: `${150 + bubbleGlow}px`,
            background: `radial-gradient(circle, ${primaryColor}25, transparent 70%)`,
            transform: `scale(${bubbleScale * 1.05})`,
          }}
        />

        {/* Main bubble */}
        <div
          className={cn(
            "relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-150 ease-out shadow-2xl",
            state === "processing" && "animate-pulse"
          )}
          style={{
            background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
            transform: `scale(${bubbleScale})`,
            boxShadow: `0 0 ${bubbleGlow}px ${bubbleGlow / 2}px ${primaryColor}40`,
          }}
        >
          {state === "listening" ? (
            <Mic className="h-10 w-10 text-white drop-shadow-lg" />
          ) : state === "speaking" ? (
            <Volume2 className="h-10 w-10 text-white drop-shadow-lg" />
          ) : (
            <Mic className="h-10 w-10 text-white/80 drop-shadow-lg" />
          )}

          {/* Ripple effects when active */}
          {(state === "listening" || state === "speaking") && (
            <>
              <span
                className="absolute inset-0 rounded-full animate-ping"
                style={{
                  background: `${primaryColor}20`,
                  animationDuration: "2s",
                }}
              />
              <span
                className="absolute inset-0 rounded-full animate-ping"
                style={{
                  background: `${secondaryColor}15`,
                  animationDuration: "3s",
                  animationDelay: "0.5s",
                }}
              />
            </>
          )}
        </div>
      </button>

      {/* Transcript / AI response */}
      <div className="mt-10 max-w-md text-center px-6 min-h-[60px]">
        {transcript && state !== "speaking" && (
          <p className="text-base text-foreground animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
            {transcript}
          </p>
        )}
        {aiText && state === "speaking" && (
          <p className="text-base text-primary animate-in fade-in-0 slide-in-from-bottom-2 duration-300 font-medium">
            {aiText}
          </p>
        )}
      </div>

      {/* Tap hint */}
      {state === "idle" && (
        <p className="mt-6 text-xs text-muted-foreground/60 animate-in fade-in-0 duration-700">
          Tap the orb to start talking
        </p>
      )}
    </div>
  );
}
