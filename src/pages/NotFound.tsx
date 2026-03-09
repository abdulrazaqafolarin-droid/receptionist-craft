import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Home, ArrowLeft, AlertTriangle } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-accent/20 p-4">
      <Card className="max-w-md w-full p-8 sm:p-12 text-center border-2 border-primary/10 shadow-xl">
        <div className="h-16 w-16 mx-auto mb-6 rounded-2xl bg-primary/10 flex items-center justify-center">
          <AlertTriangle className="h-8 w-8 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold text-primary mb-3">404</h1>
        <p className="text-lg sm:text-xl font-semibold text-foreground mb-2">Page not found</p>
        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="touch-target"
          >
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Go Back
          </Button>
          <Button
            onClick={() => navigate("/")}
            className="touch-target"
          >
            <Home className="mr-2 h-4 w-4" aria-hidden="true" />
            Home
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default NotFound;
