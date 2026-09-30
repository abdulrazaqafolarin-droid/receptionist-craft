import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * RUTEX SPOTLIGHT CARD — Aceternity spotlight pattern, implemented natively.
 * A single soft light follows the pointer across one signature surface,
 * drawing attention without competing with content. Disabled on touch
 * devices and under prefers-reduced-motion (static surface instead).
 */
interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function SpotlightCard({ children, className, onMouseMove, ...props }: SpotlightCardProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    onMouseMove?.(e);
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    node.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
    node.classList.add("spotlight-active");
  };

  const handleLeave = () => {
    ref.current?.classList.remove("spotlight-active");
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={cn("spotlight-surface", className)}
      {...props}
    >
      {children}
    </div>
  );
}
