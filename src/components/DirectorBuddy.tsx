/**
 * DirectorBuddy — the Director's face.
 *
 * An original blue-heeler-inspired dog face (blue fur, upright ears,
 * light muzzle) with Bluey's behavior spec: gaze-tracking pupils (they
 * look at the live cursor), engagement moods (listening, talking,
 * pointing, sleepy, resting), drowsiness timers, calm blinking.
 * Presence (idle/working/needs-you) stays a separate data dot — mood is
 * about attention in the room, never about inventing urgency.
 *
 * Deliberately not the cartoon character: same warmth and palette
 * family, original drawing. The gaze/blink/mood machine is untouched.
 *
 * Sizes: compact (48px, headers) and medium (104px, the home section —
 * roughly a quarter of the card, the resting presence).
 */

import { useEffect, useRef, useState } from "react";
import { useActorRuns, useCursorGaze } from "@/components/ActorCursor";
import { resolveMood, type BuddyMood } from "@/lib/directorMood";

export type BuddyState = "idle" | "working" | "needs-you";
export type { BuddyMood } from "@/lib/directorMood";

const STATE_DOT: Record<BuddyState, string> = {
  idle: "bg-muted-foreground/40",
  working: "bg-primary",
  "needs-you": "bg-amber-500",
};

const FACE_PX = { compact: 48, medium: 104 } as const;

const INK = "hsl(222 32% 14% / 0.88)";

function Mouth({ mood }: { mood: BuddyMood }) {
  if (mood === "talking") {
    return (
      <g>
        <ellipse cx="24" cy="34" rx="3.4" ry="4.2" fill={INK} />
        <ellipse cx="24" cy="35.6" rx="1.7" ry="1.8" fill="hsl(0 65% 62% / 0.9)" />
      </g>
    );
  }
  if (mood === "sleepy") {
    return <line x1="20" y1="34" x2="28" y2="34" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />;
  }
  if (mood === "resting") {
    return <path d="M21 35 Q24 33.5 27 35" stroke={INK} strokeWidth="1.6" fill="none" strokeLinecap="round" />;
  }
  return <path d="M19 33 Q24 36.5 29 33" stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" />;
}

export function DirectorBuddy({
  state,
  line,
  size = "medium",
  briefingOpen = false,
  forceMood,
}: {
  state: BuddyState;
  line: string;
  size?: keyof typeof FACE_PX;
  briefingOpen?: boolean;
  /** Demo override: show this mood regardless of live state. */
  forceMood?: BuddyMood;
}) {
  const gaze = useCursorGaze();
  const runs = useActorRuns();
  const faceRef = useRef<HTMLDivElement>(null);
  const [idleMin, setIdleMin] = useState(0);

  useEffect(() => {
    let last = Date.now();
    const bump = () => {
      last = Date.now();
      setIdleMin(0);
    };
    const id = setInterval(() => {
      setIdleMin(Math.floor((Date.now() - last) / 60000));
    }, 30000);
    window.addEventListener("pointerdown", bump);
    window.addEventListener("keydown", bump);
    return () => {
      clearInterval(id);
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
    };
  }, []);

  const mood = forceMood ?? resolveMood({
    briefingOpen,
    runsActive: runs.length > 0,
    idleMinutes: idleMin,
  });

  // Pupils look at the live cursor, clamped to a few px. No cursor (or a
  // stale one) means eyes forward — never staring at a ghost.
  let gx = 0;
  let gy = 0;
  if (gaze && faceRef.current) {
    const r = faceRef.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    gx = Math.max(-2.5, Math.min(2.5, (gaze.x - cx) / 60));
    gy = Math.max(-2, Math.min(2, (gaze.y - cy) / 60));
  }
  const lidScale = mood === "resting" ? 0.12 : mood === "sleepy" ? 0.45 : 1;

  const px = FACE_PX[size];
  return (
    <div className="flex items-center gap-4" role="status" aria-label={`Assistant status: ${state}, mood ${mood}. ${line}`}>
      <div ref={faceRef} className="bluey-breathe relative shrink-0" style={{ width: px, height: px }} aria-hidden="true">
        <svg viewBox="0 0 48 48" className="h-full w-full drop-shadow-md">
          <defs>
            <radialGradient id={`buddy-fur-${size}`} cx="38%" cy="30%" r="78%">
              <stop offset="0%" stopColor="#7ba7e6" />
              <stop offset="100%" stopColor="#3f66a3" />
            </radialGradient>
          </defs>
          {/* Upright ears */}
          <path d="M11 16 L8 2 Q8 0.5 9.5 1 L20 9 Z" fill="#2e4a76" />
          <path d="M37 16 L40 2 Q40 0.5 38.5 1 L28 9 Z" fill="#2e4a76" />
          <path d="M12 13 L10.5 5 L17 10 Z" fill="#4a6fa0" />
          <path d="M36 13 L37.5 5 L31 10 Z" fill="#4a6fa0" />
          {/* Head */}
          <circle cx="24" cy="27" r="17" fill={`url(#buddy-fur-${size})`} />
          <ellipse cx="24" cy="27" rx="17" ry="17" fill="none" stroke="#2e4a76" strokeOpacity="0.4" strokeWidth="1.5" />
          {/* Tan brow dots */}
          <ellipse cx="17.5" cy="15.5" rx="2" ry="1.4" fill="#c9a06a" opacity="0.9" />
          <ellipse cx="30.5" cy="15.5" rx="2" ry="1.4" fill="#c9a06a" opacity="0.9" />
          {/* Light muzzle + nose */}
          <ellipse cx="24" cy="32" rx="8.5" ry="6" fill="#dce7f5" />
          <ellipse cx="24" cy="29.5" rx="2.6" ry="1.9" fill="#1e2a3a" />
          <g className="buddy-blink" style={{ transformOrigin: "24px 22px" }}>
            <g style={{ transform: `translate(${gx}px, ${gy}px) scale(1, ${lidScale})`, transformOrigin: "24px 22px" }}>
              <ellipse cx="17.5" cy="22" rx="3.2" ry="4.2" fill="white" />
              <ellipse cx="30.5" cy="22" rx="3.2" ry="4.2" fill="white" />
              <circle cx="18" cy="23" r="1.8" fill="hsl(222 30% 12%)" />
              <circle cx="31" cy="23" r="1.8" fill="hsl(222 30% 12%)" />
            </g>
          </g>
          <Mouth mood={mood} />
        </svg>
        <span className={`absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background ${STATE_DOT[state]}`} />
        <style>{`@keyframes buddy-blink { 0%, 92%, 100% { transform: scaleY(1); } 95%, 97% { transform: scaleY(0.08); } } .buddy-blink { animation: buddy-blink 5.2s ease-in-out infinite; } @media (prefers-reduced-motion: reduce) { .buddy-blink { animation: none; } }`}</style>
      </div>
      <div className="min-w-0">
        <p className={`${size === "medium" ? "text-base" : "text-sm"} font-medium leading-tight`}>{greetingLine()}</p>
        <p className={`${size === "medium" ? "text-sm" : "text-xs"} truncate text-muted-foreground`}>{line}</p>
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
