import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useActiveOperatorStore } from "@/store/activeOperator";
import { isRouteVisible } from "@/lib/operatorSurface";

/**
 * Route gate for operator-scoped pages. When the active operator's approved
 * surface excludes this page, bounce to the dashboard with a plain-language
 * note instead of rendering a dead page.
 *
 * Pages with no surface set (older operators) always render — the gate only
 * restricts when an approved surface explicitly excludes the page.
 */
export function SurfaceGate({ children }: { children: React.ReactNode }) {
  const visiblePages = useActiveOperatorStore((s) => s.visiblePages);
  const operatorName = useActiveOperatorStore((s) => s.operatorName);
  const location = useLocation();

  const allowed = isRouteVisible(location.pathname, visiblePages);

  useEffect(() => {
    if (!allowed) {
      toast.info(
        `This feature isn't part of ${operatorName ?? "this operator"}'s setup — enable it in Builder.`,
      );
    }
  }, [allowed, operatorName]);

  if (!allowed) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
