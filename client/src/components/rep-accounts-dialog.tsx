import { useMemo, useState } from "react";
import type { Account, RepStats } from "@/lib/logic";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Building2, MapPin, ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val);
}

function riskLabel(score: number) {
  if (score >= 80) return { label: "High", tone: "destructive" as const };
  if (score >= 60) return { label: "Med", tone: "secondary" as const };
  return { label: "Low", tone: "outline" as const };
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function RepAccountsDialog({
  open,
  onOpenChange,
  rep,
  accounts,
  highRiskThreshold = 70,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rep: RepStats | null;
  accounts: Account[];
  highRiskThreshold?: number;
}) {
  const [query, setQuery] = useState("");

  const repAccounts = useMemo(() => {
    if (!rep) return [];

    const mine = accounts.filter(
      (a) => a.Assigned_Rep === rep.name && (a.Segment ?? "") === rep.segment
    );

    const q = query.trim().toLowerCase();
    const filtered = q
      ? mine.filter((a) => {
          const id = String(a.Account_ID ?? "").toLowerCase();
          const name = String(a.Account_Name ?? "").toLowerCase();
          const loc = String(a.Location ?? "").toLowerCase();
          return id.includes(q) || name.includes(q) || loc.includes(q);
        })
      : mine;

    return [...filtered].sort((a, b) => (b.ARR ?? 0) - (a.ARR ?? 0));
  }, [rep, accounts, query]);

  const summary = useMemo(() => {
    const totalARR = repAccounts.reduce((s, a) => s + (a.ARR ?? 0), 0);
    const highRisk = repAccounts.reduce((s, a) => s + ((a.Risk_Score ?? 0) > highRiskThreshold ? 1 : 0), 0);
    const inState = rep ? repAccounts.reduce((s, a) => s + (a.Location === rep.location ? 1 : 0), 0) : 0;
    return { totalARR, highRisk, inState, count: repAccounts.length };
  }, [repAccounts, rep]);

  const headerGradient = rep?.segment === "Enterprise" ? "from-chart-2/25" : "from-chart-1/25";
  const accent = rep?.segment === "Enterprise" ? "text-chart-2" : "text-chart-1";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[980px] overflow-hidden border-primary/10 bg-card/70 p-0 shadow-2xl backdrop-blur-xl">
        <div className={cn("relative border-b border-border/60 bg-gradient-to-b", headerGradient, "to-background/20")}
          data-testid="panel-rep-accounts-header"
        >
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-start justify-between gap-4">
              <DialogHeader className="space-y-2">
                <DialogTitle className="flex items-center gap-2" data-testid="text-rep-accounts-title">
                  <span className={cn("inline-flex h-10 w-10 items-center justify-center rounded-full border", rep?.segment === "Enterprise" ? "border-chart-2/25 bg-chart-2/10" : "border-chart-1/25 bg-chart-1/10")}
                    data-testid="img-rep-avatar"
                  >
                    <Building2 className={cn("h-5 w-5", accent)} />
                  </span>
                  <span className="leading-tight">
                    <span className="block text-xl font-semibold">{rep?.name ?? "Rep"}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {rep?.segment ?? ""} • {rep?.location ?? ""}
                    </span>
                  </span>
                </DialogTitle>
                <DialogDescription data-testid="text-rep-accounts-subtitle">
                  Detailed account assignments for the currently selected strategy and employee threshold.
                </DialogDescription>
              </DialogHeader>

              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-background/40 text-muted-foreground transition hover:bg-background/60 hover:text-foreground"
                data-testid="button-close-rep-accounts"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2" data-testid="group-rep-accounts-kpis">
                <Badge variant="outline" className="bg-background/40" data-testid="badge-rep-accounts-count">
                  {summary.count} accounts
                </Badge>
                <Badge variant="outline" className="bg-background/40 font-mono" data-testid="badge-rep-accounts-arr">
                  {formatCurrency(summary.totalARR)} ARR
                </Badge>
                <Badge
                  variant="outline"
                  className={cn("bg-background/40", summary.highRisk > 0 ? "border-destructive/30 text-destructive" : "")}
                  data-testid="badge-rep-accounts-high-risk"
                >
                  <span className="inline-flex items-center gap-1">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    {summary.highRisk} high risk
                  </span>
                </Badge>
                <Badge variant="outline" className="bg-background/40" data-testid="badge-rep-accounts-in-state">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {summary.inState} in-state
                  </span>
                </Badge>
              </div>

              <div className="w-full sm:w-[360px]">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by account name, ID, or location…"
                  className="bg-background/40"
                  data-testid="input-rep-accounts-search"
                />
              </div>
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        </div>

        <div className="p-6" data-testid="panel-rep-accounts-body">
          {repAccounts.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/30 p-10 text-center"
              data-testid="empty-rep-accounts"
            >
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              <div className="text-sm font-medium">No accounts found</div>
              <div className="text-xs text-muted-foreground">
                Try a different search, or choose another rep.
              </div>
            </div>
          ) : (
            <ScrollArea className="h-[420px]" data-testid="scroll-rep-accounts">
              <Table data-testid="table-rep-accounts">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[44%]">Account</TableHead>
                    <TableHead className="w-[18%]">ARR</TableHead>
                    <TableHead className="w-[18%]">Employees</TableHead>
                    <TableHead className="w-[12%]">Risk</TableHead>
                    <TableHead className="w-[8%]">State</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {repAccounts.map((a) => {
                    const r = riskLabel(a.Risk_Score ?? 0);
                    const isInState = rep ? a.Location === rep.location : false;
                    const risk = a.Risk_Score ?? 0;
                    const riskFill = clamp01(risk / 100);

                    return (
                      <TableRow
                        key={a.Account_ID}
                        className="cursor-default"
                        data-testid={`row-account-${a.Account_ID}`}
                      >
                        <TableCell className="py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium text-foreground" data-testid={`text-account-name-${a.Account_ID}`}>
                                {a.Account_Name}
                              </div>
                              <div className="mt-0.5 text-[11px] text-muted-foreground" data-testid={`text-account-id-${a.Account_ID}`}>
                                ID: {a.Account_ID}
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                "bg-background/40",
                                isInState
                                  ? rep?.segment === "Enterprise"
                                    ? "border-chart-2/30 text-chart-2"
                                    : "border-chart-1/30 text-chart-1"
                                  : ""
                              )}
                              data-testid={`badge-in-state-${a.Account_ID}`}
                            >
                              {isInState ? "In-state" : ""}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono" data-testid={`text-account-arr-${a.Account_ID}`}>
                          {formatCurrency(a.ARR ?? 0)}
                        </TableCell>
                        <TableCell className="font-mono" data-testid={`text-account-employees-${a.Account_ID}`}>
                          {(a.Num_Employees ?? 0).toLocaleString()}
                        </TableCell>
                        <TableCell data-testid={`cell-account-risk-${a.Account_ID}`}>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={r.tone}
                              className={cn(
                                r.tone === "destructive" ? "bg-destructive/15 text-destructive" : "bg-background/40"
                              )}
                              data-testid={`badge-risk-${a.Account_ID}`}
                            >
                              <span className="inline-flex items-center gap-1">
                                <ShieldAlert className="h-3.5 w-3.5" />
                                {r.label}
                              </span>
                            </Badge>
                            <div className="hidden w-24 sm:block" aria-hidden="true">
                              <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
                                <div
                                  className={cn(
                                    "h-full rounded-full",
                                    risk >= 80 ? "bg-destructive" : risk >= 60 ? "bg-chart-5" : "bg-chart-4"
                                  )}
                                  style={{ width: `${Math.round(riskFill * 100)}%` }}
                                />
                              </div>
                            </div>
                            <span className="text-xs font-mono text-muted-foreground" data-testid={`text-risk-score-${a.Account_ID}`}>
                              {Math.round(risk)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground" data-testid={`text-account-location-${a.Account_ID}`}>
                          {a.Location}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
