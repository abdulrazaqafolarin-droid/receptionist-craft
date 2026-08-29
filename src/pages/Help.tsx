import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  HelpCircle, Rocket, MessageSquare, Calendar, ShoppingBag, 
  Settings, BarChart3, Clock, Zap, BookOpen, ChevronRight,
  CheckCircle2, Users, Globe, Bell
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FloatingBackground } from "@/components/FloatingBackground";
import { recordSignal } from "@/lib/successSignals";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const GETTING_STARTED_STEPS = [
  {
    step: 1,
    title: "Create Your AI Receptionist",
    description: "Set up your business name, tone, and greeting message. The AI will auto-generate a knowledge base from your details.",
    action: "/onboarding-wizard",
    actionLabel: "Start Setup",
    icon: Rocket,
  },
  {
    step: 2,
    title: "Add Services & Products",
    description: "Define the services customers can book or products they can order. Set prices, durations, and stock levels.",
    action: "/services",
    actionLabel: "Manage Services",
    icon: ShoppingBag,
  },
  {
    step: 3,
    title: "Configure Availability",
    description: "Set your weekly business hours and block off holidays or vacation days. Slots are auto-generated for the next 60 days.",
    action: "/availability",
    actionLabel: "Set Hours",
    icon: Clock,
  },
  {
    step: 4,
    title: "Add FAQs",
    description: "Teach your AI receptionist common questions and answers so it can respond accurately to customers.",
    action: "/faqs",
    actionLabel: "Add FAQs",
    icon: MessageSquare,
  },
  {
    step: 5,
    title: "Test & Deploy",
    description: "Test the AI chat in the Builder preview, then install the widget on your website with a single code snippet.",
    action: "/builder",
    actionLabel: "Open Builder",
    icon: Zap,
  },
];

const FAQ_ITEMS = [
  {
    question: "How does the AI receptionist book appointments?",
    answer: "When a customer chats with your AI widget, it guides them through selecting a service, picking a date and time from your available slots, and collecting their name and contact info. Once confirmed, the appointment is saved automatically and you get a notification.",
  },
  {
    question: "Can I block specific dates or times?",
    answer: "Yes! Go to Availability > Time-Off & Exceptions to block specific date ranges. You can also use the Calendar page to block individual time slots. Blocked times immediately become unavailable in the customer widget.",
  },
  {
    question: "How do product orders work?",
    answer: "If your business sells products, the AI can guide customers through browsing, selecting quantities, and placing orders. Orders appear in your Orders & Appointments dashboard with full item details and status tracking.",
  },
  {
    question: "What timezone does the system use?",
    answer: "Your receptionist uses the timezone you set in Availability settings (defaults to Africa/Lagos). Customers always see times in their local timezone, but all bookings are stored in UTC for accuracy.",
  },
  {
    question: "Can I have multiple receptionists?",
    answer: "Yes! You can create multiple AI receptionists for different businesses or locations. Each has its own services, availability, FAQs, and conversation history.",
  },
  {
    question: "How do I install the widget on my website?",
    answer: "Go to the Builder page for your receptionist and click 'Get Embed Code'. Copy the script tag and paste it into your website's HTML before the closing </body> tag. The chat bubble will appear automatically.",
  },
  {
    question: "What happens when a customer returns mid-conversation?",
    answer: "The widget remembers the conversation and booking progress using session storage. Returning customers see a 'Continue our conversation' option and can pick up exactly where they left off.",
  },
  {
    question: "How do I see analytics and performance?",
    answer: "The Analytics dashboard shows conversation trends, booking rates, revenue attribution, AI quality scores, and per-receptionist breakdowns. Data updates in near real-time.",
  },
];

const QUICK_LINKS = [
  { title: "Dashboard", description: "Overview & stats", icon: BarChart3, path: "/dashboard" },
  { title: "Conversations", description: "Chat history", icon: MessageSquare, path: "/conversations" },
  { title: "Calendar", description: "Schedule view", icon: Calendar, path: "/calendar" },
  { title: "Notifications", description: "Alerts & updates", icon: Bell, path: "/notifications" },
  { title: "Organization", description: "Team & branding", icon: Users, path: "/organization" },
  { title: "Settings", description: "Account & preferences", icon: Settings, path: "/settings" },
];

export default function Help() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen">
      <FloatingBackground variant="minimal" />
      <div className="relative z-10 container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <HelpCircle className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold">Help & Getting Started</h1>
            <p className="text-muted-foreground">Everything you need to set up and manage your AI receptionist</p>
          </div>
        </div>

        {/* Getting Started Guide */}
        <section className="mb-10">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Getting Started Guide
          </h2>
          <div className="space-y-4">
            {GETTING_STARTED_STEPS.map((step) => (
              <Card key={step.step} className="border-2 border-border/50 hover:border-primary/20 transition-all">
                <CardContent className="flex items-start gap-4 p-5">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-primary-foreground font-bold text-sm shadow-md flex-shrink-0">
                    {step.step}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base mb-1">{step.title}</h3>
                    <p className="text-sm text-muted-foreground mb-3">{step.description}</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => navigate(step.action)}
                      className="group"
                    >
                      {step.actionLabel}
                      <ChevronRight className="ml-1 h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Quick Links */}
        <section className="mb-10">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Quick Links
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {QUICK_LINKS.map((link) => (
              <Card 
                key={link.path}
                className="cursor-pointer hover:shadow-lg hover:border-primary/20 transition-all group"
                onClick={() => navigate(link.path)}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors flex-shrink-0">
                    <link.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{link.title}</p>
                    <p className="text-xs text-muted-foreground">{link.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-10">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Frequently Asked Questions
          </h2>
          <Card className="border-2 border-border/50">
            <CardContent className="p-0">
              <Accordion type="single" collapsible className="w-full">
                {FAQ_ITEMS.map((faq, idx) => (
                  <AccordionItem key={idx} value={`faq-${idx}`} className="px-6">
                    <AccordionTrigger
                      className="text-left text-sm font-medium hover:no-underline"
                      onClick={() =>
                        recordSignal("navigation_help", { question: faq.question })
                      }
                    >
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </section>

        {/* Support */}
        <Card className="border-2 border-primary/20 bg-primary/5">
          <CardContent className="p-6 text-center">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <MessageSquare className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Need More Help?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Test your AI receptionist in the Builder to see how it handles customer conversations, 
              or check the Diagnostics page for system health information.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => navigate("/builder")} variant="outline">
                Open Builder
              </Button>
              <Button onClick={() => navigate("/diagnostics")}>
                System Diagnostics
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
