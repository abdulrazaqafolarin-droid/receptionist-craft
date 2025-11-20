import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Navbar } from "@/components/Navbar";

import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Builder from "./pages/Builder";
import Appointments from "./pages/Appointments";
import Conversations from "./pages/Conversations";
import Settings from "./pages/Settings";
import Help from "./pages/Help";
import QualityReview from "./pages/QualityReview";
import Analytics from "./pages/Analytics";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Protected Route Component
const ProtectedRoute = ({ children, session }: { children: React.ReactNode; session: Session | null }) => {
  if (!session) {
    return <Navigate to="/auth" replace />;
  }
  return <>{children}</>;
};

const App = () => {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          {session ? (
            <SidebarProvider>
              <div className="flex min-h-screen w-full">
                <AppSidebar />
                <div className="flex-1 flex flex-col">
                  <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
                    <div className="container mx-auto px-4 flex h-16 items-center gap-4">
                      <SidebarTrigger />
                      <div className="flex-1" />
                      <Navbar user={session?.user} />
                    </div>
                  </header>
                  <main className="flex-1">
                    <Routes>
                      <Route path="/" element={<Navigate to="/dashboard" replace />} />
                      <Route path="/dashboard" element={<ProtectedRoute session={session}><Dashboard /></ProtectedRoute>} />
                      <Route path="/builder" element={<ProtectedRoute session={session}><Builder /></ProtectedRoute>} />
                      <Route path="/conversations" element={<ProtectedRoute session={session}><Conversations /></ProtectedRoute>} />
                      <Route path="/appointments" element={<ProtectedRoute session={session}><Appointments /></ProtectedRoute>} />
                      <Route path="/analytics" element={<ProtectedRoute session={session}><Analytics /></ProtectedRoute>} />
                      <Route path="/quality-review" element={<ProtectedRoute session={session}><QualityReview /></ProtectedRoute>} />
                      <Route path="/settings" element={<ProtectedRoute session={session}><Settings /></ProtectedRoute>} />
                      <Route path="/help" element={<Help />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </main>
                </div>
              </div>
            </SidebarProvider>
          ) : (
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/help" element={<Help />} />
              <Route path="*" element={<Navigate to="/auth" replace />} />
            </Routes>
          )}
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
