import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/Navbar";
import { useNavigate } from "react-router-dom";
import { Clock, Shield, Zap, MessageCircle, Calendar, BarChart3, ArrowRight, Headphones, Phone, CheckSquare, Award } from "lucide-react";
import { useState, useEffect } from "react";
import rutexLogo from "@/assets/rutex-logo.jpg";

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

// Benefit card data
const benefitCards = [
  {
    icon: Headphones,
    title: "24/7 Customer Support",
    description: "Never leave customers waiting, even after hours.",
    floatClass: "animate-float-slow-1",
    delay: "0ms",
  },
  {
    icon: Phone,
    title: "Never Miss a Booking",
    description: "Every call, chat, and inquiry handled instantly.",
    floatClass: "animate-float-slow-2",
    delay: "120ms",
  },
  {
    icon: CheckSquare,
    title: "Reduce No-Shows",
    description: "Automated reminders that keep customers committed.",
    floatClass: "animate-float-slow-3",
    delay: "240ms",
  },
  {
    icon: Award,
    title: "Professional Every Time",
    description: "Consistent, polite, business-ready responses.",
    floatClass: "animate-float-slow-4",
    delay: "360ms",
  },
];

// Liquid Glass Benefit Card Component
const BenefitCard = ({ 
  icon: Icon, 
  title, 
  description, 
  floatClass, 
  delay 
}: { 
  icon: React.ElementType; 
  title: string; 
  description: string;
  floatClass: string;
  delay: string;
}) => (
  <div 
    className={`
      liquid-glass rounded-2xl sm:rounded-3xl p-4 sm:p-5 
      flex items-start gap-3 sm:gap-4
      opacity-0 animate-benefit-enter
      ${floatClass}
      cursor-default
      transition-all duration-300 ease-out
    `}
    style={{ animationDelay: delay }}
  >
    <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary/10 flex items-center justify-center">
      <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
    </div>
    <div className="flex-1 min-w-0">
      <h3 className="font-semibold text-sm sm:text-base text-foreground mb-0.5 sm:mb-1">{title}</h3>
      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{description}</p>
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
      <section className="relative overflow-hidden" aria-labelledby="hero-title">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          <div className="absolute top-0 right-0 w-[300px] sm:w-[450px] lg:w-[600px] h-[300px] sm:h-[450px] lg:h-[600px] rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-[200px] sm:w-[300px] lg:w-[400px] h-[200px] sm:h-[300px] lg:h-[400px] rounded-full bg-secondary/5 blur-3xl" />
        </div>
        
        <div className="container mx-auto px-4 py-12 sm:py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-16 items-center">
            <div className="space-y-6 sm:space-y-8 animate-fade-in">
              <Badge className="inline-flex gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium bg-primary/10 text-primary border-primary/20 hover:bg-primary/15 transition-colors">
                <img src={rutexLogo} alt="Rutex" className="h-4 w-4 sm:h-5 sm:w-5 rounded object-cover" aria-hidden="true" />
                No-code • Instant Preview • 24/7 Support
              </Badge>
              
              <h1 id="hero-title" className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold leading-tight tracking-tight">
                Create your AI receptionist in{" "}
                <span className="bg-gradient-to-r from-primary via-primary-glow to-secondary bg-clip-text text-transparent">
                  5 minutes
                </span>
              </h1>
              
              <p className="text-base sm:text-lg lg:text-xl text-muted-foreground max-w-xl leading-relaxed">
                No tech skills needed. Build, preview, and manage your AI receptionist that handles calls, books appointments, and captures leads — all in demo mode until you're ready.
              </p>

              {/* Liquid Glass Benefits Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-2" aria-label="Key benefits">
                {benefitCards.map((benefit, idx) => (
                  <BenefitCard 
                    key={idx}
                    icon={benefit.icon}
                    title={benefit.title}
                    description={benefit.description}
                    floatClass={benefit.floatClass}
                    delay={benefit.delay}
                  />
                ))}
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-2 sm:pt-4">
                <Button 
                  size="lg" 
                  className="text-base sm:text-lg px-6 sm:px-8 h-12 sm:h-14 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all group touch-target w-full sm:w-auto"
                  onClick={() => navigate("/auth")}
                >
                  Start Free — Build My Receptionist
                  <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
                </Button>
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="text-base sm:text-lg h-12 sm:h-14 border-2 hover:bg-primary/5 touch-target w-full sm:w-auto"
                  onClick={() => navigate("/help")}
                >
                  Watch Demo
                </Button>
              </div>
            </div>

            {/* Animated Chat Preview */}
            <div className="animate-float lg:pl-8 hidden sm:block" aria-hidden="true">
              <Card className="p-4 sm:p-6 shadow-2xl shadow-primary/10 border-2 border-primary/10 bg-card/80 backdrop-blur-sm">
                <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-border">
                  <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-green-500 animate-pulse shadow-lg shadow-green-500/50" />
                  <span className="font-semibold text-sm sm:text-base text-foreground">Live Demo Preview</span>
                  <Badge variant="secondary" className="ml-auto text-xs">AI Powered</Badge>
                </div>
                
                <div className="h-[280px] sm:h-[380px] overflow-y-auto pr-2 scrollbar-premium">
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
      <section className="container mx-auto px-4 py-12 sm:py-16 lg:py-24" aria-labelledby="features-title">
        <div className="text-center mb-10 sm:mb-16">
          <Badge className="mb-3 sm:mb-4 bg-secondary/10 text-secondary border-secondary/20">Features</Badge>
          <h2 id="features-title" className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4">Everything you need to succeed</h2>
          <p className="text-base sm:text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto">
            Built for small businesses who want professional customer service without the overhead
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          {features.map((feature, idx) => (
            <Card 
              key={idx} 
              className="group p-5 sm:p-6 lg:p-8 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-1 border-2 border-transparent hover:border-primary/20 bg-card/50 backdrop-blur-sm focus-within:ring-2 focus-within:ring-ring"
              tabIndex={0}
            >
              <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 sm:mb-6 group-hover:bg-primary/15 transition-colors" aria-hidden="true">
                <feature.icon className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-2 sm:mb-3">{feature.title}</h3>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">{feature.description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-12 sm:py-16 lg:py-24" aria-labelledby="cta-title">
        <Card className="relative overflow-hidden p-6 sm:p-8 lg:p-16 text-center border-2 border-primary/10">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" aria-hidden="true" />
          
          <div className="relative z-10">
            <Badge className="mb-4 sm:mb-6 bg-primary/10 text-primary border-primary/20">Get Started Today</Badge>
            <h2 id="cta-title" className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4">Ready to transform your business?</h2>
            <p className="text-base sm:text-lg lg:text-xl text-muted-foreground mb-6 sm:mb-10 max-w-2xl mx-auto">
              Join hundreds of small businesses using AI receptionists to never miss a customer call again
            </p>
            <Button 
              size="lg" 
              className="text-base sm:text-lg px-6 sm:px-10 h-12 sm:h-14 shadow-lg shadow-primary/25 hover:shadow-xl transition-all group touch-target w-full sm:w-auto"
              onClick={() => navigate("/auth")}
            >
              Get Started for Free
              <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
            </Button>
          </div>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 sm:py-10 bg-muted/30">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p className="text-xs sm:text-sm">© 2025 Rutex FrontDesk Builder. Built with ❤️ for small businesses.</p>
        </div>
      </footer>
    </div>
  );
}
