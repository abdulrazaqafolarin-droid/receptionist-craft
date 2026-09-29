import { cn } from "@/lib/utils";

interface FloatingBackgroundProps {
  className?: string;
  variant?: 'default' | 'minimal' | 'dense';
}

/**
 * Rutex BOS atmospheric background.
 * Quiet, static, non-distracting: two soft light sources behind the interface.
 * No floating icons, no pulsing orbs, no continuous animation.
 * Motion is reserved for state communication, not decoration.
 */
export function FloatingBackground({ className, variant = 'default' }: FloatingBackgroundProps) {
  if (variant === 'minimal') {
    return (
      <div className={cn("fixed inset-0 overflow-hidden pointer-events-none z-0", className)} aria-hidden="true">
        <div className="absolute top-[-10%] left-[10%] w-[560px] h-[320px] rounded-full bg-primary/[0.05] blur-3xl" />
      </div>
    );
  }

  return (
    <div className={cn("fixed inset-0 overflow-hidden pointer-events-none z-0", className)} aria-hidden="true">
      <div className="absolute top-[-12%] left-[8%] w-[640px] h-[360px] rounded-full bg-primary/[0.06] blur-3xl" />
      <div className="absolute bottom-[-20%] right-[-5%] w-[520px] h-[320px] rounded-full bg-muted-foreground/[0.06] blur-3xl" />
    </div>
  );
}
