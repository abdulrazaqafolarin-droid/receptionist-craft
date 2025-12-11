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
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { KeyboardShortcutsProvider } from "@/components/KeyboardShortcutsProvider";

import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import OnboardingWizard from "./pages/OnboardingWizard";
import Dashboard from "./pages/Dashboard";
import Builder from "./pages/Builder";
import Appointments from "./pages/Appointments";
import Conversations from "./pages/Conversations";
import Settings from "./pages/Settings";
import Help from "./pages/Help";
import QualityReview from "./pages/QualityReview";
import Analytics from "./pages/Analytics";
import KBRewrite from "./pages/KBRewrite";
import Diagnostics from "./pages/Diagnostics";
import Notifications from "./pages/Notifications";
import RealtimeLogs from "./pages/RealtimeLogs";
import Services from "./pages/Services";
import Availability from "./pages/Availability";
import Widget from "./pages/Widget";
import ConfirmAppointment from "./pages/ConfirmAppointment";
import CancelAppointment from "./pages/CancelAppointment";
import ManageBooking from "./pages/ManageBooking";
import WidgetInstall from "./pages/WidgetInstall";
import FAQManagement from "./pages/FAQManagement";
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
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <KeyboardShortcutsProvider>
          {/* Public routes - accessible to everyone */}
          <Routes>
            {/* Widget and public appointment actions - always accessible */}
            <Route path="/widget" element={<Widget />} />
            <Route path="/appointments/confirm" element={<ConfirmAppointment />} />
            <Route path="/appointments/cancel" element={<CancelAppointment />} />
            <Route path="/booking/:id" element={<ManageBooking />} />
            <Route path="/cancel/:id" element={<CancelAppointment />} />
            <Route path="/confirm/:id" element={<ConfirmAppointment />} />
            <Route path="/help" element={<Help />} />
            
            {/* Auth routes - for non-authenticated users */}
            {!session && (
              <>
                <Route path="/" element={<Landing />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="*" element={<Navigate to="/auth" replace />} />
              </>
            )}
            
            {/* Protected routes - wrapped in sidebar for authenticated users */}
            {session && (
              <>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/auth" element={<Navigate to="/dashboard" replace />} />
                <Route
                  path="*"
                  element={
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
                              <Route path="/dashboard" element={<Dashboard />} />
                              <Route path="/onboarding" element={<Onboarding />} />
                              <Route path="/onboarding-wizard" element={<OnboardingWizard />} />
                              <Route path="/builder" element={<Builder />} />
                              <Route path="/builder/:id" element={<Builder />} />
                              <Route path="/conversations" element={<Conversations />} />
                              <Route path="/appointments" element={<Appointments />} />
                              <Route path="/services" element={<Services />} />
                              <Route path="/availability" element={<Availability />} />
                              <Route path="/faqs" element={<FAQManagement />} />
                              <Route path="/analytics" element={<Analytics />} />
                              <Route path="/quality-review" element={<QualityReview />} />
                              <Route path="/kb-rewrite" element={<KBRewrite />} />
                              <Route path="/diagnostics" element={<Diagnostics />} />
                              <Route path="/notifications" element={<Notifications />} />
                              <Route path="/realtime-logs" element={<RealtimeLogs />} />
                              <Route path="/settings" element={<Settings />} />
                              <Route path="/widget-install/:id" element={<WidgetInstall />} />
                              <Route path="*" element={<NotFound />} />
                            </Routes>
                          </main>
                        </div>
                      </div>
                    </SidebarProvider>
                  }
                />
              </>
            )}
          </Routes>
            </KeyboardShortcutsProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
