import { useState, useEffect, useContext, createContext, type ReactNode } from "react";
import type { DatasetError, DatasetSource } from "@/lib/data-loader";
import { loadDefaultDataset } from "@/lib/data-loader";

export interface Rep {
  Rep_Name: string;
  Location: string;
  Segment: "Enterprise" | "Mid Market";
}

export interface Account {
  Account_ID: string;
  Account_Name: string;
  Current_Rep: string;
  ARR: number;
  Location: string;
  Num_Employees: number;
  Num_Marketers: number;
  Risk_Score: number;
  // Computed fields
  Assigned_Rep?: string;
  Segment?: "Enterprise" | "Mid Market";
}

export interface RepStats {
  name: string;
  count: number;
  totalARR: number;
  location: string;
  segment: string;
  // Additional metrics
  highRiskCount: number;
  sameStateCount: number;
}

// ---------------------------------------------------------------------------
// Shared data context — ensures uploaded datasets are visible across all pages
// ---------------------------------------------------------------------------

interface DataContextValue {
  reps: Rep[];
  accounts: Account[];
  loading: boolean;
  source: DatasetSource;
  error: DatasetError | null;
  setDataset: (next: { reps: Rep[]; accounts: Account[]; source: DatasetSource }) => void;
  resetToDefault: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [reps, setReps] = useState<Rep[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<DatasetSource>("default");
  const [error, setError] = useState<DatasetError | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        const data = await loadDefaultDataset();
        if (cancelled) return;

        setReps(data.reps);
        setAccounts(data.accounts);
        setSource(data.source);
      } catch (e) {
        if (cancelled) return;
        console.error("Failed to load data", e);
        setError({
          title: "Failed to load dataset",
          message: "Please refresh the page and try again.",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  const setDataset = (next: { reps: Rep[]; accounts: Account[]; source: DatasetSource }) => {
    setReps(next.reps);
    setAccounts(next.accounts);
    setSource(next.source);
    setError(null);
    setLoading(false);
  };

  const resetToDefault = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadDefaultDataset();
      setReps(data.reps);
      setAccounts(data.accounts);
      setSource(data.source);
    } catch (e) {
      console.error("Failed to load default dataset", e);
      setError({
        title: "Failed to reset dataset",
        message: "Please refresh the page and try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DataContext.Provider value={{ reps, accounts, loading, source, error, setDataset, resetToDefault }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) {
    throw new Error("useData must be used within a <DataProvider>");
  }
  return ctx;
}

// ALGORITHMS

export function segmentAccounts(accounts: Account[], threshold: number): Account[] {
  return accounts.map(acc => ({
    ...acc,
    Segment: acc.Num_Employees >= threshold ? "Enterprise" : "Mid Market"
  }));
}

export type DistributionStrategy =
  | "Pure ARR Balance"
  | "ARR + Risk Balance"
  | "ARR + Geographic Clustering"
  | "Smart Multi-Factor";

// ---------------------------------------------------------------------------
// Strategy Configuration — tunable weights & settings
// ---------------------------------------------------------------------------

export interface StrategyConfig {
  highRiskThreshold: number;       // Risk_Score above this = "high risk" (default 70)
  riskPenaltyPct: number;          // ARR+Risk: penalty % for overloaded risk (default 8)
  riskBonusPct: number;            // ARR+Risk: bonus % for under-loaded risk (default 4)
  geoBonusPct: number;             // ARR+Geo: same-state bonus % (default 15)
  workloadPenaltyPct: number;      // Multi-Factor: overloaded workload penalty % (default 6)
  multiGeoBonusPct: number;        // Multi-Factor: same-state bonus % (default 10)
  multiRiskPenaltyPct: number;     // Multi-Factor: risk penalty % (default 5)
  multiRiskBonusPct: number;       // Multi-Factor: risk bonus % (default 3)
  enableSwapRefinement: boolean;   // Run swap refinement after greedy pass (default true)
  maxSwapIterations: number;       // Max passes for swap refinement (default 10)
}

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  highRiskThreshold: 70,
  riskPenaltyPct: 8,
  riskBonusPct: 4,
  geoBonusPct: 15,
  workloadPenaltyPct: 6,
  multiGeoBonusPct: 10,
  multiRiskPenaltyPct: 5,
  multiRiskBonusPct: 3,
  enableSwapRefinement: true,
  maxSwapIterations: 10,
};

// ---------------------------------------------------------------------------
// MinHeap — used by greedyBinPacking for O(n log k) assignment
// ---------------------------------------------------------------------------

class MinHeap<T> {
  private heap: { key: number; value: T }[] = [];

  get size() { return this.heap.length; }

  push(key: number, value: T) {
    this.heap.push({ key, value });
    this.siftUp(this.heap.length - 1);
  }

  pop(): { key: number; value: T } | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private siftUp(i: number) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[parent].key <= this.heap[i].key) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  private siftDown(i: number) {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.heap[left].key < this.heap[smallest].key) smallest = left;
      if (right < n && this.heap[right].key < this.heap[smallest].key) smallest = right;
      if (smallest === i) break;
      [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
      i = smallest;
    }
  }
}

// ---------------------------------------------------------------------------
// Strategy 1: Pure ARR Balance (Greedy Bin Packing with MinHeap)
//
// Sorts accounts by ARR descending (largest first), then assigns each account
// to the rep who currently has the lowest total ARR using a min-heap.
//
// Time complexity: O(n log n) for sorting + O(n log k) for assignment
// where n = accounts, k = reps.
// ---------------------------------------------------------------------------

function greedyBinPacking(accounts: Account[], reps: Rep[], _config: StrategyConfig): Account[] {
  if (reps.length === 0) return accounts.map(a => ({ ...a, Assigned_Rep: undefined }));

  const sortedAccounts = [...accounts].sort((a, b) => b.ARR - a.ARR);

  // Build min-heap keyed by current ARR
  const heap = new MinHeap<{ repName: string; currentARR: number }>();
  for (const r of reps) {
    heap.push(0, { repName: r.Rep_Name, currentARR: 0 });
  }

  return sortedAccounts.map(acc => {
    const min = heap.pop()!;
    min.value.currentARR += acc.ARR;
    heap.push(min.value.currentARR, min.value);
    return { ...acc, Assigned_Rep: min.value.repName, Segment: acc.Segment };
  });
}

// ---------------------------------------------------------------------------
// Strategy 2: ARR + Risk Balance
//
// Extends greedy bin packing with a risk-awareness penalty/bonus system.
// Uses configurable high-risk threshold and penalty/bonus percentages.
// ---------------------------------------------------------------------------

function arrRiskBalance(accounts: Account[], reps: Rep[], config: StrategyConfig): Account[] {
  if (reps.length === 0) return accounts.map(a => ({ ...a, Assigned_Rep: undefined }));

  const sortedAccounts = [...accounts].sort((a, b) => b.ARR - a.ARR);

  const totalARR = accounts.reduce((s, a) => s + a.ARR, 0);
  const avgARRPerRep = totalARR / reps.length;
  const riskPenalty = avgARRPerRep * (config.riskPenaltyPct / 100);
  const riskBonus = avgARRPerRep * (config.riskBonusPct / 100);

  const repStats = new Map(reps.map(r => [r.Rep_Name, {
    ...r, totalARR: 0, count: 0, highRiskCount: 0
  }]));

  return sortedAccounts.map(account => {
    let bestRepName = reps[0].Rep_Name;
    let minCost = Infinity;

    for (const rep of reps) {
      const stats = repStats.get(rep.Rep_Name)!;
      let cost = stats.totalARR;

      const isHighRisk = account.Risk_Score > config.highRiskThreshold;
      if (isHighRisk && stats.count > 0) {
        const currentRiskPct = stats.highRiskCount / stats.count;
        if (currentRiskPct > 0.40) {
          cost += riskPenalty;
        } else if (currentRiskPct < 0.20) {
          cost -= riskBonus;
        }
      }

      if (cost < minCost) {
        minCost = cost;
        bestRepName = rep.Rep_Name;
      }
    }

    const bestRepStats = repStats.get(bestRepName)!;
    bestRepStats.totalARR += account.ARR;
    bestRepStats.count++;
    if (account.Risk_Score > config.highRiskThreshold) bestRepStats.highRiskCount++;

    return { ...account, Assigned_Rep: bestRepName, Segment: account.Segment };
  });
}

// ---------------------------------------------------------------------------
// Strategy 3: ARR + Geographic Clustering
//
// Extends greedy bin packing with a configurable geographic affinity bonus.
// ---------------------------------------------------------------------------

function arrGeographyBalance(accounts: Account[], reps: Rep[], config: StrategyConfig): Account[] {
  if (reps.length === 0) return accounts.map(a => ({ ...a, Assigned_Rep: undefined }));

  const sortedAccounts = [...accounts].sort((a, b) => b.ARR - a.ARR);

  const totalARR = accounts.reduce((s, a) => s + a.ARR, 0);
  const avgARRPerRep = totalARR / reps.length;
  const geoBonus = avgARRPerRep * (config.geoBonusPct / 100);

  const repStats = new Map(reps.map(r => [r.Rep_Name, {
    ...r, totalARR: 0, count: 0, sameStateCount: 0
  }]));

  return sortedAccounts.map(account => {
    let bestRepName = reps[0].Rep_Name;
    let minCost = Infinity;

    for (const rep of reps) {
      const stats = repStats.get(rep.Rep_Name)!;
      let cost = stats.totalARR;

      if (account.Location === rep.Location) {
        cost -= geoBonus;
      }

      if (cost < minCost) {
        minCost = cost;
        bestRepName = rep.Rep_Name;
      }
    }

    const bestRepStats = repStats.get(bestRepName)!;
    bestRepStats.totalARR += account.ARR;
    bestRepStats.count++;
    if (account.Location === bestRepStats.Location) bestRepStats.sameStateCount++;

    return { ...account, Assigned_Rep: bestRepName, Segment: account.Segment };
  });
}

// ---------------------------------------------------------------------------
// Strategy 4: Smart Multi-Factor
//
// Combines ARR balance, workload, geography, and risk into one cost function.
// All weights are configurable via StrategyConfig.
// ---------------------------------------------------------------------------

function smartMultiFactor(accounts: Account[], reps: Rep[], config: StrategyConfig): Account[] {
  if (reps.length === 0) return accounts.map(a => ({ ...a, Assigned_Rep: undefined }));

  const sortedAccounts = [...accounts].sort((a, b) => b.ARR - a.ARR);

  const targetCount = accounts.length / reps.length;
  const totalARR = accounts.reduce((s, a) => s + a.ARR, 0);
  const avgARRPerRep = totalARR / reps.length;

  const workloadPenalty = avgARRPerRep * (config.workloadPenaltyPct / 100);
  const geoBonus = avgARRPerRep * (config.multiGeoBonusPct / 100);
  const riskPenalty = avgARRPerRep * (config.multiRiskPenaltyPct / 100);
  const riskBonus = avgARRPerRep * (config.multiRiskBonusPct / 100);

  const repStats = new Map(reps.map(r => [r.Rep_Name, {
    ...r, totalARR: 0, count: 0, highRiskCount: 0, sameStateCount: 0
  }]));

  return sortedAccounts.map(account => {
    let bestRepName = reps[0].Rep_Name;
    let minCost = Infinity;

    for (const rep of reps) {
      const stats = repStats.get(rep.Rep_Name)!;
      let cost = stats.totalARR;

      if (stats.count > targetCount * 1.1) {
        cost += workloadPenalty;
      }

      if (account.Location === rep.Location) {
        cost -= geoBonus;
      }

      const isHighRisk = account.Risk_Score > config.highRiskThreshold;
      if (isHighRisk && stats.count > 0) {
        const currentRiskPct = stats.highRiskCount / stats.count;
        if (currentRiskPct > 0.40) {
          cost += riskPenalty;
        } else if (currentRiskPct < 0.20) {
          cost -= riskBonus;
        }
      }

      if (cost < minCost) {
        minCost = cost;
        bestRepName = rep.Rep_Name;
      }
    }

    const bestRepStats = repStats.get(bestRepName)!;
    bestRepStats.totalARR += account.ARR;
    bestRepStats.count++;
    if (account.Risk_Score > config.highRiskThreshold) bestRepStats.highRiskCount++;
    if (account.Location === bestRepStats.Location) bestRepStats.sameStateCount++;

    return { ...account, Assigned_Rep: bestRepName, Segment: account.Segment };
  });
}

// ---------------------------------------------------------------------------
// Swap Refinement — post-greedy local search optimization
//
// After the greedy pass, tries pairwise swaps between reps. If swapping
// two accounts reduces the total objective cost, the swap is kept.
// Repeats until no improving swap is found or maxSwapIterations is reached.
// ---------------------------------------------------------------------------

function computeTotalCost(
  accounts: Account[],
  reps: Rep[],
  strategy: DistributionStrategy,
  config: StrategyConfig
): number {
  // Group accounts by assigned rep
  const repAccounts = new Map<string, Account[]>();
  for (const r of reps) repAccounts.set(r.Rep_Name, []);
  for (const a of accounts) {
    if (a.Assigned_Rep && repAccounts.has(a.Assigned_Rep)) {
      repAccounts.get(a.Assigned_Rep)!.push(a);
    }
  }

  const totalARR = accounts.reduce((s, a) => s + a.ARR, 0);
  const avgARRPerRep = reps.length > 0 ? totalARR / reps.length : 0;
  const targetCount = reps.length > 0 ? accounts.length / reps.length : 0;

  let cost = 0;

  for (const rep of reps) {
    const mine = repAccounts.get(rep.Rep_Name) ?? [];
    const repARR = mine.reduce((s, a) => s + a.ARR, 0);

    // Base: squared deviation from mean ARR (always — penalizes imbalance)
    cost += (repARR - avgARRPerRep) ** 2;

    // Risk component
    if (strategy === "ARR + Risk Balance" || strategy === "Smart Multi-Factor") {
      const highRiskCount = mine.filter(a => a.Risk_Score > config.highRiskThreshold).length;
      const avgRiskPct = mine.length > 0 ? highRiskCount / mine.length : 0;
      const penaltyPct = strategy === "ARR + Risk Balance"
        ? config.riskPenaltyPct : config.multiRiskPenaltyPct;
      cost += (avgRiskPct * avgARRPerRep * penaltyPct / 100) ** 2;
    }

    // Geography component (reward — subtract from cost)
    if (strategy === "ARR + Geographic Clustering" || strategy === "Smart Multi-Factor") {
      const sameStateCount = mine.filter(a => a.Location === rep.Location).length;
      const bonusPct = strategy === "ARR + Geographic Clustering"
        ? config.geoBonusPct : config.multiGeoBonusPct;
      cost -= sameStateCount * avgARRPerRep * (bonusPct / 100);
    }

    // Workload component
    if (strategy === "Smart Multi-Factor") {
      if (mine.length > targetCount * 1.1) {
        cost += (avgARRPerRep * config.workloadPenaltyPct / 100) ** 2;
      }
    }
  }

  return cost;
}

function swapRefine(
  accounts: Account[],
  reps: Rep[],
  strategy: DistributionStrategy,
  config: StrategyConfig
): Account[] {
  if (reps.length < 2 || accounts.length < 2) return accounts;

  // Work on a mutable copy
  const current = accounts.map(a => ({ ...a }));
  let bestCost = computeTotalCost(current, reps, strategy, config);

  for (let iter = 0; iter < config.maxSwapIterations; iter++) {
    let improved = false;

    // Group account indices by assigned rep
    const byRep = new Map<string, number[]>();
    for (const r of reps) byRep.set(r.Rep_Name, []);
    current.forEach((a, idx) => {
      if (a.Assigned_Rep && byRep.has(a.Assigned_Rep)) {
        byRep.get(a.Assigned_Rep)!.push(idx);
      }
    });

    const repNames = reps.map(r => r.Rep_Name);

    // Try pairwise swaps between every pair of reps
    outer:
    for (let ri = 0; ri < repNames.length; ri++) {
      for (let rj = ri + 1; rj < repNames.length; rj++) {
        const indicesA = byRep.get(repNames[ri]) ?? [];
        const indicesB = byRep.get(repNames[rj]) ?? [];

        for (const idxA of indicesA) {
          for (const idxB of indicesB) {
            // Swap
            current[idxA].Assigned_Rep = repNames[rj];
            current[idxB].Assigned_Rep = repNames[ri];

            const newCost = computeTotalCost(current, reps, strategy, config);
            if (newCost < bestCost - 0.01) { // small epsilon to avoid floating point noise
              bestCost = newCost;
              improved = true;
              break outer; // restart with a new pass
            } else {
              // Revert
              current[idxA].Assigned_Rep = repNames[ri];
              current[idxB].Assigned_Rep = repNames[rj];
            }
          }
        }
      }
    }

    if (!improved) break; // Converged — no improving swap found
  }

  return current;
}

// ---------------------------------------------------------------------------
// Main entry point — distributes accounts to reps using the selected strategy
// ---------------------------------------------------------------------------

export function distributeAccounts(
  accounts: Account[],
  reps: Rep[],
  strategy: DistributionStrategy = "Pure ARR Balance",
  config: StrategyConfig = DEFAULT_STRATEGY_CONFIG
): Account[] {
  // 1. Separate pools
  const entAccounts = accounts.filter(a => a.Segment === "Enterprise");
  const mmAccounts = accounts.filter(a => a.Segment === "Mid Market");

  const entReps = reps.filter(r => r.Segment === "Enterprise");
  const mmReps = reps.filter(r => r.Segment === "Mid Market");

  // 2. Guard: if a segment has no reps, skip assignment for those accounts
  const dispatch = (accts: Account[], segReps: Rep[]): Account[] => {
    if (accts.length === 0) return [];
    if (segReps.length === 0) {
      return accts.map(a => ({ ...a, Assigned_Rep: undefined }));
    }

    let result: Account[];
    switch (strategy) {
      case "ARR + Risk Balance":
        result = arrRiskBalance(accts, segReps, config);
        break;
      case "ARR + Geographic Clustering":
        result = arrGeographyBalance(accts, segReps, config);
        break;
      case "Smart Multi-Factor":
        result = smartMultiFactor(accts, segReps, config);
        break;
      case "Pure ARR Balance":
      default:
        result = greedyBinPacking(accts, segReps, config);
        break;
    }

    // Swap refinement: post-greedy local search (per segment, preserves isolation)
    if (config.enableSwapRefinement) {
      result = swapRefine(result, segReps, strategy, config);
    }

    return result;
  };

  return [...dispatch(entAccounts, entReps), ...dispatch(mmAccounts, mmReps)];
}

export function calculateRepStats(
  accounts: Account[],
  reps: Rep[],
  highRiskThreshold: number = 70
): RepStats[] {
  const statsMap = new Map<string, RepStats>();

  reps.forEach(rep => {
    statsMap.set(rep.Rep_Name, {
      name: rep.Rep_Name,
      location: rep.Location,
      segment: rep.Segment,
      count: 0,
      totalARR: 0,
      highRiskCount: 0,
      sameStateCount: 0
    });
  });

  accounts.forEach(acc => {
    if (acc.Assigned_Rep && statsMap.has(acc.Assigned_Rep)) {
      const stat = statsMap.get(acc.Assigned_Rep)!;
      stat.count++;
      stat.totalARR += acc.ARR;
      if (acc.Risk_Score > highRiskThreshold) stat.highRiskCount++;
      if (acc.Location === stat.location) stat.sameStateCount++;
    }
  });

  return Array.from(statsMap.values()).sort((a, b) => b.totalARR - a.totalARR);
}
