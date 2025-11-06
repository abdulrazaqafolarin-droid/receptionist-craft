import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export default function VoiceInput({ onTranscript, disabled }: VoiceInputProps) {
  const { toast } = useToast();
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      
      chunksRef.current = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      recorder.onstop = async () => {
        setProcessing(true);
        try {
          const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
          
          // Convert to base64
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Audio = reader.result?.toString().split(',')[1];
            
            if (!base64Audio) {
              throw new Error('Failed to convert audio');
            }

            // Call edge function
            const { data, error } = await supabase.functions.invoke('voice-to-text', {
              body: { audio: base64Audio }
            });

            if (error) throw error;
            
            if (data?.text) {
              onTranscript(data.text);
              toast({
                title: "Transcribed",
                description: data.text.substring(0, 50) + (data.text.length > 50 ? '...' : ''),
              });
            }
          };
        } catch (error: any) {
          console.error('Error processing audio:', error);
          toast({
            title: "Error",
            description: error.message || "Failed to transcribe audio",
            variant: "destructive",
          });
        } finally {
          setProcessing(false);
          stream.getTracks().forEach(track => track.stop());
        }
      };
      
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      
      toast({
        title: "Recording",
        description: "Speak now...",
      });
    } catch (error: any) {
      console.error('Error accessing microphone:', error);
      toast({
        title: "Error",
        description: "Could not access microphone",
        variant: "destructive",
      });
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  }

  return (
    <Button
      onClick={recording ? stopRecording : startRecording}
      disabled={disabled || processing}
      variant={recording ? "destructive" : "outline"}
      size="icon"
      title={recording ? "Stop Recording" : "Start Voice Input"}
    >
      {processing ? (
        <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
      ) : recording ? (
        <Square className="h-4 w-4" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </Button>
  );
}
