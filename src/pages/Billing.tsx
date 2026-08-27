import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CreditCard, ArrowLeft, Check, Zap, Building2, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Subscription {
  id: string;
  plan: string;
  status: string;
  provider: string;
  current_period_end: string | null;
  trial_end: string | null;
  created_at: string;
}

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    icon: CreditCard,
    features: [
      "1 receptionist",
      "50 customers",
      "500 messages/month",
      "Basic analytics",
      "Web widget",
    ],
    color: "border-border",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    period: "/month",
    icon: Zap,
    features: [
      "5 receptionists",
      "500 customers",
      "5,000 messages/month",
      "Advanced analytics",
      "WhatsApp + Phone channels",
      "Payment collection",
      "Customer memory",
      "Priority support",
    ],
    color: "border-primary",
    popular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "$99",
    period: "/month",
    icon: Building2,
    features: [
      "Unlimited receptionists",
      "Unlimited customers",
      "Unlimited messages",
      "Multi-location support",
      "Staff management",
      "Escalation system",
      "Custom integrations",
      "Dedicated support",
    ],
    color: "border-amber-500",
  },
];

export default function Billing() {
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);

  useEffect(() => {
    loadSubscription();
  }, []);

  async function loadSubscription() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    setSubscription(data);
    setLoading(false);
  }

  async function handleUpgrade(planId: string) {
    if (planId === "free") return;
    setUpgrading(planId);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const { data, error } = await supabase.functions.invoke("create-subscription-checkout", {
        body: { plan_id: planId, user_id: user.id },
      });

      if (error) throw error;

      if (data?.mode === "checkout" && data.authorization_url) {
        // Paystack — redirect to hosted payment page
        window.location.href = data.authorization_url;
        return;
      }

      if (data?.mode === "checkout" && data.client_secret) {
        // Stripe — for now, fall back to manual upgrade
        // TODO: Open Stripe Checkout modal with client_secret
      }

      if (data?.mode === "manual") {
        // No payment provider — do manual upgrade
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        if (subscription) {
          const { error: updErr } = await supabase
            .from("subscriptions")
            .update({
              plan: planId,
              status: "active",
              provider: "manual",
              current_period_start: now.toISOString(),
              current_period_end: periodEnd.toISOString(),
            })
            .eq("id", subscription.id);
          if (updErr) throw updErr;
        } else {
          const { error: insErr } = await supabase.from("subscriptions").insert({
            user_id: user.id,
            plan: planId,
            status: "active",
            provider: "manual",
            current_period_start: now.toISOString(),
            current_period_end: periodEnd.toISOString(),
          });
          if (insErr) throw insErr;
        }

        await supabase.from("profiles").update({ plan: planId }).eq("id", user.id);
        toast.success(`Upgraded to ${planId.charAt(0).toUpperCase() + planId.slice(1)} plan`);
        await loadSubscription();
      }
    } catch (err: any) {
      console.error("Upgrade error:", err);
      toast.error(err.message || "Upgrade failed");
    } finally {
      setUpgrading(null);
    }
  }

  const currentPlan = subscription?.plan || "free";

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Billing</h1>
          <p className="text-muted-foreground mt-1">
            Manage your subscription and plan
          </p>
        </div>
      </div>

      {/* Current Plan Banner */}
      {subscription && (
        <Card className="border-2 border-primary/20 bg-primary/5">
          <CardContent className="flex items-center justify-between p-5">
            <div className="flex items-center gap-3">
              <Crown className="h-6 w-6 text-primary" />
              <div>
                <p className="font-medium">
                  Current plan:{" "}
                  <span className="text-primary capitalize">{subscription.plan}</span>
                </p>
                {subscription.current_period_end && (
                  <p className="text-sm text-muted-foreground">
                    {subscription.status === "active"
                      ? `Renews ${new Date(subscription.current_period_end).toLocaleDateString()}`
                      : `Expires ${new Date(subscription.current_period_end).toLocaleDateString()}`}
                  </p>
                )}
              </div>
            </div>
            <Badge variant={subscription.status === "active" ? "default" : "secondary"}>
              {subscription.status}
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Plan Cards */}
      {loading ? (
        <div className="grid md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-2 border-border/50">
              <CardHeader>
                <div className="h-6 w-24 bg-muted rounded" />
                <div className="h-8 w-16 bg-muted rounded mt-2" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="h-4 bg-muted rounded" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            const isCurrent = currentPlan === plan.id;
            return (
              <Card
                key={plan.id}
                className={`border-2 ${plan.color} relative ${
                  plan.popular ? "shadow-lg shadow-primary/10" : ""
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground px-3">
                      Most Popular
                    </Badge>
                  </div>
                )}
                <CardHeader className="text-center pt-8">
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <div className="mt-2">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    variant={isCurrent ? "secondary" : plan.popular ? "default" : "outline"}
                    disabled={isCurrent || upgrading === plan.id}
                    onClick={() => handleUpgrade(plan.id)}
                  >
                    {isCurrent
                      ? "Current Plan"
                      : upgrading === plan.id
                      ? "Upgrading..."
                      : plan.id === "free"
                      ? "Downgrade"
                      : `Upgrade to ${plan.name}`}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Info */}
      <Card className="border-dashed">
        <CardContent className="py-6 text-center">
          <p className="text-sm text-muted-foreground">
            Payments are processed securely via Stripe or Paystack. You can
            cancel anytime. All plans include a 14-day free trial for paid
            tiers.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
