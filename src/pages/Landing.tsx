import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/Navbar";
import { useNavigate } from "react-router-dom";
import { Sparkles, Clock, Shield, Zap, MessageCircle, Calendar, BarChart3 } from "lucide-react";
import { useState, useEffect } from "react";

const mockConversation = [
  { type: "user", text: "Hi, I'd like to book a haircut" },
  { type: "bot", text: "Hello! I'd be happy to help you book a haircut. What day works best for you?" },
  { type: "user", text: "Tomorrow at 2pm?" },
  { type: "bot", text: "Perfect! I have a slot available at 2pm tomorrow. May I have your name?" },
];

const ChatBubble = ({ message, isBot }: { message: string; isBot: boolean }) => (
  <div className={`flex ${isBot ? 'justify-start' : 'justify-end'} mb-3 animate-slide-up`}>
    <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${
      isBot 
        ? 'bg-card border border-border text-card-foreground' 
        : 'bg-gradient-to-br from-primary to-primary-glow text-primary-foreground'
    }`}>
      <p className="text-sm">{message}</p>
    </div>
  </div>
);

export default function Landing() {
  const navigate = useNavigate();
  const [displayedMessages, setDisplayedMessages] = useState<number>(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setDisplayedMessages((prev) => {
        if (prev < mockConversation.length) {
          return prev + 1;
        }
        return prev;
      });
    }, 1500);

    return () => clearInterval(timer);
  }, []);

  const features = [
    {
      icon: Clock,
      title: "5-Minute Setup",
      description: "Create your AI receptionist in minutes with our guided wizard"
    },
    {
      icon: Shield,
      title: "No Tech Skills",
      description: "Designed for business owners - no coding knowledge required"
    },
    {
      icon: Zap,
      title: "Instant Preview",
      description: "Test your receptionist with live chat simulation before going live"
    },
    {
      icon: MessageCircle,
      title: "Smart Conversations",
      description: "Handles FAQs, booking, and lead capture automatically"
    },
    {
      icon: Calendar,
      title: "Appointment Booking",
      description: "Seamlessly book and manage customer appointments"
    },
    {
      icon: BarChart3,
      title: "Analytics Dashboard",
      description: "Track conversations, leads, and bookings in real-time"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8 animate-fade-in">
            <Badge className="inline-flex gap-2 bg-gradient-to-r from-primary/10 to-primary/5 text-foreground border-primary/20">
              <Sparkles className="h-4 w-4" />
              No-code • Instant Preview • 24/7
            </Badge>
            
            <h1 className="text-5xl lg:text-6xl font-bold leading-tight">
              Create your AI receptionist in{" "}
              <span className="bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                5 minutes
              </span>
            </h1>
            
            <p className="text-xl text-muted-foreground">
              No tech skills needed. Build, preview, and manage your AI receptionist that handles calls, books appointments, and captures leads — all in demo mode until you're ready.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                size="lg" 
                className="text-lg px-8 shadow-lg hover:shadow-xl transition-shadow"
                onClick={() => navigate("/auth")}
              >
                Start Free — Build My Receptionist
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="text-lg"
                onClick={() => navigate("/help")}
              >
                Watch Demo
              </Button>
            </div>
          </div>

          {/* Animated Chat Preview */}
          <div className="animate-float">
            <Card className="p-6 shadow-2xl border-2 border-primary/10">
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border">
                <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                <span className="font-semibold">Live Demo Preview</span>
              </div>
              
              <div className="h-[400px] overflow-y-auto">
                {mockConversation.slice(0, displayedMessages).map((msg, idx) => (
                  <ChatBubble 
                    key={idx} 
                    message={msg.text} 
                    isBot={msg.type === 'bot'} 
                  />
                ))}
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-20 border-t border-border">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Everything you need to succeed</h2>
          <p className="text-xl text-muted-foreground">Built for small businesses who want professional phone answering</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, idx) => (
            <Card 
              key={idx} 
              className="p-6 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border-2 border-transparent hover:border-primary/20"
            >
              <feature.icon className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20 border-t border-border">
        <Card className="p-12 text-center bg-gradient-to-br from-primary/5 to-background border-2 border-primary/10">
          <h2 className="text-4xl font-bold mb-4">Ready to transform your business?</h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join hundreds of small businesses using AI receptionists to never miss a customer call again
          </p>
          <Button 
            size="lg" 
            className="text-lg px-8 shadow-lg"
            onClick={() => navigate("/auth")}
          >
            Get Started for Free
          </Button>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>© 2025 Aisha AI. Built with ❤️ for small businesses.</p>
        </div>
      </footer>
    </div>
  );
}
