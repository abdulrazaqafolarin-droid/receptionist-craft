import { useEffect } from "react";

export function useKeyboardShortcuts() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl+K - Rutex command palette
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("rutex:open-palette"));
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
