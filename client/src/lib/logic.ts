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

export function distributeAccounts(accounts: Account[], reps: Rep[]): Account[] {
  // 1. Separate pools
  const entAccounts = accounts.filter(a => a.Segment === "Enterprise");
  const mmAccounts = accounts.filter(a => a.Segment === "Mid Market");

  const entReps = reps.filter(r => r.Segment === "Enterprise");
  const mmReps = reps.filter(r => r.Segment === "Mid Market");

  // 2. Greedy Bin Packing for Enterprise
  // Sort accounts by ARR descending (Greedy approach)
  const sortedEntAccounts = [...entAccounts].sort((a, b) => b.ARR - a.ARR);
  
  // Initialize heaps for reps (tracking total ARR)
  const entRepHeaps = entReps.map(r => ({ ...r, currentARR: 0, accountCount: 0 }));

  const assignedEntAccounts = sortedEntAccounts.map(acc => {
    // Find rep with lowest current ARR
    entRepHeaps.sort((a, b) => a.currentARR - b.currentARR);
    const targetRep = entRepHeaps[0];
    
    // Assign
    targetRep.currentARR += acc.ARR;
    targetRep.accountCount++;
    
    return { ...acc, Assigned_Rep: targetRep.Rep_Name };
  });

  // 3. Greedy Bin Packing for Mid-Market
  const sortedMmAccounts = [...mmAccounts].sort((a, b) => b.ARR - a.ARR);
  const mmRepHeaps = mmReps.map(r => ({ ...r, currentARR: 0, accountCount: 0 }));

  const assignedMmAccounts = sortedMmAccounts.map(acc => {
     // Find rep with lowest current ARR
     mmRepHeaps.sort((a, b) => a.currentARR - b.currentARR);
     const targetRep = mmRepHeaps[0];
     
     // Assign
     targetRep.currentARR += acc.ARR;
     targetRep.accountCount++;
     
     return { ...acc, Assigned_Rep: targetRep.Rep_Name };
  });

  return [...assignedEntAccounts, ...assignedMmAccounts];
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
      totalARR: 0
    });
  });

  // Aggregate
  accounts.forEach(acc => {
    if (acc.Assigned_Rep && statsMap.has(acc.Assigned_Rep)) {
      const stat = statsMap.get(acc.Assigned_Rep)!;
      stat.count++;
      stat.totalARR += acc.ARR;
    }
  });

  return Array.from(statsMap.values()).sort((a, b) => b.totalARR - a.totalARR);
}
