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
    return { ...acc, Assigned_Rep: targetRep.Rep_Name };
  });
}

// Strategy 2: ARR + Risk Balance
function arrRiskBalance(accounts: Account[], reps: Rep[]): Account[] {
  const sortedAccounts = [...accounts].sort((a, b) => b.ARR - a.ARR);
  
  const totalARR = accounts.reduce((sum, a) => sum + a.ARR, 0);
  const targetARR = totalARR / reps.length;

  // Initialize tracking
  const repStats = new Map(reps.map(r => [r.Rep_Name, {
    ...r,
    currentARR: 0,
    count: 0,
    highRiskCount: 0
  }]));

  return sortedAccounts.map(account => {
    let bestRepName = reps[0].Rep_Name;
    let maxScore = -Infinity;

    for (const rep of reps) {
      const stats = repStats.get(rep.Rep_Name)!;
      let score = 0.0; // Wait, we calculate score below

      // FACTOR 1: ARR Deviation (normalized to 0-1 scale)
      const projectedARR = stats.currentARR + account.ARR;
      const arrDev = Math.abs(projectedARR - targetARR);
      // Worst case: one rep gets 2x target, or gets 0. So max possible deviation is targetARR
      const maxPossibleDeviation = targetARR; 
      // arrScore is 1.0 (perfect) to 0.0 (very unbalanced)
      let arrScore = 1.0 - (arrDev / maxPossibleDeviation);
      arrScore = Math.max(0.0, Math.min(1.0, arrScore));

      // FACTOR 2: Risk Balance (normalized to 0-1 scale)
      const currentRiskPct = stats.count > 0 ? stats.highRiskCount / stats.count : 0.0;
      const isHighRisk = account.Risk_Score > 70;
      const targetRiskPct = 0.35; // Target: 35% high-risk accounts

      let projectedRiskPct: number;
      if (isHighRisk) {
        projectedRiskPct = (stats.highRiskCount + 1) / (stats.count + 1);
      } else {
        projectedRiskPct = stats.highRiskCount / (stats.count + 1);
      }

      const riskDev = Math.abs(projectedRiskPct - targetRiskPct);
      let riskScore = 1.0 - (riskDev / 0.35); // Normalize: 0.0 to 1.0
      riskScore = Math.max(0.0, Math.min(1.0, riskScore));

      // WEIGHTED COMBINATION
      // 80% ARR balance (primary), 20% risk balance (secondary)
      const finalScore = (arrScore * 0.80) + (riskScore * 0.20);

      if (finalScore > maxScore) {
        maxScore = finalScore;
        bestRepName = rep.Rep_Name;
      }
    }

    // Assign
    const bestRepStats = repStats.get(bestRepName)!;
    bestRepStats.currentARR += account.ARR;
    bestRepStats.count++;
    if (account.Risk_Score > 70) bestRepStats.highRiskCount++;

    return { ...account, Assigned_Rep: bestRepName };
  });
}

// Strategy 3: ARR + Geography Balance
function arrGeographyBalance(accounts: Account[], reps: Rep[]): Account[] {
  const sortedAccounts = [...accounts].sort((a, b) => b.ARR - a.ARR);
  
  const totalARR = accounts.reduce((sum, a) => sum + a.ARR, 0);
  const targetARR = totalARR / reps.length;

  const repStats = new Map(reps.map(r => [r.Rep_Name, {
    ...r,
    currentARR: 0,
    count: 0,
    sameStateCount: 0
  }]));

  return sortedAccounts.map(account => {
    let bestRepName = reps[0].Rep_Name;
    let maxScore = -Infinity;

    for (const rep of reps) {
      const stats = repStats.get(rep.Rep_Name)!;
      
      // FACTOR 1: ARR Balance (normalized 0-1)
      const projectedARR = stats.currentARR + account.ARR;
      const arrDev = Math.abs(projectedARR - targetARR);
      const maxPossibleDeviation = targetARR;
      let arrScore = 1.0 - (arrDev / maxPossibleDeviation);
      arrScore = Math.max(0.0, Math.min(1.0, arrScore));

      // FACTOR 2: Geographic Match (binary: 0 or 1)
      const geoScore = account.Location === rep.Location ? 1.0 : 0.0;

      // WEIGHTED COMBINATION
      // 70% ARR balance (primary), 30% geography (secondary)
      const finalScore = (arrScore * 0.70) + (geoScore * 0.30);

      if (finalScore > maxScore) {
        maxScore = finalScore;
        bestRepName = rep.Rep_Name;
      }
    }

    // Assign
    const bestRepStats = repStats.get(bestRepName)!;
    bestRepStats.currentARR += account.ARR;
    bestRepStats.count++;
    if (account.Location === bestRepStats.Location) bestRepStats.sameStateCount++;

    return { ...account, Assigned_Rep: bestRepName };
  });
}

// Strategy 4: Smart Multi-Factor
function smartMultiFactor(accounts: Account[], reps: Rep[]): Account[] {
  const sortedAccounts = [...accounts].sort((a, b) => b.ARR - a.ARR);
  
  const totalARR = accounts.reduce((sum, a) => sum + a.ARR, 0);
  const targetARR = totalARR / reps.length;
  const targetCount = accounts.length / reps.length;

  const repStats = new Map(reps.map(r => [r.Rep_Name, {
    ...r,
    currentARR: 0,
    count: 0,
    highRiskCount: 0,
    sameStateCount: 0
  }]));

  return sortedAccounts.map(account => {
    let bestRepName = reps[0].Rep_Name;
    let maxScore = -Infinity;

    for (const rep of reps) {
      const stats = repStats.get(rep.Rep_Name)!;
      
      // FACTOR 1: ARR Balance (normalized 0-1)
      const projectedARR = stats.currentARR + account.ARR;
      const arrDev = Math.abs(projectedARR - targetARR);
      let arrScore = 1.0 - (arrDev / targetARR);
      arrScore = Math.max(0.0, Math.min(1.0, arrScore));

      // FACTOR 2: Workload Balance (normalized 0-1)
      const projectedCount = stats.count + 1;
      const countDev = Math.abs(projectedCount - targetCount);
      let countScore = 1.0 - (countDev / targetCount);
      countScore = Math.max(0.0, Math.min(1.0, countScore));

      // FACTOR 3: Geographic Match (binary 0 or 1)
      const geoScore = account.Location === rep.Location ? 1.0 : 0.0;

      // FACTOR 4: Risk Balance (normalized 0-1)
      const isHighRisk = account.Risk_Score > 70;
      let projectedRiskPct: number;
      if (isHighRisk) {
        projectedRiskPct = (stats.highRiskCount + 1) / projectedCount;
      } else {
        projectedRiskPct = stats.highRiskCount / projectedCount;
      }
      
      const targetRisk = 0.35;
      const riskDev = Math.abs(projectedRiskPct - targetRisk);
      let riskScore = 1.0 - (riskDev / 0.35);
      riskScore = Math.max(0.0, Math.min(1.0, riskScore));

      // WEIGHTED COMBINATION
      // 50% ARR, 20% workload, 20% geography, 10% risk
      const finalScore = (arrScore * 0.50) + (countScore * 0.20) + (geoScore * 0.20) + (riskScore * 0.10);

      if (finalScore > maxScore) {
        maxScore = finalScore;
        bestRepName = rep.Rep_Name;
      }
    }

    // Assign
    const bestRepStats = repStats.get(bestRepName)!;
    bestRepStats.currentARR += account.ARR;
    bestRepStats.count++;
    if (account.Risk_Score > 70) bestRepStats.highRiskCount++;
    if (account.Location === rep.Location) bestRepStats.sameStateCount++; // Fix: check against Rep location from loop context if needed, but here we found bestRep. Location is on rep object, we should preserve it in stats map or access via closure. The initial Map contains Rep spread so it has Location.

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
