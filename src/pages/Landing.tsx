import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/Navbar";
import { useNavigate } from "react-router-dom";
import { Clock, Shield, Zap, MessageCircle, Calendar, BarChart3, ArrowRight, Headphones, Phone, CheckSquare, Award, Wrench } from "lucide-react";
import rutexLogo from "@/assets/rutex-logo.jpg";
import aiReceptionistHero from "@/assets/ai-receptionist-hero.png";

// Benefit card data with icons
const benefitCards = [
  {
    icon: Wrench,
    title: "24/7 Customer Support",
    description: "Never leave customers waiting, even after hours.",
    floatDelay: "0s",
  },
  {
    icon: Phone,
    title: "Never Miss a Booking",
    description: "Every call, chat, and inquiry handled instantly.",
    floatDelay: "0.5s",
  },
  {
    icon: CheckSquare,
    title: "Reduce No-Shows",
    description: "Automated reminders that keep customers committed.",
    floatDelay: "1s",
  },
  {
    icon: Award,
    title: "Professional Every Time",
    description: "Consistent, polite, business-ready responses.",
    floatDelay: "1.5s",
  },
];

// Hero Benefit Card Component
const HeroBenefitCard = ({ 
  icon: Icon, 
  title, 
  description, 
  index,
  floatDelay,
}: { 
  icon: React.ElementType; 
  title: string; 
  description: string;
  index: number;
  floatDelay: string;
}) => (
  <div 
    className="
      relative rounded-2xl sm:rounded-3xl p-4 sm:p-5 
      bg-white/60 backdrop-blur-lg border border-primary/10
      shadow-md hover:shadow-lg
      flex items-start gap-3 sm:gap-4
      opacity-0 animate-hero-fade-up
      transition-all duration-300 ease-out
      hover:-translate-y-1 hover:bg-white/80 hover:border-primary/20
      cursor-default
    "
    style={{ 
      animationDelay: `${0.3 + index * 0.12}s`,
      animationFillMode: 'forwards',
    }}
  >
    {/* Continuous floating animation wrapper */}
    <div 
      className="absolute inset-0 rounded-2xl sm:rounded-3xl animate-float-card pointer-events-none"
      style={{ animationDelay: floatDelay }}
    />
    <div className="relative flex-shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-primary/10 flex items-center justify-center">
      <Icon className="w-5 h-5 sm:w-5 sm:h-5 text-primary" />
    </div>
    <div className="relative flex-1 min-w-0">
      <h3 className="font-semibold text-sm sm:text-base text-foreground mb-0.5">{title}</h3>
      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  </div>
);

export default function Landing() {
  const navigate = useNavigate();

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
      
      {/* Hero Section - Premium SaaS Design matching reference */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 via-background to-background" aria-labelledby="hero-title">
        {/* Ambient floating glows */}
        <div className="absolute -top-32 right-0 w-72 sm:w-96 h-72 sm:h-96 bg-primary/20 rounded-full blur-3xl animate-float-ambient-1" aria-hidden="true" />
        <div className="absolute top-1/2 -left-40 w-64 sm:w-80 h-64 sm:h-80 bg-primary/15 rounded-full blur-3xl animate-float-ambient-2" aria-hidden="true" />
        
        <div className="container mx-auto px-4 pt-8 sm:pt-12 lg:pt-16 pb-8 sm:pb-12 lg:pb-16">
          <div className="relative max-w-6xl mx-auto">
            
            {/* Main layout container */}
            <div className="relative">
              
              {/* Badge - top left */}
              <div 
                className="inline-flex items-center gap-2 px-4 sm:px-5 py-2 rounded-full bg-white/70 backdrop-blur-md border border-primary/20 text-primary text-xs sm:text-sm font-medium shadow-sm opacity-0 animate-hero-fade-up mb-4 sm:mb-6"
                style={{ animationDelay: '0s', animationFillMode: 'forwards' }}
              >
                <img src={rutexLogo} alt="" className="h-4 w-4 rounded object-cover" aria-hidden="true" />
                No-code • Instant Preview • 24/7 Support
              </div>

              {/* Headline */}
              <h1 
                id="hero-title" 
                className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold tracking-tight text-foreground opacity-0 animate-hero-fade-up mb-4 sm:mb-6"
                style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}
              >
                Create your AI receptionist in{" "}
                <br className="hidden sm:block" />
                <span className="text-primary">5 minutes</span>
              </h1>

              {/* Two column layout for description + image */}
              <div className="relative lg:grid lg:grid-cols-2 lg:gap-8">
                
                {/* Left column: Description + First 2 benefits */}
                <div className="relative z-10">
                  {/* Description */}
                  <p 
                    className="text-base sm:text-lg text-muted-foreground max-w-md leading-relaxed opacity-0 animate-hero-fade-up mb-6 sm:mb-8"
                    style={{ animationDelay: '0.2s', animationFillMode: 'forwards' }}
                  >
                    No tech skills needed. Build, preview, and manage your AI receptionist that handles calls, books appointments, and captures leads — all in demo mode until you're ready.
                  </p>

                  {/* First 2 benefit cards - stacked on left */}
                  <div className="space-y-3 sm:space-y-4 max-w-md">
                    {benefitCards.slice(0, 2).map((benefit, idx) => (
                      <HeroBenefitCard 
                        key={idx}
                        icon={benefit.icon}
                        title={benefit.title}
                        description={benefit.description}
                        index={idx}
                        floatDelay={benefit.floatDelay}
                      />
                    ))}
                  </div>
                </div>

                {/* Right column: AI Receptionist Image */}
                <div className="relative lg:absolute lg:right-0 lg:top-0 lg:w-1/2 flex justify-center lg:justify-end my-6 lg:my-0" aria-hidden="true">
                  <div className="relative w-full max-w-sm lg:max-w-md">
                    <img 
                      src={aiReceptionistHero} 
                      alt="AI Receptionist" 
                      className="w-full h-auto object-contain"
                    />
                  </div>
                </div>
              </div>

              {/* Bottom 2 benefit cards - side by side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-4 sm:mt-6 max-w-2xl">
                {benefitCards.slice(2, 4).map((benefit, idx) => (
                  <HeroBenefitCard 
                    key={idx + 2}
                    icon={benefit.icon}
                    title={benefit.title}
                    description={benefit.description}
                    index={idx + 2}
                    floatDelay={benefit.floatDelay}
                  />
                ))}
              </div>
              
              {/* CTA Buttons */}
              <div 
                className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-6 sm:pt-8 max-w-xl opacity-0 animate-hero-fade-up"
                style={{ animationDelay: '0.5s', animationFillMode: 'forwards' }}
              >
                <Button 
                  size="lg" 
                  className="w-full sm:w-auto text-base sm:text-lg px-6 sm:px-8 py-4 h-auto rounded-full shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 transition-all group"
                  onClick={() => navigate("/auth")}
                >
                  Start Free — Build My Receptionist
                  <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
                </Button>
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="w-full sm:w-auto text-base sm:text-lg px-6 sm:px-8 py-4 h-auto rounded-full border-2 border-primary/20 bg-white/70 backdrop-blur hover:bg-white text-primary hover:text-primary transition-all"
                  onClick={() => navigate("/help")}
                >
                  Watch Demo
                </Button>
              </div>
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
