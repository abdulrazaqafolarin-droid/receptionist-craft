import { useEffect } from "react";

export function useKeyboardShortcuts() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl+K - Command palette (placeholder for future implementation)
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        console.log("Command palette shortcut triggered (Ctrl+K)");
        // Future: Open command palette modal
      }

      // Ctrl+N - New appointment (navigates via full page load to avoid router hook issues)
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        window.location.assign("/appointments");
      }

      // Escape - Close modals/dialogs
      if (e.key === "Escape") {
        console.log("Escape key pressed");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
