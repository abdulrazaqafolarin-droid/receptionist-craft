import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

/**
 * OAuth return landing: provider redirects here with ?code & state.
 * Exchanges the code server-side (client secret never touches the
 * browser after initial save) and reports honestly — success, denial,
 * or exchange failure each get their own outcome, never a silent break.
 */
export default function OAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState<"working" | "done" | "error" | "denied">("working");
  const [message, setMessage] = useState("Completing provider sign-in…");

  useEffect(() => {
    (async () => {
      const error = searchParams.get("error");
      if (error) {
        setPhase("denied");
        setMessage(
          error === "access_denied"
            ? "You declined the provider sign-in. Nothing was connected — try again whenever you're ready."
            : `Provider sign-in failed (${error}). Nothing was connected.`,
        );
        return;
      }
      const code = searchParams.get("code");
      const connectorKey = searchParams.get("state");
      if (!code || !connectorKey) {
        setPhase("error");
        setMessage("The provider didn't return a usable response. Try connecting again from the Connections page.");
        return;
      }
      try {
        const { data, error: fnError } = await supabase.functions.invoke("oauth-callback", {
          body: {
            code,
            connector_key: connectorKey,
            redirect_uri: `${window.location.origin}/oauth/callback`,
          },
        });
        if (fnError) throw fnError;
        const d = (data || {}) as { ok?: boolean; error?: string };
        if (!d.ok) throw new Error(d.error || "Token exchange failed");
        setPhase("done");
        setMessage("Connected. Your operator can now use this service.");
      } catch (e) {
        console.error("OAuth callback failed", e);
        setPhase("error");
        setMessage(e instanceof Error ? e.message : "Sign-in could not be completed.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {phase === "working" && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
            {phase === "done" && <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden="true" />}
            {(phase === "error" || phase === "denied") && <XCircle className="h-5 w-5 text-destructive" aria-hidden="true" />}
            Provider sign-in
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{message}</p>
          {phase !== "working" && (
            <Button onClick={() => navigate("/connections")} className="w-full">
              Back to Connections
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
