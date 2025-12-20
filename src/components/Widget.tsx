import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  receptionistId: string;
};

export default function Widget({ receptionistId }: Props) {
  const [receptionist, setReceptionist] = useState<any>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const greetingSentRef = useRef(false);

  useEffect(() => {
    let sid = localStorage.getItem(`widget_session_${receptionistId}`);
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem(`widget_session_${receptionistId}`, sid);
    }
    setSessionId(sid);
  }, [receptionistId]);

  useEffect(() => {
    if (!sessionId || !receptionistId) return;
    let mounted = true;
    (async () => {
      try {
        // Use secure RPC function to get only public fields
        const { data, error } = await supabase
          .rpc('get_public_receptionist', { p_receptionist_id: receptionistId });
        
        if (error) {
          console.warn("Widget: RPC error, falling back to direct query", error);
          // Fallback to direct query with limited fields
          const { data: fallbackData } = await supabase
            .from("receptionists")
            .select("id, greeting_message, business_name, name, timezone")
            .eq("id", receptionistId)
            .eq("active", true)
            .maybeSingle();
          if (!mounted) return;
          setReceptionist(fallbackData);
          return;
        }
        
        if (!mounted) return;
        // RPC returns array, get first item
        setReceptionist(data && data.length > 0 ? data[0] : null);
      } catch (e) {
        console.warn("Widget: failed to load receptionist", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [sessionId, receptionistId]);

  useEffect(() => {
    if (!receptionist || !sessionId) return;
    if (greetingSentRef.current) return;
    const greeting = (receptionist.greeting_message || "").trim();
    if (!greeting) return;

    greetingSentRef.current = true;

    (async () => {
      try {
        await supabase.functions.invoke("widget-chat", {
          body: {
            message: "",
            receptionistId,
            sessionId,
            displayedGreeting: greeting,
            source: "widget_client"
          },
        });
      } catch (e) {
        console.warn("Widget: greeting persist failed", e);
      }
    })();
  }, [receptionist, sessionId, receptionistId]);

  return (
    <div className="widget-root">
      <header className="widget-header">
        <div className="widget-title">{receptionist?.business_name || "Reception"}</div>
      </header>
    </div>
  );
}
