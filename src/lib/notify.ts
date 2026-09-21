import { supabase } from "@/integrations/supabase/client";

export async function notify(payload: {
  type: string;
  title: string;
  body: string;
  receptionist_id?: string;
  severity?: "info" | "warning" | "critical";
  category?: string;
  meta?: Record<string, unknown>;
}) {
  const { data, error } = await supabase.functions.invoke("create-notification", {
    body: payload,
  });

  if (error) console.warn("Notification failed:", error);
  return data;
}

export const notificationConfig = {
  "quality.low": { severity: "warning", icon: "AlertTriangle", color: "text-yellow-500" },
  "quality.flagged": { severity: "critical", icon: "AlertCircle", color: "text-red-500" },
  "kb.suggestion": { severity: "info", icon: "Lightbulb", color: "text-blue-500" },
  "appointment.created": { severity: "info", icon: "Calendar", color: "text-green-500" },
  "appointment.cancelled": { severity: "warning", icon: "CalendarX", color: "text-orange-500" },
  "appointment.reminder": { severity: "info", icon: "Clock", color: "text-blue-500" },
  "system.error": { severity: "critical", icon: "XCircle", color: "text-red-500" },
  "system.warning": { severity: "warning", icon: "AlertTriangle", color: "text-yellow-500" },
  "system.ok": { severity: "info", icon: "CheckCircle", color: "text-green-500" },
  "test": { severity: "info", icon: "Zap", color: "text-purple-500" },
} as const;
