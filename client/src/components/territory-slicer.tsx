import { useState, useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useData, segmentAccounts, distributeAccounts, calculateRepStats } from "@/lib/logic";
import { Loader2, TrendingUp } from "lucide-react";
import { Bar, BarChart, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";

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

    return {
      stats,
      totalARR,
      entCount: entAccounts.length,
      mmCount: mmAccounts.length,
      entARR: entAccounts.reduce((sum, a) => sum + a.ARR, 0),
      mmARR: mmAccounts.reduce((sum, a) => sum + a.ARR, 0),
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
                    contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                    formatter={(val: number) => formatCurrency(val)}
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

      {/* DETAILED STATS TABLE */}
      <Card className="border-primary/10 bg-card/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-medium">Rep Assignments</CardTitle>
          <div className="flex gap-4 text-sm text-muted-foreground">
             <div className="flex items-center gap-2">
               <div className="w-3 h-3 rounded-full bg-chart-2"></div>
               <span>Enterprise</span>
             </div>
             <div className="flex items-center gap-2">
               <div className="w-3 h-3 rounded-full bg-chart-1"></div>
               <span>Mid-Market</span>
             </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
             {processedData.stats.map((rep) => (
               <div key={rep.name} className="flex items-center justify-between p-4 bg-background/40 rounded-lg border border-border/40 hover:bg-background/60 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm",
                      rep.segment === "Enterprise" ? "bg-chart-2/20 text-chart-2" : "bg-chart-1/20 text-chart-1"
                    )}>
                      {rep.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-medium text-foreground">{rep.name}</div>
                      <div className="text-xs text-muted-foreground flex gap-2">
                        <span>{rep.location}</span>
                        <span>•</span>
                        <span>{rep.segment}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-8">
                     <div className="text-right">
                       <div className="text-xs text-muted-foreground">Accounts</div>
                       <div className="font-mono font-medium">{rep.count}</div>
                     </div>
                     <div className="text-right w-32">
                       <div className="text-xs text-muted-foreground">Total ARR</div>
                       <div className="font-mono font-bold text-foreground">{formatCurrency(rep.totalARR)}</div>
                     </div>
                     <div className="w-24">
                        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                          <div 
                            className={cn("h-full rounded-full", rep.segment === "Enterprise" ? "bg-chart-2" : "bg-chart-1")} 
                            style={{ width: `${(rep.totalARR / (processedData.totalARR / reps.length) * 100) * 0.2}%` }} // Simplified visual scaling
                          />
                        </div>
                     </div>
                  </div>
               </div>
             ))}
          </div>
        </CardContent>
      </Card>
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
