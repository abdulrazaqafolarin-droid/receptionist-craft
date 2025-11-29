import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

export function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
  useKeyboardShortcuts();
  return <>{children}</>;
}
