import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type WidgetReceptionist = {
  id: string;
  name: string | null;
  business_name: string | null;
  greeting_message: string | null;
  timezone: string | null;
  tone: string | null;
};

type Props = {
  receptionistId: string;
};

export default function Widget({ receptionistId }: Props) {
  const [receptionist, setReceptionist] = useState<WidgetReceptionist | null>(null);
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
        const { data, error } = await supabase
          .from("widget_receptionists")
          .select("id, name, business_name, greeting_message, timezone, tone")
          .eq("id", receptionistId)
          .maybeSingle();

        if (error) {
          console.warn("Widget: view query error", error);
        }

        if (!mounted) return;
        setReceptionist(data as WidgetReceptionist | null);
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
