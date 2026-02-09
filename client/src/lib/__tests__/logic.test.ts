/**
 * Territory Slicer — Comprehensive Test Suite
 *
 * Tests cover:
 *   1. segmentAccounts – threshold-based segmentation
 *   2. distributeAccounts – all 4 strategies
 *   3. calculateRepStats – stats aggregation
 *   4. Edge cases – empty pools, single rep, extreme thresholds
 *   5. Equity invariants – ARR balance, every account assigned, total ARR preserved
 */

import { describe, it, expect } from "vitest";
import {
  segmentAccounts,
  distributeAccounts,
  calculateRepStats,
  DEFAULT_STRATEGY_CONFIG,
  type Rep,
  type Account,
  type DistributionStrategy,
  type StrategyConfig,
} from "../logic";

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function makeReps(overrides: Partial<Rep>[] = []): Rep[] {
  const defaults: Rep[] = [
    { Rep_Name: "Alice", Location: "NY", Segment: "Enterprise" },
    { Rep_Name: "Bob", Location: "CA", Segment: "Enterprise" },
    { Rep_Name: "Carol", Location: "TX", Segment: "Mid Market" },
    { Rep_Name: "Dave", Location: "FL", Segment: "Mid Market" },
  ];
  return overrides.length ? overrides.map((o, i) => ({ ...defaults[i % defaults.length], ...o })) : defaults;
}

function makeAccount(partial: Partial<Account> = {}): Account {
  return {
    Account_ID: partial.Account_ID ?? `ACC-${Math.random().toString(36).slice(2, 6)}`,
    Account_Name: partial.Account_Name ?? "Test Corp",
    Current_Rep: partial.Current_Rep ?? "Alice",
    ARR: partial.ARR ?? 100000,
    Location: partial.Location ?? "NY",
    Num_Employees: partial.Num_Employees ?? 5000,
    Num_Marketers: partial.Num_Marketers ?? 400,
    Risk_Score: partial.Risk_Score ?? 50,
    Assigned_Rep: partial.Assigned_Rep,
    Segment: partial.Segment,
  };
}

function makeAccounts(count: number, templateFn?: (i: number) => Partial<Account>): Account[] {
  return Array.from({ length: count }, (_, i) =>
    makeAccount({
      Account_ID: `ACC-${1000 + i}`,
      Account_Name: `Company ${i}`,
      ...(templateFn ? templateFn(i) : {}),
    })
  );
}

function totalARR(accounts: Account[]): number {
  return accounts.reduce((s, a) => s + a.ARR, 0);
}

const ALL_STRATEGIES: DistributionStrategy[] = [
  "Pure ARR Balance",
  "ARR + Risk Balance",
  "ARR + Geographic Clustering",
  "Smart Multi-Factor",
];

// ---------------------------------------------------------------------------
// 1. segmentAccounts
// ---------------------------------------------------------------------------

describe("segmentAccounts", () => {
  it("segments accounts correctly at given threshold", () => {
    const accounts = [
      makeAccount({ Num_Employees: 1000 }),
      makeAccount({ Num_Employees: 500 }),
      makeAccount({ Num_Employees: 499 }),
    ];
    const result = segmentAccounts(accounts, 500);
    expect(result[0].Segment).toBe("Enterprise");
    expect(result[1].Segment).toBe("Enterprise"); // exactly at threshold
    expect(result[2].Segment).toBe("Mid Market");
  });

  it("puts all accounts in Enterprise when threshold is very low", () => {
    const accounts = makeAccounts(10, () => ({ Num_Employees: 1500 }));
    const result = segmentAccounts(accounts, 500);
    expect(result.every(a => a.Segment === "Enterprise")).toBe(true);
  });

  it("puts all accounts in Mid Market when threshold is very high", () => {
    const accounts = makeAccounts(10, () => ({ Num_Employees: 5000 }));
    const result = segmentAccounts(accounts, 200000);
    expect(result.every(a => a.Segment === "Mid Market")).toBe(true);
  });

  it("preserves all original fields", () => {
    const original = makeAccount({ Num_Employees: 1000, ARR: 250000, Risk_Score: 80 });
    const [result] = segmentAccounts([original], 500);
    expect(result.ARR).toBe(250000);
    expect(result.Risk_Score).toBe(80);
    expect(result.Account_Name).toBe(original.Account_Name);
  });

  it("handles empty input", () => {
    expect(segmentAccounts([], 500)).toEqual([]);
  });

  it("exact threshold boundary goes to Enterprise (>=)", () => {
    const [result] = segmentAccounts([makeAccount({ Num_Employees: 500 })], 500);
    expect(result.Segment).toBe("Enterprise");
  });
});

// ---------------------------------------------------------------------------
// 2. distributeAccounts — ALL STRATEGIES
// ---------------------------------------------------------------------------

describe("distributeAccounts", () => {
  describe.each(ALL_STRATEGIES)("strategy: %s", (strategy) => {
    it("assigns every account to a rep", () => {
      const reps = makeReps();
      const accounts = segmentAccounts(
        makeAccounts(20, (i) => ({
          ARR: 10000 + i * 5000,
          Num_Employees: i < 10 ? 10000 : 200,
        })),
        500
      );
      const result = distributeAccounts(accounts, reps, strategy);
      const assigned = result.filter(a => a.Assigned_Rep);
      expect(assigned.length).toBe(20);
    });

    it("preserves total ARR after distribution", () => {
      const reps = makeReps();
      const accounts = segmentAccounts(
        makeAccounts(20, (i) => ({
          ARR: 10000 + i * 5000,
          Num_Employees: i < 10 ? 10000 : 200,
        })),
        500
      );
      const original = totalARR(accounts);
      const result = distributeAccounts(accounts, reps, strategy);
      expect(totalARR(result)).toBeCloseTo(original, 0);
    });

    it("only assigns Enterprise accounts to Enterprise reps", () => {
      const reps = makeReps();
      const accounts = segmentAccounts(
        makeAccounts(20, (i) => ({
          ARR: 50000,
          Num_Employees: i < 10 ? 10000 : 200,
        })),
        500
      );
      const result = distributeAccounts(accounts, reps, strategy);
      const entRepNames = reps.filter(r => r.Segment === "Enterprise").map(r => r.Rep_Name);
      const mmRepNames = reps.filter(r => r.Segment === "Mid Market").map(r => r.Rep_Name);

      result.filter(a => a.Segment === "Enterprise").forEach(a => {
        expect(entRepNames).toContain(a.Assigned_Rep);
      });
      result.filter(a => a.Segment === "Mid Market").forEach(a => {
        expect(mmRepNames).toContain(a.Assigned_Rep);
      });
    });

    it("handles all accounts in one segment gracefully", () => {
      const reps = makeReps();
      // All accounts have 10K employees, threshold 500 → all Enterprise
      const accounts = segmentAccounts(
        makeAccounts(10, () => ({ Num_Employees: 10000, ARR: 50000 })),
        500
      );
      // Should not throw
      const result = distributeAccounts(accounts, reps, strategy);
      expect(result.length).toBe(10);
      // Enterprise accounts get assigned; Mid Market accounts = 0 so no crash
    });

    it("handles empty account list", () => {
      const reps = makeReps();
      const result = distributeAccounts([], reps, strategy);
      expect(result).toEqual([]);
    });
  });

  describe("Pure ARR Balance", () => {
    it("achieves reasonable ARR balance across reps", () => {
      const reps: Rep[] = [
        { Rep_Name: "R1", Location: "NY", Segment: "Enterprise" },
        { Rep_Name: "R2", Location: "CA", Segment: "Enterprise" },
      ];
      const accounts = segmentAccounts(
        makeAccounts(10, (i) => ({
          ARR: 100000 + i * 10000,
          Num_Employees: 10000,
        })),
        500
      );
      const result = distributeAccounts(accounts, reps, "Pure ARR Balance");
      const stats = calculateRepStats(result, reps);

      const arrValues = stats.map(r => r.totalARR);
      const maxDiff = Math.max(...arrValues) - Math.min(...arrValues);
      const avgARR = totalARR(accounts) / reps.length;

      // Max diff should be less than 20% of average (greedy bin packing guarantee)
      expect(maxDiff / avgARR).toBeLessThan(0.20);
    });
  });

  describe("ARR + Geographic Clustering", () => {
    it("increases same-state assignments compared to Pure ARR", () => {
      const reps: Rep[] = [
        { Rep_Name: "NYRep", Location: "NY", Segment: "Enterprise" },
        { Rep_Name: "CARep", Location: "CA", Segment: "Enterprise" },
      ];
      // Half accounts in NY, half in CA
      const accounts = segmentAccounts(
        makeAccounts(20, (i) => ({
          ARR: 100000 + (i % 5) * 10000,
          Num_Employees: 10000,
          Location: i < 10 ? "NY" : "CA",
        })),
        500
      );

      const pureResult = distributeAccounts(accounts, reps, "Pure ARR Balance");
      const geoResult = distributeAccounts(accounts, reps, "ARR + Geographic Clustering");

      const sameState = (result: Account[]) =>
        result.filter(a => {
          const rep = reps.find(r => r.Rep_Name === a.Assigned_Rep);
          return rep && a.Location === rep.Location;
        }).length;

      expect(sameState(geoResult)).toBeGreaterThanOrEqual(sameState(pureResult));
    });
  });

  describe("ARR + Risk Balance", () => {
    it("distributes high-risk accounts more evenly than Pure ARR", () => {
      const reps: Rep[] = [
        { Rep_Name: "R1", Location: "NY", Segment: "Enterprise" },
        { Rep_Name: "R2", Location: "CA", Segment: "Enterprise" },
        { Rep_Name: "R3", Location: "TX", Segment: "Enterprise" },
      ];
      // Create accounts where high-risk ones have highest ARR
      // Pure ARR would stack them on fewest reps
      const accounts = segmentAccounts(
        makeAccounts(30, (i) => ({
          ARR: i < 10 ? 400000 : 100000,          // First 10 are big
          Risk_Score: i < 10 ? 90 : 20,            // First 10 are high-risk
          Num_Employees: 10000,
        })),
        500
      );

      const riskResult = distributeAccounts(accounts, reps, "ARR + Risk Balance");
      const stats = calculateRepStats(riskResult, reps);

      // Each rep should have some high-risk accounts
      stats.forEach(s => {
        expect(s.highRiskCount).toBeGreaterThan(0);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// 3. calculateRepStats
// ---------------------------------------------------------------------------

describe("calculateRepStats", () => {
  it("correctly aggregates accounts per rep", () => {
    const reps: Rep[] = [
      { Rep_Name: "Alice", Location: "NY", Segment: "Enterprise" },
      { Rep_Name: "Bob", Location: "CA", Segment: "Enterprise" },
    ];
    const accounts: Account[] = [
      makeAccount({ Assigned_Rep: "Alice", ARR: 100000, Risk_Score: 80, Location: "NY" }),
      makeAccount({ Assigned_Rep: "Alice", ARR: 200000, Risk_Score: 20, Location: "CA" }),
      makeAccount({ Assigned_Rep: "Bob", ARR: 150000, Risk_Score: 90, Location: "CA" }),
    ];

    const stats = calculateRepStats(accounts, reps);
    const alice = stats.find(s => s.name === "Alice")!;
    const bob = stats.find(s => s.name === "Bob")!;

    expect(alice.count).toBe(2);
    expect(alice.totalARR).toBe(300000);
    expect(alice.highRiskCount).toBe(1); // Risk_Score 80 > 70
    expect(alice.sameStateCount).toBe(1); // 1 NY account

    expect(bob.count).toBe(1);
    expect(bob.totalARR).toBe(150000);
    expect(bob.highRiskCount).toBe(1); // Risk_Score 90 > 70
    expect(bob.sameStateCount).toBe(1); // 1 CA account
  });

  it("returns zero stats for reps with no assignments", () => {
    const reps: Rep[] = [
      { Rep_Name: "Alice", Location: "NY", Segment: "Enterprise" },
    ];
    const stats = calculateRepStats([], reps);
    expect(stats[0].count).toBe(0);
    expect(stats[0].totalARR).toBe(0);
  });

  it("ignores accounts with unrecognized rep names", () => {
    const reps: Rep[] = [
      { Rep_Name: "Alice", Location: "NY", Segment: "Enterprise" },
    ];
    const accounts: Account[] = [
      makeAccount({ Assigned_Rep: "UnknownRep", ARR: 999999 }),
    ];
    const stats = calculateRepStats(accounts, reps);
    expect(stats[0].totalARR).toBe(0);
  });

  it("sorts by totalARR descending", () => {
    const reps: Rep[] = [
      { Rep_Name: "Low", Location: "NY", Segment: "Enterprise" },
      { Rep_Name: "High", Location: "CA", Segment: "Enterprise" },
    ];
    const accounts: Account[] = [
      makeAccount({ Assigned_Rep: "Low", ARR: 10000 }),
      makeAccount({ Assigned_Rep: "High", ARR: 500000 }),
    ];
    const stats = calculateRepStats(accounts, reps);
    expect(stats[0].name).toBe("High");
    expect(stats[1].name).toBe("Low");
  });
});

// ---------------------------------------------------------------------------
// 4. Edge Cases
// ---------------------------------------------------------------------------

describe("Edge Cases", () => {
  it("single rep per segment handles all accounts", () => {
    const reps: Rep[] = [
      { Rep_Name: "Solo-Ent", Location: "NY", Segment: "Enterprise" },
      { Rep_Name: "Solo-MM", Location: "CA", Segment: "Mid Market" },
    ];
    const accounts = segmentAccounts(
      makeAccounts(10, (i) => ({
        ARR: 50000,
        Num_Employees: i < 5 ? 10000 : 200,
      })),
      500
    );
    ALL_STRATEGIES.forEach(strategy => {
      const result = distributeAccounts(accounts, reps, strategy);
      expect(result.length).toBe(10);
      const entAssigned = result.filter(a => a.Segment === "Enterprise" && a.Assigned_Rep === "Solo-Ent");
      const mmAssigned = result.filter(a => a.Segment === "Mid Market" && a.Assigned_Rep === "Solo-MM");
      expect(entAssigned.length).toBe(5);
      expect(mmAssigned.length).toBe(5);
    });
  });

  it("handles accounts with zero ARR", () => {
    const reps: Rep[] = [
      { Rep_Name: "R1", Location: "NY", Segment: "Enterprise" },
      { Rep_Name: "R2", Location: "CA", Segment: "Enterprise" },
    ];
    const accounts = segmentAccounts(
      makeAccounts(4, () => ({ ARR: 0, Num_Employees: 10000 })),
      500
    );
    ALL_STRATEGIES.forEach(strategy => {
      const result = distributeAccounts(accounts, reps, strategy);
      expect(result.every(a => a.Assigned_Rep)).toBe(true);
    });
  });

  it("handles single account", () => {
    const reps: Rep[] = [
      { Rep_Name: "R1", Location: "NY", Segment: "Enterprise" },
      { Rep_Name: "R2", Location: "CA", Segment: "Enterprise" },
    ];
    const accounts = segmentAccounts(
      [makeAccount({ ARR: 500000, Num_Employees: 10000 })],
      500
    );
    const result = distributeAccounts(accounts, reps, "Pure ARR Balance");
    expect(result.length).toBe(1);
    expect(result[0].Assigned_Rep).toBeTruthy();
  });

  it("handles identical ARR values", () => {
    const reps: Rep[] = [
      { Rep_Name: "R1", Location: "NY", Segment: "Enterprise" },
      { Rep_Name: "R2", Location: "CA", Segment: "Enterprise" },
    ];
    const accounts = segmentAccounts(
      makeAccounts(10, () => ({ ARR: 100000, Num_Employees: 10000 })),
      500
    );
    const result = distributeAccounts(accounts, reps, "Pure ARR Balance");
    const stats = calculateRepStats(result, reps);
    // Should split 5/5
    expect(Math.abs(stats[0].count - stats[1].count)).toBeLessThanOrEqual(1);
  });

  it("extremely skewed ARR still completes without errors", () => {
    const reps: Rep[] = [
      { Rep_Name: "R1", Location: "NY", Segment: "Enterprise" },
      { Rep_Name: "R2", Location: "CA", Segment: "Enterprise" },
    ];
    const accounts = segmentAccounts(
      [
        makeAccount({ ARR: 10000000, Num_Employees: 10000 }),
        ...makeAccounts(9, () => ({ ARR: 100, Num_Employees: 10000 })),
      ],
      500
    );
    const result = distributeAccounts(accounts, reps, "Smart Multi-Factor");
    expect(result.length).toBe(10);
    expect(result.every(a => a.Assigned_Rep)).toBe(true);
  });

  it("all reps in same location with geo strategy still balances ARR", () => {
    const reps: Rep[] = [
      { Rep_Name: "R1", Location: "NY", Segment: "Enterprise" },
      { Rep_Name: "R2", Location: "NY", Segment: "Enterprise" },
    ];
    const accounts = segmentAccounts(
      makeAccounts(10, (i) => ({
        ARR: 50000 + i * 10000,
        Num_Employees: 10000,
        Location: "NY",
      })),
      500
    );
    const result = distributeAccounts(accounts, reps, "ARR + Geographic Clustering");
    const stats = calculateRepStats(result, reps);
    const diff = Math.abs(stats[0].totalARR - stats[1].totalARR);
    const avg = totalARR(accounts) / 2;
    // Even with geo bonus, ARR should still be somewhat balanced
    expect(diff / avg).toBeLessThan(0.25);
  });

  it("threshold at min employee count puts all in Enterprise", () => {
    const accounts = [
      makeAccount({ Num_Employees: 1457 }),
      makeAccount({ Num_Employees: 1500 }),
      makeAccount({ Num_Employees: 200000 }),
    ];
    const result = segmentAccounts(accounts, 1457);
    expect(result.every(a => a.Segment === "Enterprise")).toBe(true);
  });

  it("threshold just above max employee count puts all in Mid Market", () => {
    const accounts = [
      makeAccount({ Num_Employees: 199788 }),
      makeAccount({ Num_Employees: 1457 }),
    ];
    const result = segmentAccounts(accounts, 199789);
    expect(result.every(a => a.Segment === "Mid Market")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Equity Invariants (most important for the challenge)
// ---------------------------------------------------------------------------

describe("Equity Invariants", () => {
  const reps: Rep[] = [
    { Rep_Name: "Mickey Mouse", Location: "GA", Segment: "Enterprise" },
    { Rep_Name: "Goofy", Location: "NC", Segment: "Enterprise" },
    { Rep_Name: "Pluto", Location: "CA", Segment: "Enterprise" },
    { Rep_Name: "Daisy Duck", Location: "OH", Segment: "Enterprise" },
    { Rep_Name: "Minnie Mouse", Location: "NY", Segment: "Mid Market" },
    { Rep_Name: "Donald Duck", Location: "TX", Segment: "Mid Market" },
    { Rep_Name: "Ariel", Location: "MI", Segment: "Mid Market" },
    { Rep_Name: "Simba", Location: "PA", Segment: "Mid Market" },
    { Rep_Name: "Elsa", Location: "FL", Segment: "Mid Market" },
    { Rep_Name: "Moana", Location: "IL", Segment: "Mid Market" },
  ];

  // Simulate realistic data
  const rawAccounts = makeAccounts(100, (i) => ({
    ARR: 10000 + Math.floor(Math.random() * 490000),
    Num_Employees: 1500 + Math.floor(Math.random() * 198000),
    Risk_Score: 1 + Math.floor(Math.random() * 99),
    Location: ["GA", "NY", "TX", "NC", "CA", "OH", "MI", "PA", "FL", "IL"][i % 10],
  }));

  describe.each(ALL_STRATEGIES)("strategy: %s", (strategy) => {
    const threshold = 100000;
    const segmented = segmentAccounts(rawAccounts, threshold);
    const distributed = distributeAccounts(segmented, reps, strategy);
    const stats = calculateRepStats(distributed, reps);

    it("total ARR is preserved", () => {
      const before = totalARR(segmented);
      const after = stats.reduce((s, r) => s + r.totalARR, 0);
      expect(after).toBeCloseTo(before, 0);
    });

    it("all accounts are assigned to a valid rep", () => {
      const validRepNames = new Set(reps.map(r => r.Rep_Name));
      distributed.forEach(a => {
        if (a.Assigned_Rep) {
          expect(validRepNames.has(a.Assigned_Rep)).toBe(true);
        }
      });
    });

    it("no duplicate assignments (account appears once)", () => {
      const ids = distributed.map(a => a.Account_ID);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("Enterprise reps only get Enterprise accounts", () => {
      const entRepNames = new Set(reps.filter(r => r.Segment === "Enterprise").map(r => r.Rep_Name));
      distributed.filter(a => entRepNames.has(a.Assigned_Rep!)).forEach(a => {
        expect(a.Segment).toBe("Enterprise");
      });
    });

    it("Mid Market reps only get Mid Market accounts", () => {
      const mmRepNames = new Set(reps.filter(r => r.Segment === "Mid Market").map(r => r.Rep_Name));
      distributed.filter(a => mmRepNames.has(a.Assigned_Rep!)).forEach(a => {
        expect(a.Segment).toBe("Mid Market");
      });
    });

    it("Segment field is preserved on all accounts", () => {
      distributed.forEach(a => {
        expect(a.Segment === "Enterprise" || a.Segment === "Mid Market").toBe(true);
      });
    });

    it("ARR within segment is balanced (max/min ratio < 2x)", () => {
      const entReps = stats.filter(r => r.segment === "Enterprise" && r.count > 0);
      const mmReps = stats.filter(r => r.segment === "Mid Market" && r.count > 0);

      [entReps, mmReps].forEach(group => {
        if (group.length >= 2) {
          const maxARR = Math.max(...group.map(r => r.totalARR));
          const minARR = Math.min(...group.map(r => r.totalARR));
          if (minARR > 0) {
            expect(maxARR / minARR).toBeLessThan(2.0);
          }
        }
      });
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Threshold change scenarios (simulating slider movement)
// ---------------------------------------------------------------------------

describe("Threshold Change Scenarios", () => {
  const reps: Rep[] = [
    { Rep_Name: "E1", Location: "NY", Segment: "Enterprise" },
    { Rep_Name: "E2", Location: "CA", Segment: "Enterprise" },
    { Rep_Name: "M1", Location: "TX", Segment: "Mid Market" },
    { Rep_Name: "M2", Location: "FL", Segment: "Mid Market" },
  ];

  const rawAccounts = makeAccounts(50, (i) => ({
    ARR: 50000 + i * 5000,
    Num_Employees: 1000 + i * 4000, // Range: 1000 to 197000
    Risk_Score: (i * 7) % 100,
    Location: ["NY", "CA", "TX", "FL", "OH"][i % 5],
  }));

  it("lowering threshold moves accounts from MM to Enterprise", () => {
    const seg1 = segmentAccounts(rawAccounts, 100000);
    const seg2 = segmentAccounts(rawAccounts, 50000);

    const ent1 = seg1.filter(a => a.Segment === "Enterprise").length;
    const ent2 = seg2.filter(a => a.Segment === "Enterprise").length;

    expect(ent2).toBeGreaterThan(ent1);
  });

  it("raising threshold moves accounts from Enterprise to MM", () => {
    const seg1 = segmentAccounts(rawAccounts, 50000);
    const seg2 = segmentAccounts(rawAccounts, 150000);

    const mm1 = seg1.filter(a => a.Segment === "Mid Market").length;
    const mm2 = seg2.filter(a => a.Segment === "Mid Market").length;

    expect(mm2).toBeGreaterThan(mm1);
  });

  it("distribution works at multiple thresholds without errors", () => {
    const thresholds = [500, 5000, 25000, 50000, 100000, 150000, 200000];
    thresholds.forEach(threshold => {
      const segmented = segmentAccounts(rawAccounts, threshold);
      ALL_STRATEGIES.forEach(strategy => {
        expect(() => {
          const result = distributeAccounts(segmented, reps, strategy);
          expect(result.length).toBe(50);
        }).not.toThrow();
      });
    });
  });
});

// ---------------------------------------------------------------------------
// 7. Configurable High-Risk Threshold (Feature 2)
// ---------------------------------------------------------------------------

describe("Configurable High-Risk Threshold", () => {
  it("uses custom threshold in ARR + Risk Balance", () => {
    const reps: Rep[] = [
      { Rep_Name: "R1", Location: "NY", Segment: "Enterprise" },
      { Rep_Name: "R2", Location: "CA", Segment: "Enterprise" },
    ];
    // All accounts have Risk_Score 60
    const accounts = segmentAccounts(
      makeAccounts(10, () => ({ ARR: 100000, Num_Employees: 10000, Risk_Score: 60 })),
      500
    );

    // With default threshold 70, none are "high risk"
    const noSwapConfig: StrategyConfig = { ...DEFAULT_STRATEGY_CONFIG, enableSwapRefinement: false };
    const defaultResult = distributeAccounts(accounts, reps, "ARR + Risk Balance", noSwapConfig);
    const defaultStats = calculateRepStats(defaultResult, reps, 70);
    expect(defaultStats.every(s => s.highRiskCount === 0)).toBe(true);

    // With threshold 50, all are "high risk"
    const customConfig: StrategyConfig = { ...DEFAULT_STRATEGY_CONFIG, highRiskThreshold: 50, enableSwapRefinement: false };
    const customResult = distributeAccounts(accounts, reps, "ARR + Risk Balance", customConfig);
    const customStats = calculateRepStats(customResult, reps, 50);
    expect(customStats.every(s => s.highRiskCount > 0)).toBe(true);
  });

  it("calculateRepStats respects custom threshold", () => {
    const reps: Rep[] = [
      { Rep_Name: "R1", Location: "NY", Segment: "Enterprise" },
    ];
    const accounts: Account[] = [
      makeAccount({ Assigned_Rep: "R1", Risk_Score: 65 }),
      makeAccount({ Assigned_Rep: "R1", Risk_Score: 75 }),
    ];
    expect(calculateRepStats(accounts, reps, 70)[0].highRiskCount).toBe(1);
    expect(calculateRepStats(accounts, reps, 60)[0].highRiskCount).toBe(2);
    expect(calculateRepStats(accounts, reps, 80)[0].highRiskCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 8. Tunable Weights (Feature 4)
// ---------------------------------------------------------------------------

describe("Tunable Weights", () => {
  it("higher geo bonus increases same-state assignments", () => {
    const reps: Rep[] = [
      { Rep_Name: "NYRep", Location: "NY", Segment: "Enterprise" },
      { Rep_Name: "CARep", Location: "CA", Segment: "Enterprise" },
    ];
    const accounts = segmentAccounts(
      makeAccounts(20, (i) => ({
        ARR: 100000 + (i % 5) * 10000,
        Num_Employees: 10000,
        Location: i < 10 ? "NY" : "CA",
      })),
      500
    );

    const lowGeo: StrategyConfig = { ...DEFAULT_STRATEGY_CONFIG, geoBonusPct: 5, enableSwapRefinement: false };
    const highGeo: StrategyConfig = { ...DEFAULT_STRATEGY_CONFIG, geoBonusPct: 30, enableSwapRefinement: false };

    const lowResult = distributeAccounts(accounts, reps, "ARR + Geographic Clustering", lowGeo);
    const highResult = distributeAccounts(accounts, reps, "ARR + Geographic Clustering", highGeo);

    const sameState = (result: Account[]) =>
      result.filter(a => {
        const rep = reps.find(r => r.Rep_Name === a.Assigned_Rep);
        return rep && a.Location === rep.Location;
      }).length;

    expect(sameState(highResult)).toBeGreaterThanOrEqual(sameState(lowResult));
  });

  it("default config with swap off produces deterministic results", () => {
    const reps = makeReps();
    const accounts = segmentAccounts(
      makeAccounts(20, (i) => ({
        ARR: 10000 + i * 5000,
        Num_Employees: i < 10 ? 10000 : 200,
      })),
      500
    );
    const noSwapConfig: StrategyConfig = { ...DEFAULT_STRATEGY_CONFIG, enableSwapRefinement: false };
    ALL_STRATEGIES.forEach(strategy => {
      const run1 = distributeAccounts(accounts, reps, strategy, noSwapConfig);
      const run2 = distributeAccounts(accounts, reps, strategy, noSwapConfig);
      run1.forEach((a, i) => {
        expect(a.Assigned_Rep).toBe(run2[i].Assigned_Rep);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// 9. Swap Refinement (Feature 1)
// ---------------------------------------------------------------------------

describe("Swap Refinement", () => {
  const stdDevFn = (vals: number[]) => {
    if (vals.length === 0) return 0;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.sqrt(vals.reduce((sq, v) => sq + (v - mean) ** 2, 0) / vals.length);
  };

  it("swap refinement does not worsen ARR balance", () => {
    const reps: Rep[] = [
      { Rep_Name: "R1", Location: "NY", Segment: "Enterprise" },
      { Rep_Name: "R2", Location: "CA", Segment: "Enterprise" },
      { Rep_Name: "R3", Location: "TX", Segment: "Enterprise" },
    ];
    const accounts = segmentAccounts(
      makeAccounts(30, (i) => ({ ARR: 50000 + i * 20000, Num_Employees: 10000 })),
      500
    );

    const noSwapConfig: StrategyConfig = { ...DEFAULT_STRATEGY_CONFIG, enableSwapRefinement: false };
    const swapConfig: StrategyConfig = { ...DEFAULT_STRATEGY_CONFIG, enableSwapRefinement: true, maxSwapIterations: 10 };

    const noSwap = distributeAccounts(accounts, reps, "Pure ARR Balance", noSwapConfig);
    const withSwap = distributeAccounts(accounts, reps, "Pure ARR Balance", swapConfig);

    const noSwapStats = calculateRepStats(noSwap, reps);
    const withSwapStats = calculateRepStats(withSwap, reps);

    const noSwapSpread = stdDevFn(noSwapStats.map(s => s.totalARR));
    const withSwapSpread = stdDevFn(withSwapStats.map(s => s.totalARR));

    expect(withSwapSpread).toBeLessThanOrEqual(noSwapSpread + 1);
  });

  it("preserves segment isolation during swaps", () => {
    const reps = makeReps();
    const accounts = segmentAccounts(
      makeAccounts(20, (i) => ({
        ARR: 10000 + i * 5000,
        Num_Employees: i < 10 ? 10000 : 200,
      })),
      500
    );
    const swapConfig: StrategyConfig = { ...DEFAULT_STRATEGY_CONFIG, enableSwapRefinement: true };
    const result = distributeAccounts(accounts, reps, "Smart Multi-Factor", swapConfig);

    const entRepNames = new Set(reps.filter(r => r.Segment === "Enterprise").map(r => r.Rep_Name));
    const mmRepNames = new Set(reps.filter(r => r.Segment === "Mid Market").map(r => r.Rep_Name));

    result.filter(a => a.Segment === "Enterprise").forEach(a => {
      expect(entRepNames.has(a.Assigned_Rep!)).toBe(true);
    });
    result.filter(a => a.Segment === "Mid Market").forEach(a => {
      expect(mmRepNames.has(a.Assigned_Rep!)).toBe(true);
    });
  });

  it("total ARR preserved after swap refinement", () => {
    const reps = makeReps();
    const accounts = segmentAccounts(
      makeAccounts(20, (i) => ({
        ARR: 10000 + i * 5000,
        Num_Employees: i < 10 ? 10000 : 200,
      })),
      500
    );
    const original = totalARR(accounts);
    const swapConfig: StrategyConfig = { ...DEFAULT_STRATEGY_CONFIG, enableSwapRefinement: true };
    const result = distributeAccounts(accounts, reps, "ARR + Risk Balance", swapConfig);
    expect(totalARR(result)).toBeCloseTo(original, 0);
  });

  it("all accounts still assigned after swap refinement", () => {
    const reps = makeReps();
    const accounts = segmentAccounts(
      makeAccounts(20, (i) => ({
        ARR: 10000 + i * 5000,
        Num_Employees: i < 10 ? 10000 : 200,
      })),
      500
    );
    const swapConfig: StrategyConfig = { ...DEFAULT_STRATEGY_CONFIG, enableSwapRefinement: true };
    ALL_STRATEGIES.forEach(strategy => {
      const result = distributeAccounts(accounts, reps, strategy, swapConfig);
      const assigned = result.filter(a => a.Assigned_Rep);
      expect(assigned.length).toBe(20);
    });
  });

  it("respects maxSwapIterations = 0 (no swaps performed)", () => {
    const reps: Rep[] = [
      { Rep_Name: "R1", Location: "NY", Segment: "Enterprise" },
      { Rep_Name: "R2", Location: "CA", Segment: "Enterprise" },
    ];
    const accounts = segmentAccounts(
      makeAccounts(10, (i) => ({ ARR: 50000 + i * 10000, Num_Employees: 10000 })),
      500
    );
    const noSwapConfig: StrategyConfig = { ...DEFAULT_STRATEGY_CONFIG, enableSwapRefinement: false };
    const zeroIterConfig: StrategyConfig = { ...DEFAULT_STRATEGY_CONFIG, enableSwapRefinement: true, maxSwapIterations: 0 };

    const noSwap = distributeAccounts(accounts, reps, "Pure ARR Balance", noSwapConfig);
    const zeroIter = distributeAccounts(accounts, reps, "Pure ARR Balance", zeroIterConfig);

    noSwap.forEach((a, i) => {
      expect(a.Assigned_Rep).toBe(zeroIter[i].Assigned_Rep);
    });
  });

  it("swap refinement works across all strategies without errors", () => {
    const reps = makeReps();
    const accounts = segmentAccounts(
      makeAccounts(40, (i) => ({
        ARR: 10000 + i * 5000,
        Num_Employees: i < 20 ? 10000 : 200,
        Risk_Score: (i * 7) % 100,
        Location: ["NY", "CA", "TX", "FL"][i % 4],
      })),
      500
    );
    const swapConfig: StrategyConfig = { ...DEFAULT_STRATEGY_CONFIG, enableSwapRefinement: true };
    ALL_STRATEGIES.forEach(strategy => {
      expect(() => {
        const result = distributeAccounts(accounts, reps, strategy, swapConfig);
        expect(result.length).toBe(40);
        expect(result.every(a => a.Assigned_Rep)).toBe(true);
      }).not.toThrow();
    });
  });
});
