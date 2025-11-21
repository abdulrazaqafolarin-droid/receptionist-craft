import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { Navbar } from "@/components/Navbar";

type DiagnosticResult = {
  name: string;
  status: "pass" | "fail" | "warning" | "loading";
  message: string;
  details?: string;
};

export default function Diagnostics() {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    runDiagnostics();
  }, []);

  async function runDiagnostics() {
    setLoading(true);
    const tests: DiagnosticResult[] = [];

    // Test 1: Authentication
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      setUser(user);
      
      if (error) throw error;
      
      if (user) {
        tests.push({
          name: "Authentication",
          status: "pass",
          message: "User authenticated successfully",
          details: `User ID: ${user.id}\nEmail: ${user.email}`,
        });
      } else {
        tests.push({
          name: "Authentication",
          status: "fail",
          message: "No user authenticated",
          details: "Please log in to use the application",
        });
      }
    } catch (err: any) {
      tests.push({
        name: "Authentication",
        status: "fail",
        message: "Authentication error",
        details: err.message,
      });
    }

    // Test 2: Database Connection
    try {
      const { data, error } = await supabase.from("receptionists").select("id").limit(1);
      
      if (error) throw error;
      
      tests.push({
        name: "Database Connection",
        status: "pass",
        message: "Successfully connected to database",
      });
    } catch (err: any) {
      tests.push({
        name: "Database Connection",
        status: "fail",
        message: "Database connection failed",
        details: err.message,
      });
    }

    // Test 3: Receptionist Creation Permissions
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        tests.push({
          name: "Receptionist Creation",
          status: "warning",
          message: "Cannot test - user not authenticated",
        });
      } else {
        // Try to query receptionists to verify RLS
        const { data, error } = await supabase
          .from("receptionists")
          .select("id, name")
          .eq("user_id", user.id);

        if (error) throw error;

        tests.push({
          name: "Receptionist Permissions",
          status: "pass",
          message: `Found ${data?.length || 0} receptionists`,
          details: data?.length ? `Existing receptionists: ${data.map(r => r.name).join(", ")}` : "No receptionists yet",
        });
      }
    } catch (err: any) {
      tests.push({
        name: "Receptionist Permissions",
        status: "fail",
        message: "Permission check failed",
        details: err.message,
      });
    }

    // Test 4: A/B Test Configuration
    try {
      const { data, error } = await supabase
        .from("ab_tests")
        .select("slug, name, active")
        .eq("slug", "default-receptionist-test")
        .maybeSingle();

      if (error) throw error;

      if (data) {
        tests.push({
          name: "A/B Test Setup",
          status: "pass",
          message: "Default A/B test configured",
          details: `Active: ${data.active}`,
        });
      } else {
        tests.push({
          name: "A/B Test Setup",
          status: "warning",
          message: "Default A/B test not found",
          details: "Chat may still work but without A/B testing",
        });
      }
    } catch (err: any) {
      tests.push({
        name: "A/B Test Setup",
        status: "warning",
        message: "Could not verify A/B test",
        details: err.message,
      });
    }

    // Test 5: Edge Function Connectivity
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
        method: "OPTIONS",
      });

      if (response.ok) {
        tests.push({
          name: "Chat Function Availability",
          status: "pass",
          message: "Chat edge function is accessible",
        });
      } else {
        tests.push({
          name: "Chat Function Availability",
          status: "warning",
          message: "Chat function returned non-OK status",
          details: `Status: ${response.status}`,
        });
      }
    } catch (err: any) {
      tests.push({
        name: "Chat Function Availability",
        status: "fail",
        message: "Cannot reach chat function",
        details: err.message,
      });
    }

    // Test 6: Notification Table Structure
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("id")
        .limit(1);

      if (error) throw error;

      tests.push({
        name: "Notifications Table",
        status: "pass",
        message: "Notifications table accessible",
      });
    } catch (err: any) {
      tests.push({
        name: "Notifications Table",
        status: "fail",
        message: "Cannot access notifications",
        details: err.message,
      });
    }

    setResults(tests);
    setLoading(false);
  }

  function getStatusIcon(status: DiagnosticResult["status"]) {
    switch (status) {
      case "pass":
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case "fail":
        return <XCircle className="h-5 w-5 text-red-600" />;
      case "warning":
        return <AlertCircle className="h-5 w-5 text-yellow-600" />;
      default:
        return <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />;
    }
  }

  function getStatusBadge(status: DiagnosticResult["status"]) {
    switch (status) {
      case "pass":
        return <Badge className="bg-green-600">PASS</Badge>;
      case "fail":
        return <Badge variant="destructive">FAIL</Badge>;
      case "warning":
        return <Badge className="bg-yellow-600">WARNING</Badge>;
      default:
        return <Badge variant="secondary">LOADING</Badge>;
    }
  }

  const hasFailures = results.some(r => r.status === "fail");
  const hasWarnings = results.some(r => r.status === "warning");

  return (
    <>
      <Navbar user={user} />
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">System Diagnostics</h1>
          <p className="text-muted-foreground">
            Check system health and configuration
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Overall Status</span>
              <Button onClick={runDiagnostics} size="sm" variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Rerun Tests
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Running diagnostics...</p>
            ) : hasFailures ? (
              <div className="flex items-center gap-2 text-red-600">
                <XCircle className="h-6 w-6" />
                <span className="font-semibold">
                  Critical issues detected - receptionist creation may fail
                </span>
              </div>
            ) : hasWarnings ? (
              <div className="flex items-center gap-2 text-yellow-600">
                <AlertCircle className="h-6 w-6" />
                <span className="font-semibold">
                  System operational with warnings
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-6 w-6" />
                <span className="font-semibold">All systems operational</span>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {results.map((result, index) => (
            <Card key={index}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-lg">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(result.status)}
                    <span>{result.name}</span>
                  </div>
                  {getStatusBadge(result.status)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm">{result.message}</p>
                {result.details && (
                  <pre className="text-xs bg-muted p-3 rounded overflow-auto">
                    {result.details}
                  </pre>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
