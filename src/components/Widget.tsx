import React, { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, RefreshCw } from "lucide-react";

type WidgetReceptionist = {
  id: string;
  name: string | null;
  business_name: string | null;
  greeting_message: string | null;
  timezone: string | null;
  tone: string | null;
};

// Supabase table row type for widget_receptionists (not in generated types)
interface WidgetReceptionistRow {
  id: string;
  name: string | null;
  business_name: string | null;
  greeting_message: string | null;
  timezone: string | null;
  tone: string | null;
}

type Props = {
  receptionistId: string;
};

export default function Widget({ receptionistId }: Props) {
  const [receptionist, setReceptionist] = useState<WidgetReceptionist | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const greetingSentRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

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
        setLoading(true);
        const { data, error } = await supabase
          .from("widget_receptionists")
          .select("id, name, business_name, greeting_message, timezone, tone")
          .eq("id", receptionistId)
          .maybeSingle<WidgetReceptionistRow>();

        if (error) {
          console.warn("Widget: view query error", error);
          if (!mounted) return;
          setLoadError(true);
          return;
        }

        if (!mounted) return;
        if (!data) {
          setLoadError(true);
          return;
        }
        setReceptionist(data);
      } catch (e) {
        console.warn("Widget: failed to load receptionist", e);
        if (mounted) setLoadError(true);
      } finally {
        if (mounted) setLoading(false);
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

  // Keyboard navigation: focus sentinel for Escape to close
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      const panel = document.querySelector('[data-widget-panel]') as HTMLElement;
      panel?.focus();
    }
  }, []);

  if (loadError) {
    return (
      <div className="widget-root animate-in fade-in-0 duration-300" role="region" aria-label="Error loading chat">
        <header className="widget-header">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="h-4 w-32 bg-muted/50 rounded" />
          </div>
        </header>
        <div className="flex flex-col items-center justify-center p-8 text-center gap-3">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">Could not load chat. Please try again later.</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 text-xs text-primary hover:underline pressable"
          >
            <RefreshCw className="h-3 w-3" />
            Reload
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="widget-root animate-in fade-in-0 duration-300"
        role="region"
        aria-label="Loading receptionist"
      >
        <header className="widget-header">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="h-8 w-8 rounded-full bg-muted shimmer" />
            <div className="h-4 w-32 bg-muted shimmer rounded" />
          </div>
        </header>
        <div className="p-4 space-y-3">
          <div className="h-3 w-3/4 bg-muted shimmer rounded" />
          <div className="h-3 w-1/2 bg-muted shimmer rounded" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="widget-root animate-in fade-in-0 duration-300"
      role="region"
      aria-label={`Chat with ${receptionist?.business_name || "Reception"}`}
      onKeyDown={handleKeyDown}
    >
      <header className="widget-header">
        <div
          className="widget-title"
          tabIndex={0}
          aria-label={`${receptionist?.business_name || "Reception"} chat`}
        >
          <span className="truncate">{receptionist?.business_name || "Reception"}</span>
        </div>
      </header>
      <div ref={sentinelRef} tabIndex={0} aria-hidden="true" />
    </div>
  );
}
