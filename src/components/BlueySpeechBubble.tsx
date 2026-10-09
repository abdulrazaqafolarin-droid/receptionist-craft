/**
 * BlueySpeechBubble — the cursor's voice, extracted for reuse.
 *
 * White cloud, primary outline, tail, pop-in motion. Same bubble the
 * overlay, demo, and Director narration share — one look, one file.
 */

export function BlueySpeechBubble({
  text,
  onDismiss,
  wide = false,
}: {
  text: string;
  onDismiss?: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className={`fixed bottom-24 left-1/2 z-[91] w-[calc(100%-2rem)] -translate-x-1/2 bluey-bubble-in motion-reduce:animate-none ${wide ? "max-w-md" : "max-w-sm"}`}
      role="status"
    >
      <div className="relative rounded-2xl border-2 border-primary/40 bg-card p-3 shadow-xl">
        <p className="text-sm">{text}</p>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="mt-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        )}
        <span
          className="absolute -bottom-[7px] left-8 h-3.5 w-3.5 rotate-45 border-b-2 border-r-2 border-primary/40 bg-card"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
