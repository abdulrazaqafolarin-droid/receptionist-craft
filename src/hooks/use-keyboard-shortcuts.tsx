import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export function useKeyboardShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl+K - Command palette (placeholder for future implementation)
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        console.log("Command palette shortcut triggered (Ctrl+K)");
        // Future: Open command palette modal
      }

      // Ctrl+N - New appointment
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        navigate("/appointments");
      }

      // Escape - Close modals/dialogs
      if (e.key === "Escape") {
        // This will be handled by individual modal components
        // Just log for now to confirm it's working
        console.log("Escape key pressed");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);
}
