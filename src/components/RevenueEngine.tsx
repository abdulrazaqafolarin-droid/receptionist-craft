import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, Zap, Target, Users, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RevenueEngineProps {
  receptionistId: string;
  currentMode?: string;
  onModeChange?: (mode: string) => void;
}

interface ConversionStats {
  bookings: number;
  leads: number;
  orders: number;
  totalRevenue: number;
  currency: string;
}

export function RevenueEngine({ receptionistId, currentMode = 'booking', onModeChange }: RevenueEngineProps) {
  const [aiMode, setAiMode] = useState<'support' | 'booking' | 'sales'>(currentMode as 'support' | 'booking' | 'sales');
  const [loading, setLoading] = useState(false);
  const [conversionStats, setConversionStats] = useState<ConversionStats>({
    bookings: 0,
    leads: 0,
    orders: 0,
    totalRevenue: 0,
    currency: 'USD'
  });

  useEffect(() => {
    loadConversionStats();
  }, [receptionistId]);

  const loadConversionStats = async () => {
    try {
      // Get conversion events for the last 30 days with revenue
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from('conversion_events')
        .select('event_type, revenue_value, currency')
        .eq('receptionist_id', receptionistId)
        .gte('created_at', thirtyDaysAgo.toISOString());

      if (error) throw error;

      const stats: ConversionStats = {
        bookings: data?.filter(e => e.event_type === 'booking_completed').length || 0,
        leads: data?.filter(e => e.event_type === 'lead_captured').length || 0,
        orders: data?.filter(e => e.event_type === 'order_completed').length || 0,
        totalRevenue: data?.reduce((sum, e) => sum + (Number(e.revenue_value) || 0), 0) || 0,
        currency: data?.[0]?.currency || 'USD'
      };

      setConversionStats(stats);
    } catch (error) {
      console.error('Error loading conversion stats:', error);
    }
  };
  
  // Format currency with symbol
  const fmtCurrency = (amount: number, currency: string) => {
    return formatCurrencyUtil(amount, currency);
  };

  const handleModeChange = async (newMode: 'support' | 'booking' | 'sales') => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('receptionists')
        .update({ ai_mode: newMode })
        .eq('id', receptionistId);

      if (error) throw error;

      setAiMode(newMode);
      onModeChange?.(newMode);
      
      const modeLabels = {
        support: 'Support Mode',
        booking: 'Booking Mode', 
        sales: 'Money Mode 💰'
      };
      
      toast.success(`Switched to ${modeLabels[newMode]}`);
    } catch (error: any) {
      console.error('Error updating AI mode:', error);
      toast.error('Failed to update AI mode');
    } finally {
      setLoading(false);
    }
  };

  const isMoneyMode = aiMode === 'sales';

  return (
    <Card className="border-2 border-border/50 shadow-lg overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-b border-border/50">
        <CardTitle className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <span>Revenue Engine</span>
            {isMoneyMode && (
              <Badge className="ml-2 bg-amber-500 text-white animate-pulse">
                <Zap className="h-3 w-3 mr-1" />
                Active
              </Badge>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          Turn conversations into bookings & sales
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        {/* Mode Selector */}
        <div className="space-y-4">
          <Label className="text-sm font-medium">AI Behavior Mode</Label>
          
          <div className="grid gap-3">
            {/* Support Mode */}
            <button
              onClick={() => handleModeChange('support')}
              disabled={loading}
              className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                aiMode === 'support' 
                  ? 'border-blue-500 bg-blue-500/10' 
                  : 'border-border hover:border-blue-500/50 hover:bg-muted/50'
              }`}
            >
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                aiMode === 'support' ? 'bg-blue-500' : 'bg-muted'
              }`}>
                <Users className={`h-5 w-5 ${aiMode === 'support' ? 'text-white' : 'text-muted-foreground'}`} />
              </div>
              <div className="flex-1">
                <div className="font-medium">Support Mode</div>
                <div className="text-sm text-muted-foreground">Answer questions helpfully</div>
              </div>
              {aiMode === 'support' && (
                <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">Active</Badge>
              )}
            </button>

            {/* Booking Mode */}
            <button
              onClick={() => handleModeChange('booking')}
              disabled={loading}
              className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                aiMode === 'booking' 
                  ? 'border-primary bg-primary/10' 
                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
              }`}
            >
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                aiMode === 'booking' ? 'bg-primary' : 'bg-muted'
              }`}>
                <Target className={`h-5 w-5 ${aiMode === 'booking' ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
              </div>
              <div className="flex-1">
                <div className="font-medium">Booking Mode</div>
                <div className="text-sm text-muted-foreground">Guide users to appointments</div>
              </div>
              {aiMode === 'booking' && (
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Active</Badge>
              )}
            </button>

            {/* Sales/Money Mode */}
            <button
              onClick={() => handleModeChange('sales')}
              disabled={loading}
              className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                aiMode === 'sales' 
                  ? 'border-amber-500 bg-gradient-to-r from-amber-500/20 to-orange-500/20' 
                  : 'border-border hover:border-amber-500/50 hover:bg-amber-500/5'
              }`}
            >
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                aiMode === 'sales' ? 'bg-gradient-to-br from-amber-500 to-orange-500' : 'bg-muted'
              }`}>
                <DollarSign className={`h-5 w-5 ${aiMode === 'sales' ? 'text-white' : 'text-muted-foreground'}`} />
              </div>
              <div className="flex-1">
                <div className="font-medium flex items-center gap-2">
                  Money Mode
                  <span className="text-lg">💰</span>
                </div>
                <div className="text-sm text-muted-foreground">AI actively drives conversions</div>
              </div>
              {aiMode === 'sales' && (
                <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">Active</Badge>
              )}
            </button>
          </div>
        </div>

        {/* Money Mode Description */}
        {isMoneyMode && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
            <h4 className="font-medium text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Money Mode Active
            </h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• AI actively guides toward bookings & purchases</li>
              <li>• Reduces choices to drive decisions</li>
              <li>• Handles objections confidently</li>
              <li>• Captures contact details before ending</li>
              <li>• Introduces urgency when users hesitate</li>
            </ul>
          </div>
        )}

        {/* Revenue Attribution - THE MOAT */}
        {conversionStats.totalRevenue > 0 && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">AI Helped Generate</div>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(conversionStats.totalRevenue, conversionStats.currency)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Conversion Stats */}
        <div className="pt-4 border-t border-border/50">
          <Label className="text-sm font-medium mb-3 block">Last 30 Days Conversions</Label>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold text-primary">{conversionStats.bookings}</div>
              <div className="text-xs text-muted-foreground">Bookings</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold text-green-600">{conversionStats.leads}</div>
              <div className="text-xs text-muted-foreground">Leads</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold text-amber-600">{conversionStats.orders}</div>
              <div className="text-xs text-muted-foreground">Orders</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
