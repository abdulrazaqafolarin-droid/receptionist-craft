/**
 * Build-history glyph: two horizontal lines (upper longer than lower)
 * with a circle beneath both — reads as "past conversations" at a glance.
 * Shared by the talk-it-through chat and the Builder so both doors match.
 */
export function HistoryGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={className} aria-hidden="true">
      <line x1="4" y1="5.5" x2="20" y2="5.5" />
      <line x1="4" y1="10.5" x2="14.5" y2="10.5" />
      <circle cx="9" cy="17.5" r="3" />
    </svg>
  );
}
