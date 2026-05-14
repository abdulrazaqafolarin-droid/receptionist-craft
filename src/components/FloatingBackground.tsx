import { cn } from "@/lib/utils";
import { 
  MessageSquare, 
  Calendar, 
  Clock, 
  Star, 
  Sparkles, 
  Zap,
  Bot,
  Headphones
} from "lucide-react";

interface FloatingBackgroundProps {
  className?: string;
  variant?: 'default' | 'minimal' | 'dense';
}

const icons = [
  { Icon: MessageSquare, delay: 0, size: 24 },
  { Icon: Calendar, delay: 2, size: 20 },
  { Icon: Clock, delay: 4, size: 22 },
  { Icon: Star, delay: 1, size: 18 },
  { Icon: Sparkles, delay: 3, size: 20 },
  { Icon: Zap, delay: 5, size: 16 },
  { Icon: Bot, delay: 2.5, size: 26 },
  { Icon: Headphones, delay: 1.5, size: 18 },
];

const positions = [
  { top: '10%', left: '5%' },
  { top: '20%', right: '8%' },
  { top: '35%', left: '3%' },
  { top: '45%', right: '5%' },
  { top: '60%', left: '7%' },
  { top: '70%', right: '4%' },
  { top: '85%', left: '4%' },
  { top: '15%', right: '15%' },
];

export function FloatingBackground({ className, variant = 'default' }: FloatingBackgroundProps) {
  const iconCount = variant === 'minimal' ? 4 : variant === 'dense' ? 8 : 6;
  
  return (
    <div className={cn("fixed inset-0 overflow-hidden pointer-events-none z-0", className)}>
      {icons.slice(0, iconCount).map(({ Icon, delay, size }, index) => {
        const pos = positions[index];
        return (
          <div
            key={index}
            className="absolute animate-float opacity-[0.08] text-primary"
            style={{
              ...pos,
              animationDelay: `${delay}s`,
              animationDuration: `${8 + index * 0.5}s`,
              transform: 'translateZ(0)',
              willChange: 'transform',
            }}
          >
            <Icon 
              size={size} 
              className="drop-shadow-sm"
              strokeWidth={1.5}
            />
          </div>
        );
      })}
      
      {/* Gradient orbs for extra depth — will-change for GPU compositing */}
      <div 
        className="absolute top-[20%] left-[10%] w-64 h-64 rounded-full bg-primary/5 blur-3xl animate-pulse"
        style={{ animationDuration: '8s', transform: 'translateZ(0)', willChange: 'transform' }}
      />
      <div 
        className="absolute bottom-[30%] right-[5%] w-48 h-48 rounded-full bg-accent/5 blur-3xl animate-pulse"
        style={{ animationDuration: '10s', animationDelay: '2s', transform: 'translateZ(0)', willChange: 'transform' }}
      />
      <div 
        className="absolute top-[60%] left-[50%] w-32 h-32 rounded-full bg-secondary/5 blur-2xl animate-pulse"
        style={{ animationDuration: '6s', animationDelay: '4s', transform: 'translateZ(0)', willChange: 'transform' }}
      />
    </div>
  );
}
