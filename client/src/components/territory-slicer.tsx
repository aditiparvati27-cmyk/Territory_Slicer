import { useState, useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useData, segmentAccounts, distributeAccounts, calculateRepStats } from "@/lib/logic";
import { Loader2, TrendingUp, Users, DollarSign, Calculator } from "lucide-react";
import { Bar, BarChart, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";

// Custom Tooltip for the Chart
const CustomTooltip = ({ active, payload, label, formatCurrency }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-popover border border-border p-3 rounded-lg shadow-lg">
        <p className="font-medium text-popover-foreground mb-2">{label}</p>
        <div className="space-y-1 text-sm">
          <div className="flex items-center justify-between gap-4 text-muted-foreground">
            <span>Segment:</span>
            <span className={cn(
              "font-medium",
              data.segment === "Enterprise" ? "text-chart-2" : "text-chart-1"
            )}>{data.segment}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Total ARR:</span>
            <span className="font-mono font-medium text-foreground">{formatCurrency(data.totalARR)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Accounts:</span>
            <span className="font-mono font-medium text-foreground">{data.count}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export function TerritorySlicer() {
  const { reps, accounts, loading } = useData();
  const [threshold, setThreshold] = useState([100000]); // Array for slider component

  const processedData = useMemo(() => {
    if (loading || !reps.length || !accounts.length) return null;

    // 1. Segment
    const segmented = segmentAccounts(accounts, threshold[0]);
    
    // 2. Distribute
    const distributed = distributeAccounts(segmented, reps);

    // 3. Stats
    const stats = calculateRepStats(distributed, reps);

    // 4. Totals
    const totalARR = accounts.reduce((sum, acc) => sum + acc.ARR, 0);
    const entAccounts = segmented.filter(a => a.Segment === "Enterprise");
    const mmAccounts = segmented.filter(a => a.Segment === "Mid Market");
    
    // Separate reps by segment for detailed view
    const entReps = stats.filter(r => r.segment === "Enterprise");
    const mmReps = stats.filter(r => r.segment === "Mid Market");

    return {
      stats,
      totalARR,
      entCount: entAccounts.length,
      mmCount: mmAccounts.length,
      entARR: entAccounts.reduce((sum, a) => sum + a.ARR, 0),
      mmARR: mmAccounts.reduce((sum, a) => sum + a.ARR, 0),
      entReps,
      mmReps
    };
  }, [reps, accounts, threshold, loading]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!processedData) return <div>No data available</div>;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Territory Slicer</h1>
          <p className="text-muted-foreground mt-1">Optimize sales territories by employee count threshold</p>
        </div>
      </div>

      {/* CONTROL PANEL & SUMMARY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SLIDER CARD */}
        <Card className="lg:col-span-1 border-primary/10 shadow-lg bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-chart-2" />
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-muted-foreground">Employee Threshold</span>
                <Badge variant="outline" className="text-lg px-3 py-1 bg-background font-mono border-chart-2/20 text-chart-2">
                  {threshold[0].toLocaleString()}
                </Badge>
              </div>
              <Slider
                value={threshold}
                onValueChange={setThreshold}
                min={500}
                max={200000}
                step={5000}
                className="py-4"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>500</span>
                <span>200,000</span>
              </div>
            </div>

            <div className="pt-4 border-t border-border/50">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3 tracking-wider">Segmentation Impact</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-background/50 rounded-lg border border-border/50">
                  <div className="text-xs text-muted-foreground mb-1">Enterprise</div>
                  <div className="text-xl font-bold text-foreground">{processedData.entCount}</div>
                  <div className="text-xs text-muted-foreground mt-1">{formatCurrency(processedData.entARR)}</div>
                </div>
                <div className="p-3 bg-background/50 rounded-lg border border-border/50">
                  <div className="text-xs text-muted-foreground mb-1">Mid-Market</div>
                  <div className="text-xl font-bold text-foreground">{processedData.mmCount}</div>
                  <div className="text-xs text-muted-foreground mt-1">{formatCurrency(processedData.mmARR)}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* VISUALIZATION CARD */}
        <Card className="lg:col-span-2 border-primary/10 shadow-lg bg-card/50 backdrop-blur-sm">
           <CardHeader>
             <CardTitle className="text-lg font-medium flex items-center gap-2">
               <TrendingUp className="w-5 h-5 text-chart-1" />
               ARR Distribution Balance
             </CardTitle>
             <CardDescription>Visualizing revenue distribution across sales representatives</CardDescription>
           </CardHeader>
           <CardContent className="h-[300px]">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={processedData.stats} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis 
                    dataKey="name" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(val) => `$${(val/1000000).toFixed(1)}M`}
                  />
                  <Tooltip 
                    content={<CustomTooltip formatCurrency={formatCurrency} />}
                    cursor={{ fill: 'hsl(var(--muted)/0.2)' }}
                  />
                  <Bar dataKey="totalARR" radius={[4, 4, 0, 0]}>
                    {processedData.stats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.segment === "Enterprise" ? "hsl(var(--chart-2))" : "hsl(var(--chart-1))"} />
                    ))}
                  </Bar>
               </BarChart>
             </ResponsiveContainer>
           </CardContent>
        </Card>
      </div>

      {/* DETAILED STATS - SPLIT VIEW */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* ENTERPRISE SECTION */}
        <Card className="border-primary/10 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg font-medium flex items-center gap-2 text-chart-2">
                <Users className="w-5 h-5" />
                Enterprise Teams
              </CardTitle>
              <CardDescription className="mt-1">
                {processedData.entReps.length} Reps • {processedData.entCount} Accounts
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Total ARR</div>
              <div className="text-xl font-bold font-mono text-foreground">{formatCurrency(processedData.entARR)}</div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              {processedData.entReps.map((rep) => (
                <div key={rep.name} className="group flex items-center justify-between p-3 bg-background/40 rounded-lg border border-border/40 hover:bg-background/60 hover:border-chart-2/30 transition-all cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs bg-chart-2/10 text-chart-2 group-hover:bg-chart-2/20">
                      {rep.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-medium text-sm text-foreground">{rep.name}</div>
                      <div className="text-[10px] text-muted-foreground flex gap-1.5 uppercase tracking-wide">
                        <span>{rep.location}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase">Accounts</div>
                      <div className="font-mono text-sm font-medium">{rep.count}</div>
                    </div>
                    <div className="w-24">
                      <div className="text-[10px] text-muted-foreground uppercase">ARR</div>
                      <div className="font-mono text-sm font-bold text-foreground">{formatCurrency(rep.totalARR)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* MID-MARKET SECTION */}
        <Card className="border-primary/10 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
             <div>
              <CardTitle className="text-lg font-medium flex items-center gap-2 text-chart-1">
                <Users className="w-5 h-5" />
                Mid-Market Teams
              </CardTitle>
              <CardDescription className="mt-1">
                {processedData.mmReps.length} Reps • {processedData.mmCount} Accounts
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Total ARR</div>
              <div className="text-xl font-bold font-mono text-foreground">{formatCurrency(processedData.mmARR)}</div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              {processedData.mmReps.map((rep) => (
                <div key={rep.name} className="group flex items-center justify-between p-3 bg-background/40 rounded-lg border border-border/40 hover:bg-background/60 hover:border-chart-1/30 transition-all cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs bg-chart-1/10 text-chart-1 group-hover:bg-chart-1/20">
                      {rep.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-medium text-sm text-foreground">{rep.name}</div>
                      <div className="text-[10px] text-muted-foreground flex gap-1.5 uppercase tracking-wide">
                        <span>{rep.location}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase">Accounts</div>
                      <div className="font-mono text-sm font-medium">{rep.count}</div>
                    </div>
                    <div className="w-24">
                      <div className="text-[10px] text-muted-foreground uppercase">ARR</div>
                      <div className="font-mono text-sm font-bold text-foreground">{formatCurrency(rep.totalARR)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
