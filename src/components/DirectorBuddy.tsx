/**
 * DirectorBuddy — the Director's face on the dashboard.
 *
 * An original Rutex character (round buddy, blinking eyes, soft glow),
 * never borrowed artwork. Presence is wired to real data only:
 * idle (nothing happening), working (background jobs running), needs-you
 * (failed jobs or open attention items). The status line always says what
 * and how many — a face that cries wolf gets ignored, so this one never
 * performs urgency it cannot cite.
 */

export type BuddyState = "idle" | "working" | "needs-you";

const STATE_DOT: Record<BuddyState, string> = {
  idle: "bg-muted-foreground/40",
  working: "bg-primary",
  "needs-you": "bg-amber-500",
};

export function DirectorBuddy({
  state,
  line,
}: {
  state: BuddyState;
  line: string;
}) {
  return (
    <div className="flex items-center gap-3" role="status" aria-label={`Assistant status: ${state}. ${line}`}>
      <div className="relative h-12 w-12 shrink-0" aria-hidden="true">
        <svg viewBox="0 0 48 48" className="h-full w-full drop-shadow-md">
          <defs>
            <radialGradient id="buddy-body" cx="38%" cy="32%" r="75%">
              <stop offset="0%" stopColor="hsl(var(--primary) / 0.9)" />
              <stop offset="100%" stopColor="hsl(var(--primary) / 0.55)" />
            </radialGradient>
          </defs>
          <circle cx="24" cy="26" r="18" fill="url(#buddy-body)" />
          <ellipse cx="24" cy="26" rx="18" ry="18" fill="none" stroke="hsl(var(--primary) / 0.35)" strokeWidth="1.5" />
          <g className="buddy-blink" style={{ transformOrigin: "24px 22px" }}>
            <ellipse cx="17.5" cy="22" rx="3.2" ry="4.2" fill="white" />
            <ellipse cx="30.5" cy="22" rx="3.2" ry="4.2" fill="white" />
            <circle cx="18" cy="23" r="1.8" fill="hsl(222 30% 12%)" />
            <circle cx="31" cy="23" r="1.8" fill="hsl(222 30% 12%)" />
          </g>
          <path d="M19 32 Q24 35.5 29 32" stroke="hsl(0 0% 100% / 0.9)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </svg>
        <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background ${STATE_DOT[state]}`} />
        <style>{`@keyframes buddy-blink { 0%, 92%, 100% { transform: scaleY(1); } 95%, 97% { transform: scaleY(0.08); } } .buddy-blink { animation: buddy-blink 5.2s ease-in-out infinite; } @media (prefers-reduced-motion: reduce) { .buddy-blink { animation: none; } }`}</style>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight">{greetingLine()}</p>
        <p className="truncate text-xs text-muted-foreground">{line}</p>
      </div>
    </div>
  );
}

function greetingLine(): string {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
