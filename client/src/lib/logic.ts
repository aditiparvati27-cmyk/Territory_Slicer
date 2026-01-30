import { useState, useEffect } from "react";
import Papa from "papaparse";

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

export function useData() {
  const [reps, setReps] = useState<Rep[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const repsRes = await fetch("/data/GTM-Engineer_Challenge_-_Reps_(1)_1769598230595.csv");
        const repsText = await repsRes.text();
        const accountsRes = await fetch("/data/GTM-Engineer_Challenge_-_Accounts_(1)_1769598619158.csv");
        const accountsText = await accountsRes.text();

        const parsedReps = Papa.parse(repsText, { header: true, skipEmptyLines: true }).data as Rep[];
        const parsedAccounts = Papa.parse(accountsText, { 
          header: true, 
          skipEmptyLines: true,
          dynamicTyping: true 
        }).data as Account[];

        setReps(parsedReps);
        setAccounts(parsedAccounts);
      } catch (error) {
        console.error("Failed to load data", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return { reps, accounts, loading };
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

// Base logic for Pure ARR (Greedy Bin Packing)
function greedyBinPacking(accounts: Account[], reps: Rep[]): Account[] {
  const sortedAccounts = [...accounts].sort((a, b) => b.ARR - a.ARR);
  const repHeaps = reps.map(r => ({ ...r, currentARR: 0 }));

  return sortedAccounts.map(acc => {
    repHeaps.sort((a, b) => a.currentARR - b.currentARR);
    const targetRep = repHeaps[0];
    targetRep.currentARR += acc.ARR;
    return { ...acc, Assigned_Rep: targetRep.Rep_Name, Segment: acc.Segment };
  });
}

// Strategy 2: ARR + Risk Balance
function arrRiskBalance(accounts: Account[], reps: Rep[]): Account[] {
  const sortedAccounts = [...accounts].sort((a, b) => b.ARR - a.ARR);
  
  // Initialize tracking for each rep
  const repStats = new Map(reps.map(r => [r.Rep_Name, {
    ...r,
    totalARR: 0,
    accounts: [] as Account[],
    count: 0,
    highRiskCount: 0
  }]));

  return sortedAccounts.map(account => {
    let bestRepName = reps[0].Rep_Name;
    let minCost = Infinity;

    for (const rep of reps) {
      const stats = repStats.get(rep.Rep_Name)!;
      
      // BASE COST = current total ARR this rep has
      let cost = stats.totalARR;

      // ADJUSTMENT for risk balance
      const currentCount = stats.count;
      
      const currentRiskPct = currentCount > 0 ? stats.highRiskCount / currentCount : 0.0;
      const isHighRisk = account.Risk_Score > 70;

      // Add penalty/bonus based on risk
      if (isHighRisk && currentRiskPct > 0.45) {
        cost += 100000; // Penalty (makes rep less attractive)
      } else if (isHighRisk && currentRiskPct < 0.25) {
        cost -= 50000; // Bonus (makes rep more attractive)
      }

      if (cost < minCost) {
        minCost = cost;
        bestRepName = rep.Rep_Name;
      }
    }

    // Assign
    const bestRepStats = repStats.get(bestRepName)!;
    bestRepStats.totalARR += account.ARR;
    bestRepStats.accounts.push(account);
    bestRepStats.count++;
    if (account.Risk_Score > 70) bestRepStats.highRiskCount++;

    return { ...account, Assigned_Rep: bestRepName, Segment: account.Segment };
  });
}

// Strategy 3: ARR + Geography Balance
function arrGeographyBalance(accounts: Account[], reps: Rep[]): Account[] {
  const sortedAccounts = [...accounts].sort((a, b) => b.ARR - a.ARR);
  
  const repStats = new Map(reps.map(r => [r.Rep_Name, {
    ...r,
    totalARR: 0,
    accounts: [] as Account[],
    count: 0,
    sameStateCount: 0
  }]));

  return sortedAccounts.map(account => {
    let bestRepName = reps[0].Rep_Name;
    let minCost = Infinity;

    for (const rep of reps) {
      const stats = repStats.get(rep.Rep_Name)!;
      
      // BASE COST = current total ARR this rep has
      let cost = stats.totalARR;

      // ADJUSTMENT for geography
      // If account is in same state as rep, reduce cost (make more attractive)
      if (account.Location === rep.Location) {
        cost -= 150000; // Subtract 150K (this is a bonus)
      }

      if (cost < minCost) {
        minCost = cost;
        bestRepName = rep.Rep_Name;
      }
    }

    // Assign
    const bestRepStats = repStats.get(bestRepName)!;
    bestRepStats.totalARR += account.ARR;
    bestRepStats.accounts.push(account);
    bestRepStats.count++;
    if (account.Location === bestRepStats.Location) bestRepStats.sameStateCount++;

    return { ...account, Assigned_Rep: bestRepName, Segment: account.Segment };
  });
}

// Strategy 4: Smart Multi-Factor
function smartMultiFactor(accounts: Account[], reps: Rep[]): Account[] {
  const sortedAccounts = [...accounts].sort((a, b) => b.ARR - a.ARR);
  
  // Calculate target account count per rep
  const targetCount = accounts.length / reps.length;

  const repStats = new Map(reps.map(r => [r.Rep_Name, {
    ...r,
    totalARR: 0,
    accounts: [] as Account[],
    count: 0,
    highRiskCount: 0,
    sameStateCount: 0
  }]));

  return sortedAccounts.map(account => {
    let bestRepName = reps[0].Rep_Name;
    let minCost = Infinity;

    for (const rep of reps) {
      const stats = repStats.get(rep.Rep_Name)!;
      
      // BASE COST = current total ARR this rep has
      let cost = stats.totalARR;

      // ADJUSTMENT 1: Workload balance (account count)
      if (stats.count > targetCount * 1.1) {
        cost += 80000; // Penalty if rep has too many accounts
      }

      // ADJUSTMENT 2: Geography
      if (account.Location === rep.Location) {
        cost -= 120000; // Bonus for same state
      }

      // ADJUSTMENT 3: Risk balance
      const currentCount = stats.count;
      if (currentCount > 0) {
        const currentRiskPct = stats.highRiskCount / currentCount;
        const isHighRisk = account.Risk_Score > 70;

        if (isHighRisk && currentRiskPct > 0.45) {
          cost += 60000; // Penalty if too many high-risk already
        } else if (isHighRisk && currentRiskPct < 0.25) {
          cost -= 40000; // Bonus if too few high-risk
        }
      }

      if (cost < minCost) {
        minCost = cost;
        bestRepName = rep.Rep_Name;
      }
    }

    // Assign
    const bestRepStats = repStats.get(bestRepName)!;
    bestRepStats.totalARR += account.ARR;
    bestRepStats.accounts.push(account);
    bestRepStats.count++;
    if (account.Risk_Score > 70) bestRepStats.highRiskCount++;
    if (account.Location === bestRepStats.Location) bestRepStats.sameStateCount++;

    return { ...account, Assigned_Rep: bestRepName };
  });
}


export function distributeAccounts(
  accounts: Account[], 
  reps: Rep[], 
  strategy: DistributionStrategy = "Pure ARR Balance"
): Account[] {
  // 1. Separate pools
  const entAccounts = accounts.filter(a => a.Segment === "Enterprise");
  const mmAccounts = accounts.filter(a => a.Segment === "Mid Market");

  const entReps = reps.filter(r => r.Segment === "Enterprise");
  const mmReps = reps.filter(r => r.Segment === "Mid Market");

  let assignedEnt: Account[];
  let assignedMm: Account[];

  // 2. Route to strategy
  switch (strategy) {
    case "ARR + Risk Balance":
      assignedEnt = arrRiskBalance(entAccounts, entReps);
      assignedMm = arrRiskBalance(mmAccounts, mmReps);
      break;
    case "ARR + Geographic Clustering":
      assignedEnt = arrGeographyBalance(entAccounts, entReps);
      assignedMm = arrGeographyBalance(mmAccounts, mmReps);
      break;
    case "Smart Multi-Factor":
      assignedEnt = smartMultiFactor(entAccounts, entReps);
      assignedMm = smartMultiFactor(mmAccounts, mmReps);
      break;
    case "Pure ARR Balance":
    default:
      assignedEnt = greedyBinPacking(entAccounts, entReps);
      assignedMm = greedyBinPacking(mmAccounts, mmReps);
      break;
  }

  return [...assignedEnt, ...assignedMm];
}

export function calculateRepStats(accounts: Account[], reps: Rep[]): RepStats[] {
  const statsMap = new Map<string, RepStats>();
  
  // Initialize
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

  // Aggregate
  accounts.forEach(acc => {
    if (acc.Assigned_Rep && statsMap.has(acc.Assigned_Rep)) {
      const stat = statsMap.get(acc.Assigned_Rep)!;
      stat.count++;
      stat.totalARR += acc.ARR;
      if (acc.Risk_Score > 70) stat.highRiskCount++;
      if (acc.Location === stat.location) stat.sameStateCount++;
    }
  });

  return Array.from(statsMap.values()).sort((a, b) => b.totalARR - a.totalARR);
}
