/**
 * Director lab — BlueyDemo: the cursor playground.
 *
 * Exercises every cursor state and control in isolation (no credentials,
 * no AI calls, no side effects): states, size, glow, visibility, follow,
 * home, bounce test, speech bubbles. If it moves wrong here, it moves
 * wrong everywhere — this page is the single place to prove motion.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ActorCursor, ActorOverlay, useActorHost, type CursorSize,
} from "@/components/ActorCursor";
import { BlueySpeechBubble } from "@/components/BlueySpeechBubble";
import { DirectorBuddy, type BuddyMood } from "@/components/DirectorBuddy";

const SIZES: CursorSize[] = [48, 72, 96, 120];
const MOODS: BuddyMood[] = ["listening", "talking", "pointing", "sleepy", "resting"];

export default function BlueyDemo() {
  const navigate = useNavigate();
  const host = useActorHost();
  const [size, setSize] = useState<CursorSize>(72);
  const [glow, setGlow] = useState(true);
  const [mood, setMood] = useState<BuddyMood>("listening");
  const [demoBubble, setDemoBubble] = useState<string | null>(null);

  return (
    <div className="relative min-h-screen bg-background">
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
        <header className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Go back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="type-page truncate">Director lab</h1>
            <p className="type-caption">Cursor playground — every state, control, and bubble. Nothing here touches data.</p>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cursor</CardTitle>
              <CardDescription>Teardrop body, Bluey range 48–120, glow, follow, home.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <div className="flex w-full items-center gap-1 rounded-lg border border-border p-0.5" role="group" aria-label="Cursor size">
                {SIZES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSize(s)}
                    aria-pressed={size === s}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium ${size === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <Button variant={glow ? "default" : "outline"} size="sm" onClick={() => setGlow((v) => !v)} aria-pressed={glow}>
                Glow {glow ? "on" : "off"}
              </Button>
              <Button variant={host.follow ? "default" : "outline"} size="sm" onClick={() => host.toggleFollow()} aria-pressed={host.follow}>
                Follow {host.follow ? "on" : "off"}
              </Button>
              <Button variant="outline" size="sm" onClick={host.goHome}>Go home</Button>
              <Button variant="outline" size="sm" onClick={host.bounce}>Bounce test</Button>
              <Button variant="outline" size="sm" onClick={() => host.setVisible(false)}>Hide</Button>
              <Button variant="outline" size="sm" onClick={() => host.setVisible(true)}>Show</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Buddy face</CardTitle>
              <CardDescription>Moods drive the mouth and lids; presence dot stays data.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-center">
                <DirectorBuddy state="idle" line={`Mood: ${mood} (demo)`} size="compact" forceMood={mood} />
              </div>
              <div className="flex flex-wrap gap-2">
                {MOODS.map((m) => (
                  <Button key={m} variant={mood === m ? "default" : "outline"} size="sm" onClick={() => setMood(m)} aria-pressed={mood === m}>
                    {m}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Speech bubble</CardTitle>
              <CardDescription>White cloud, primary outline, tail. Same component the tours use.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setDemoBubble("Watching your shelf — Paracetamol is low and Vitamin C expires next week.")}>
                Show bubble
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDemoBubble(null)}>
                Dismiss
              </Button>
            </CardContent>
          </Card>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Move your mouse with Follow on. Reduced-motion settings calm every animation on this page.
        </p>
      </div>

      <ActorCursor point={host.point} swallow={host.swallow} arriving={host.arriving} size={size} glow={glow} bouncing={host.bouncing} />
      <ActorOverlay
        ring={host.ring}
        bubble={host.bubble}
        showcase={host.showcase}
        confirmAsk={host.confirmAsk}
        running={host.running}
        onStop={host.stop}
        onDismissBubble={host.dismissBubble}
        onDismissShowcase={host.dismissShowcase}
        onAnswerConfirm={host.answerConfirm}
      />
      {demoBubble && <BlueySpeechBubble text={demoBubble} onDismiss={() => setDemoBubble(null)} wide />}
    </div>
  );
}
