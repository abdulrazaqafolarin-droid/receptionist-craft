import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/Navbar";
import { useNavigate } from "react-router-dom";
import { Sparkles, Clock, Shield, Zap, MessageCircle, Calendar, BarChart3, ArrowRight, CheckCircle } from "lucide-react";
import { useState, useEffect } from "react";

const mockConversation = [
  { type: "user", text: "Hi, I'd like to book a haircut" },
  { type: "bot", text: "Hello! I'd be happy to help you book a haircut. What day works best for you?" },
  { type: "user", text: "Tomorrow at 2pm?" },
  { type: "bot", text: "Perfect! I have a slot available at 2pm tomorrow. May I have your name?" },
];

const ChatBubble = ({ message, isBot }: { message: string; isBot: boolean }) => (
  <div className={`flex ${isBot ? 'justify-start' : 'justify-end'} mb-4 animate-slide-up`}>
    <div className={`max-w-[85%] rounded-2xl px-5 py-3 shadow-md ${
      isBot 
        ? 'bg-card border border-border text-card-foreground' 
        : 'bg-gradient-to-br from-primary to-primary-glow text-primary-foreground'
    }`}>
      <p className="text-sm leading-relaxed">{message}</p>
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

  const benefits = [
    "24/7 customer support without hiring staff",
    "Never miss a booking or inquiry",
    "Reduce no-shows with automated reminders",
    "Professional response to every customer"
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-secondary/5 blur-3xl" />
        </div>
        
        <div className="container mx-auto px-4 py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="space-y-8 animate-fade-in">
              <Badge className="inline-flex gap-2 px-4 py-2 text-sm font-medium bg-primary/10 text-primary border-primary/20 hover:bg-primary/15 transition-colors">
                <Sparkles className="h-4 w-4" />
                No-code • Instant Preview • 24/7 Support
              </Badge>
              
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
                Create your AI receptionist in{" "}
                <span className="bg-gradient-to-r from-primary via-primary-glow to-secondary bg-clip-text text-transparent">
                  5 minutes
                </span>
              </h1>
              
              <p className="text-lg lg:text-xl text-muted-foreground max-w-xl leading-relaxed">
                No tech skills needed. Build, preview, and manage your AI receptionist that handles calls, books appointments, and captures leads — all in demo mode until you're ready.
              </p>

              {/* Benefits list */}
              <ul className="space-y-3">
                {benefits.map((benefit, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-muted-foreground">
                    <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
              
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Button 
                  size="lg" 
                  className="text-lg px-8 h-14 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all group"
                  onClick={() => navigate("/auth")}
                >
                  Start Free — Build My Receptionist
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="text-lg h-14 border-2 hover:bg-primary/5"
                  onClick={() => navigate("/help")}
                >
                  Watch Demo
                </Button>
              </div>
            </div>

            {/* Animated Chat Preview */}
            <div className="animate-float lg:pl-8">
              <Card className="p-6 shadow-2xl shadow-primary/10 border-2 border-primary/10 bg-card/80 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                  <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse shadow-lg shadow-green-500/50" />
                  <span className="font-semibold text-foreground">Live Demo Preview</span>
                  <Badge variant="secondary" className="ml-auto text-xs">AI Powered</Badge>
                </div>
                
                <div className="h-[380px] overflow-y-auto pr-2">
                  {mockConversation.slice(0, displayedMessages).map((msg, idx) => (
                    <ChatBubble 
                      key={idx} 
                      message={msg.text} 
                      isBot={msg.type === 'bot'} 
                    />
                  ))}
                  {displayedMessages < mockConversation.length && (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm pl-2">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span>Typing...</span>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-20 lg:py-28">
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-secondary/10 text-secondary border-secondary/20">Features</Badge>
          <h2 className="text-3xl lg:text-4xl font-bold mb-4">Everything you need to succeed</h2>
          <p className="text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto">
            Built for small businesses who want professional customer service without the overhead
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {features.map((feature, idx) => (
            <Card 
              key={idx} 
              className="group p-6 lg:p-8 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-1 border-2 border-transparent hover:border-primary/20 bg-card/50 backdrop-blur-sm"
            >
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/15 transition-colors">
                <feature.icon className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20 lg:py-28">
        <Card className="relative overflow-hidden p-8 lg:p-16 text-center border-2 border-primary/10">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />
          
          <div className="relative z-10">
            <Badge className="mb-6 bg-primary/10 text-primary border-primary/20">Get Started Today</Badge>
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">Ready to transform your business?</h2>
            <p className="text-lg lg:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              Join hundreds of small businesses using AI receptionists to never miss a customer call again
            </p>
            <Button 
              size="lg" 
              className="text-lg px-10 h-14 shadow-lg shadow-primary/25 hover:shadow-xl transition-all group"
              onClick={() => navigate("/auth")}
            >
              Get Started for Free
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10 bg-muted/30">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p className="text-sm">© 2025 Rutex FrontDesk Builder. Built with ❤️ for small businesses.</p>
        </div>
      </footer>
    </div>
  );
}
