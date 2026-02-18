import { useState, useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useData, segmentAccounts, distributeAccounts, calculateRepStats, type DistributionStrategy, type Account, type RepStats, type StrategyConfig, DEFAULT_STRATEGY_CONFIG } from "@/lib/logic";
import { Loader2, TrendingUp, Users, Target, MapPin, ShieldAlert, Scale, BrainCircuit, ChevronDown, Settings2, RotateCcw, Download } from "lucide-react";
import Papa from "papaparse";
import { saveAs } from "file-saver";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Bar, BarChart, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";
import { RepAccountsDialog } from "@/components/rep-accounts-dialog";

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
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">High Risk:</span>
            <span className="font-mono font-medium text-destructive">{data.highRiskCount}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Local:</span>
            <span className="font-mono font-medium text-chart-4">{data.sameStateCount}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export function TerritorySlicer() {
  const { reps, accounts, loading, error } = useData();
  const [threshold, setThreshold] = useState([100000]); // Array for slider component
  const [strategy, setStrategy] = useState<DistributionStrategy>("Pure ARR Balance");
  const [activeRep, setActiveRep] = useState<RepStats | null>(null);
  const [repDialogOpen, setRepDialogOpen] = useState(false);
  const [strategyConfig, setStrategyConfig] = useState<StrategyConfig>(DEFAULT_STRATEGY_CONFIG);

  const updateConfig = (patch: Partial<StrategyConfig>) => {
    setStrategyConfig(prev => ({ ...prev, ...patch }));
  };

  const processedData = useMemo(() => {
    if (loading || !reps.length || !accounts.length) return null;

    // 1. Segment
    const segmented = segmentAccounts(accounts, threshold[0]);
    
    // 2. Distribute (with configurable strategy weights + optional swap refinement)
    const distributed = distributeAccounts(segmented, reps, strategy, strategyConfig);

    // 3. Stats (with configurable high-risk threshold)
    const stats = calculateRepStats(distributed, reps, strategyConfig.highRiskThreshold);

    // 4. Totals
    const totalARR = accounts.reduce((sum, acc) => sum + acc.ARR, 0);
    const entAccounts = segmented.filter(a => a.Segment === "Enterprise");
    const mmAccounts = segmented.filter(a => a.Segment === "Mid Market");
    
    // Separate reps by segment for detailed view
    const entReps = stats.filter(r => r.segment === "Enterprise");
    const mmReps = stats.filter(r => r.segment === "Mid Market");

    function stdDev(values: number[]): number {
      if (values.length === 0) return 0;
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      return Math.sqrt(values.reduce((sq, v) => sq + Math.pow(v - mean, 2), 0) / values.length);
    }

    function computeSegmentMetrics(segStats: RepStats[]) {
      const active = segStats.filter(r => r.count > 0);
      if (active.length === 0) {
        return { arrStdDev: 0, arrMean: 0, arrRange: { min: 0, max: 0 }, workloadRange: 0, workloadMin: 0, workloadMax: 0, sameStatePct: 0, riskStdDev: 0, riskMean: 0, repCount: 0, accountCount: 0 };
      }
      const arrValues = active.map(r => r.totalARR);
      const arrMean = arrValues.reduce((a, b) => a + b, 0) / arrValues.length;
      const counts = active.map(r => r.count);
      const totalSameState = active.reduce((sum, r) => sum + r.sameStateCount, 0);
      const totalAccounts = active.reduce((sum, r) => sum + r.count, 0);
      const riskPcts = active.map(r => (r.highRiskCount / r.count) * 100);
      return {
        arrStdDev: stdDev(arrValues),
        arrMean,
        arrRange: { min: Math.min(...arrValues), max: Math.max(...arrValues) },
        workloadRange: Math.max(...counts) - Math.min(...counts),
        workloadMin: Math.min(...counts),
        workloadMax: Math.max(...counts),
        sameStatePct: totalAccounts > 0 ? (totalSameState / totalAccounts) * 100 : 0,
        riskStdDev: stdDev(riskPcts),
        riskMean: riskPcts.reduce((a, b) => a + b, 0) / riskPcts.length,
        repCount: active.length,
        accountCount: totalAccounts
      };
    }

    const entMetrics = computeSegmentMetrics(entReps);
    const mmMetrics = computeSegmentMetrics(mmReps);

    // Overall metrics (across all reps)
    const allActive = stats.filter(r => r.count > 0);
    const totalSameState = allActive.reduce((sum, r) => sum + r.sameStateCount, 0);
    const totalActiveAccounts = allActive.reduce((sum, r) => sum + r.count, 0);
    const overallSameStatePct = totalActiveAccounts > 0 ? (totalSameState / totalActiveAccounts) * 100 : 0;

    return {
      stats,
      totalARR,
      segmented,
      distributed,
      entCount: entAccounts.length,
      mmCount: mmAccounts.length,
      entARR: entAccounts.reduce((sum, a) => sum + a.ARR, 0),
      mmARR: mmAccounts.reduce((sum, a) => sum + a.ARR, 0),
      entReps,
      mmReps,
      entMetrics,
      mmMetrics,
      overallSameStatePct
    };
  }, [reps, accounts, threshold, strategy, strategyConfig, loading]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
  };

  const openRepDetails = (rep: RepStats) => {
    setActiveRep(rep);
    setRepDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!processedData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-title">Territory Slicer</h1>
          <p className="text-muted-foreground mt-1" data-testid="text-subtitle">Optimize sales territories by employee count threshold</p>
        </div>
        <div className="text-sm text-muted-foreground" data-testid="text-no-data">
          {error ? `${error.title}: ${error.message}` : "No data available"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <RepAccountsDialog
        open={repDialogOpen}
        onOpenChange={(open) => {
          setRepDialogOpen(open);
          if (!open) setActiveRep(null);
        }}
        rep={activeRep}
        accounts={processedData.distributed as Account[]}
        highRiskThreshold={strategyConfig.highRiskThreshold}
      />
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-title">Territory Slicer</h1>
          <p className="text-muted-foreground mt-1" data-testid="text-subtitle">Optimize sales territories by employee count threshold</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const rows = (processedData.distributed as Account[]).map(a => ({
              Account_ID: a.Account_ID,
              Account_Name: a.Account_Name,
              Assigned_Rep: a.Assigned_Rep ?? "",
              Segment: a.Segment ?? "",
              ARR: a.ARR,
              Location: a.Location,
              Num_Employees: a.Num_Employees,
              Risk_Score: a.Risk_Score,
              Current_Rep: a.Current_Rep,
            }));
            const csv = Papa.unparse(rows);
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
            saveAs(blob, `territory-assignments-${new Date().toISOString().slice(0, 10)}.csv`);
          }}
        >
          <Download className="w-4 h-4 mr-2" />
          Download Assignments
        </Button>
      </div>

      {/* CONTROL PANEL & SUMMARY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CONFIG CARD */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="border-primary/10 shadow-lg bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <SettingsIcon className="w-5 h-5 text-chart-2" />
                Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
            {/* THRESHOLD SLIDER */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-muted-foreground">Employee Threshold</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={500}
                    max={200000}
                    step={5000}
                    value={threshold[0]}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (Number.isFinite(next)) setThreshold([next]);
                    }}
                    onBlur={(e) => {
                      const raw = Number(e.target.value);
                      const clamped = Math.max(500, Math.min(200000, raw || 0));
                      const snapped = Math.round(clamped / 5000) * 5000;
                      setThreshold([snapped]);
                    }}
                    className="h-9 w-[140px] rounded-md border border-input bg-background/40 px-3 font-mono text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    data-testid="input-threshold"
                    aria-label="Employee threshold"
                  />
                  <Badge
                    variant="outline"
                    className="text-lg px-3 py-1 bg-background font-mono border-chart-2/20 text-chart-2"
                    data-testid="badge-threshold"
                  >
                    {threshold[0].toLocaleString()}
                  </Badge>
                </div>
              </div>
              <Slider
                value={threshold}
                onValueChange={setThreshold}
                min={500}
                max={200000}
                step={5000}
                className="py-4"
                data-testid="slider-threshold"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>500</span>
                <span>200,000</span>
              </div>
            </div>

            <div className="h-px bg-border/50" />

            {/* STRATEGY SELECTOR */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-muted-foreground">Distribution Strategy</label>
              <Select value={strategy} onValueChange={(val: DistributionStrategy) => setStrategy(val)}>
                <SelectTrigger className="w-full bg-background border-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pure ARR Balance">Pure ARR Balance</SelectItem>
                  <SelectItem value="ARR + Risk Balance">ARR + Risk Balance</SelectItem>
                  <SelectItem value="ARR + Geographic Clustering">ARR + Geographic Clustering</SelectItem>
                  <SelectItem value="Smart Multi-Factor">Smart Multi-Factor</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Strategy Info Box */}
              <div className="bg-muted/30 p-3 rounded-md border border-border/50 text-xs text-muted-foreground">
                 {strategy === "Pure ARR Balance" && (
                   <div className="flex gap-2">
                     <Target className="w-4 h-4 text-chart-1 shrink-0" />
                     <span><strong>Focus:</strong> Maximize revenue equity only. All reps get similar ARR targets.</span>
                   </div>
                 )}
                 {strategy === "ARR + Risk Balance" && (
                   <div className="flex gap-2">
                     <ShieldAlert className="w-4 h-4 text-chart-5 shrink-0" />
                     <span><strong>Focus:</strong> Balances revenue and risk exposure. Prevents one rep from getting all high-risk accounts.</span>
                   </div>
                 )}
                 {strategy === "ARR + Geographic Clustering" && (
                   <div className="flex gap-2">
                     <MapPin className="w-4 h-4 text-chart-4 shrink-0" />
                     <span><strong>Focus:</strong> Reduces travel costs by prioritizing accounts in the rep's home state.</span>
                   </div>
                 )}
                 {strategy === "Smart Multi-Factor" && (
                   <div className="flex gap-2">
                     <BrainCircuit className="w-4 h-4 text-chart-3 shrink-0" />
                     <span><strong>Focus:</strong> Complex balance of ARR, risk, geography, and workload equity.</span>
                   </div>
                 )}
              </div>
            </div>

            <div className="h-px bg-border/50" />

            {/* HIGH-RISK THRESHOLD SLIDER */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">High-Risk Threshold</span>
                <Badge variant="outline" className="font-mono text-xs px-2 py-0.5 border-chart-5/20 text-chart-5">
                  {">"} {strategyConfig.highRiskThreshold}
                </Badge>
              </div>
              <Slider
                value={[strategyConfig.highRiskThreshold]}
                onValueChange={([val]) => updateConfig({ highRiskThreshold: val })}
                min={50}
                max={90}
                step={5}
                className="py-2"
                data-testid="slider-risk-threshold"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>50 (more flagged)</span>
                <span>90 (fewer flagged)</span>
              </div>
            </div>

            <div className="h-px bg-border/50" />

            {/* ADVANCED SETTINGS — Tunable Weights */}
            <Collapsible>
              <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group">
                <span className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4" />
                  Advanced Settings
                </span>
                <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-4 pt-3">

                  {/* ARR + Risk Balance weights */}
                  <div className="space-y-2">
                    <h5 className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">ARR + Risk Balance</h5>
                    <WeightSlider label="Risk Penalty" value={strategyConfig.riskPenaltyPct}
                      onChange={(v) => updateConfig({ riskPenaltyPct: v })} min={1} max={20} step={1} />
                    <WeightSlider label="Risk Bonus" value={strategyConfig.riskBonusPct}
                      onChange={(v) => updateConfig({ riskBonusPct: v })} min={1} max={15} step={1} />
                  </div>

                  {/* ARR + Geographic Clustering weight */}
                  <div className="space-y-2">
                    <h5 className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">ARR + Geographic Clustering</h5>
                    <WeightSlider label="Geo Bonus" value={strategyConfig.geoBonusPct}
                      onChange={(v) => updateConfig({ geoBonusPct: v })} min={5} max={30} step={1} />
                  </div>

                  {/* Smart Multi-Factor weights */}
                  <div className="space-y-2">
                    <h5 className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Smart Multi-Factor</h5>
                    <WeightSlider label="Workload Penalty" value={strategyConfig.workloadPenaltyPct}
                      onChange={(v) => updateConfig({ workloadPenaltyPct: v })} min={1} max={15} step={1} />
                    <WeightSlider label="Geo Bonus" value={strategyConfig.multiGeoBonusPct}
                      onChange={(v) => updateConfig({ multiGeoBonusPct: v })} min={1} max={20} step={1} />
                    <WeightSlider label="Risk Penalty" value={strategyConfig.multiRiskPenaltyPct}
                      onChange={(v) => updateConfig({ multiRiskPenaltyPct: v })} min={1} max={15} step={1} />
                    <WeightSlider label="Risk Bonus" value={strategyConfig.multiRiskBonusPct}
                      onChange={(v) => updateConfig({ multiRiskBonusPct: v })} min={1} max={10} step={1} />
                  </div>

                  {/* Swap Refinement Toggle */}
                  <div className="space-y-2">
                    <h5 className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Optimization</h5>
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted-foreground">Swap Refinement</label>
                      <Switch
                        checked={strategyConfig.enableSwapRefinement}
                        onCheckedChange={(v) => updateConfig({ enableSwapRefinement: v })}
                        data-testid="switch-swap-refinement"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Post-greedy local search that swaps accounts between reps to improve balance</p>
                  </div>

                  {/* Reset to defaults */}
                  <button
                    type="button"
                    onClick={() => setStrategyConfig(DEFAULT_STRATEGY_CONFIG)}
                    className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset to defaults
                  </button>
                </div>
              </CollapsibleContent>
            </Collapsible>

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
        </div>

        {/* VISUALIZATION CARD */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-primary/10 shadow-lg bg-card/50 backdrop-blur-sm h-[400px]">
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

          {/* STRATEGY PERFORMANCE METRICS */}
          <Card className="border-primary/10 shadow-lg bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <Scale className="w-5 h-5 text-chart-3" />
                Strategy Performance
              </CardTitle>
              <CardDescription>How well this strategy distributes accounts within each segment</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Overall Same-State % */}
              <div className="mb-4 p-3 rounded-lg border border-border/50 bg-background/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="w-4 h-4 text-chart-4" />
                    <span className="text-sm font-medium">Overall Location Match</span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold font-mono">{processedData.overallSameStatePct.toFixed(1)}%</span>
                    <span className="text-xs text-chart-4 ml-2">of accounts match rep's location</span>
                  </div>
                </div>
              </div>

              {/* Segment Metrics Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 px-2 text-xs font-semibold uppercase text-muted-foreground tracking-wider">Metric</th>
                      <th className="text-center py-2 px-2 text-xs font-semibold uppercase text-chart-2 tracking-wider">Enterprise</th>
                      <th className="text-center py-2 px-2 text-xs font-semibold uppercase text-chart-1 tracking-wider">Mid-Market</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {/* ARR Spread */}
                    <tr className="hover:bg-background/30">
                      <td className="py-3 px-2">
                        <div className="font-medium text-foreground">ARR Spread</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">Std dev of total ARR per rep — lower = more even revenue split</div>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <div className="font-mono font-bold text-foreground">{formatCurrency(processedData.entMetrics.arrStdDev)}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">avg {formatCurrency(processedData.entMetrics.arrMean)}/rep</div>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <div className="font-mono font-bold text-foreground">{formatCurrency(processedData.mmMetrics.arrStdDev)}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">avg {formatCurrency(processedData.mmMetrics.arrMean)}/rep</div>
                      </td>
                    </tr>

                    {/* Workload Balance */}
                    <tr className="hover:bg-background/30">
                      <td className="py-3 px-2">
                        <div className="font-medium text-foreground">Workload Balance</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">Difference between most and fewest accounts per rep — lower = fairer</div>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <div className="font-mono font-bold text-foreground">{processedData.entMetrics.workloadRange}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{processedData.entMetrics.workloadMin}–{processedData.entMetrics.workloadMax} accts/rep</div>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <div className="font-mono font-bold text-foreground">{processedData.mmMetrics.workloadRange}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{processedData.mmMetrics.workloadMin}–{processedData.mmMetrics.workloadMax} accts/rep</div>
                      </td>
                    </tr>

                    {/* Same-State % */}
                    <tr className="hover:bg-background/30">
                      <td className="py-3 px-2">
                        <div className="font-medium text-foreground">Location Match %</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">Accounts assigned to a rep in the same region — higher = less travel</div>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <div className="font-mono font-bold text-foreground">{processedData.entMetrics.sameStatePct.toFixed(1)}%</div>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <div className="font-mono font-bold text-foreground">{processedData.mmMetrics.sameStatePct.toFixed(1)}%</div>
                      </td>
                    </tr>

                    {/* Risk Balance */}
                    <tr className="hover:bg-background/30">
                      <td className="py-3 px-2">
                        <div className="font-medium text-foreground">Risk Balance</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">Variation in high-risk account % across reps — lower = risk shared evenly</div>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <div className="font-mono font-bold text-foreground">{processedData.entMetrics.riskStdDev.toFixed(1)}%</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">avg {processedData.entMetrics.riskMean.toFixed(0)}% high-risk</div>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <div className="font-mono font-bold text-foreground">{processedData.mmMetrics.riskStdDev.toFixed(1)}%</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">avg {processedData.mmMetrics.riskMean.toFixed(0)}% high-risk</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

        </div>
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
                <div
                  key={rep.name}
                  className="group flex items-center justify-between p-3 bg-background/40 rounded-lg border border-border/40 hover:bg-background/60 hover:border-chart-2/30 transition-all cursor-pointer"
                  onClick={() => openRepDetails(rep)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") openRepDetails(rep);
                  }}
                  data-testid={`card-rep-enterprise-${rep.name}`}
                >
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
                <div
                  key={rep.name}
                  className="group flex items-center justify-between p-3 bg-background/40 rounded-lg border border-border/40 hover:bg-background/60 hover:border-chart-1/30 transition-all cursor-pointer"
                  onClick={() => openRepDetails(rep)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") openRepDetails(rep);
                  }}
                  data-testid={`card-rep-midmarket-${rep.name}`}
                >
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

function WeightSlider({
  label, value, onChange, min, max, step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className="text-[11px] font-mono font-medium text-foreground">{value}%</span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
        className="py-1"
      />
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
