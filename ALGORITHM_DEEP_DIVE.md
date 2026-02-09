# Territory Slicer — Algorithm Deep Dive

> **Purpose of this doc**: You can explain every single decision in this tool to
> anyone — your interviewer, your VP of Sales, or a five-year-old. Read it top to
> bottom and you'll understand the full "why" and "how" of every line of logic.

---

## Table of Contents

1. [The Big Picture (What Problem Are We Solving?)](#1-the-big-picture)
2. [The Data We Start With](#2-the-data-we-start-with)
3. [Step 1 — Segmentation (Splitting Accounts Into Two Buckets)](#3-step-1--segmentation)
4. [Step 2 — Distribution (Assigning Accounts to Reps)](#4-step-2--distribution)
   - [The Core Idea: Greedy Bin Packing](#the-core-idea-greedy-bin-packing)
   - [Strategy 1: Pure ARR Balance](#strategy-1-pure-arr-balance)
   - [Strategy 2: ARR + Risk Balance](#strategy-2-arr--risk-balance)
   - [Strategy 3: ARR + Geographic Clustering](#strategy-3-arr--geographic-clustering)
   - [Strategy 4: Smart Multi-Factor](#strategy-4-smart-multi-factor)
5. [Step 3 — Metrics (Measuring How Good the Assignment Is)](#5-step-3--metrics)
6. [The Full Pipeline End-to-End](#6-the-full-pipeline-end-to-end)
7. [Why Each Design Decision Was Made](#7-why-each-design-decision-was-made)
8. [Common Interview Questions & Answers](#8-common-interview-questions--answers)

---

## 1. The Big Picture

Imagine you're a sales leader. You have:

- **500 customer accounts** (companies like Walmart, Amazon, Apple, etc.)
- **10 sales reps** (Mickey Mouse, Minnie Mouse, Donald Duck, etc.)
- Each account pays you money every year (**ARR** = Annual Recurring Revenue)
- Each rep is either an **Enterprise** specialist or a **Mid-Market** specialist

**Your problem**: How do you divide 500 accounts among 10 reps so that:
1. Every rep gets a **fair share of revenue** (nobody gets $20M while someone else gets $2M)
2. **Risky accounts** are spread out (nobody gets stuck with ALL the accounts about to churn)
3. Reps get accounts **near them geographically** when possible (less travel = happier reps)
4. The **workload** (number of accounts) is roughly even

This tool lets you explore different ways to slice those territories by adjusting
a **threshold slider** and choosing a **distribution strategy**, then instantly seeing
the results.

---

## 2. The Data We Start With

### Reps CSV (10 reps)

| Field | What It Is | Example |
|-------|-----------|---------|
| `Rep_Name` | The rep's name | Mickey Mouse |
| `Location` | The US state they're based in | GA |
| `Segment` | Their specialty | Enterprise or Mid Market |

We have **4 Enterprise reps** and **6 Mid-Market reps**.

### Accounts CSV (500 accounts)

| Field | What It Is | Example |
|-------|-----------|---------|
| `Account_ID` | Unique ID | ACC-1000 |
| `Account_Name` | Company name | Walmart |
| `Current_Rep` | Who manages it today | Ariel |
| `ARR` | Annual Recurring Revenue in dollars | $45,177 |
| `Location` | The US state the account is in | TX |
| `Num_Employees` | How many employees the company has | 54,503 |
| `Num_Marketers` | How many marketers on their team | 4,360 |
| `Risk_Score` | 1–99, how likely this account is to churn | 99 (very risky!) |

**Key ranges in our dataset**:
- ARR: ~$10K to ~$500K per account
- Employees: ~1,500 to ~199,000
- Risk Score: 1 to 99

---

## 3. Step 1 — Segmentation

### What it does

Every account gets labeled as either **Enterprise** or **Mid Market** based on
one simple rule:

```
IF the company has >= [threshold] employees → Enterprise
IF the company has <  [threshold] employees → Mid Market
```

### The threshold slider

The user moves a slider between **500** and **200,000** employees.

**Think of it like a volume knob**:
- Turn it LOW (e.g., 500) → almost every company is "big" → almost everything is Enterprise
- Turn it HIGH (e.g., 200,000) → almost every company is "small" → almost everything is Mid-Market
- The sweet spot is somewhere in the middle

### Example

Threshold = **100,000** employees:

| Account | Employees | Segment |
|---------|-----------|---------|
| Walmart | 54,503 | Mid Market (54K < 100K) |
| Amazon | 86,168 | Mid Market (86K < 100K) |
| Apple | 190,538 | Enterprise (190K >= 100K) |
| Alphabet | 198,511 | Enterprise (198K >= 100K) |

### Why does the boundary use >= (greater than or equal)?

If a company has EXACTLY 100,000 employees and the threshold is 100,000, they
go into Enterprise. This is a deliberate choice — we figured a company right at
the line is better served by an Enterprise rep who handles bigger organizations.

### The code (dead simple)

```typescript
function segmentAccounts(accounts, threshold) {
  return accounts.map(acc => ({
    ...acc,
    Segment: acc.Num_Employees >= threshold ? "Enterprise" : "Mid Market"
  }));
}
```

That's it. One line of actual logic. Every account gets a `Segment` field.

---

## 4. Step 2 — Distribution

This is the heart of the tool. Now we need to assign each account to a specific rep.

### The Golden Rule: Segment Isolation

**Enterprise accounts ONLY go to Enterprise reps. Mid-Market accounts ONLY go to
Mid-Market reps.** Always. No exceptions.

Why? Because:
- Enterprise reps have different skills than Mid-Market reps
- They have different sales cycles, different pricing, different relationships
- Mixing them would defeat the purpose of having segments at all

So the distribution actually runs **twice** — once for the Enterprise pool, once
for the Mid-Market pool. They're completely independent.

```
Enterprise accounts (let's say 200) → distributed among 4 Enterprise reps
Mid-Market accounts (let's say 300) → distributed among 6 Mid-Market reps
```

---

### The Core Idea: Greedy Bin Packing

Every strategy in this tool uses the same underlying pattern. Here's the
analogy:

**Imagine you have 5 moving boxes (reps) and 50 items of different weights
(accounts with different ARR values). You want each box to weigh roughly the
same.**

The smart way to do this:

1. **Sort all items from heaviest to lightest** (biggest ARR first)
2. **Pick up the heaviest item**
3. **Put it in whichever box is currently the lightest**
4. **Repeat until everything is packed**

This is called the **Longest Processing Time (LPT) heuristic**. Computer
scientists proved it works well — the heaviest box will be at most ~33% heavier
than the lightest. That's pretty good for such a simple rule!

**Why sort from biggest to smallest?** If you did it the other way (smallest
first), by the time you get to the big items, you'd have no room to balance
them. Handling the big ones first means the small ones can fill in the gaps.

Think of it like packing a suitcase — you put in the shoes and books first
(big items), then stuff socks in the gaps (small items).

---

### Strategy 1: Pure ARR Balance

**Goal**: Make every rep's total revenue as equal as possible. Nothing else matters.

**Cost function**:
```
cost(rep) = rep's current total ARR
```

**How it works, step by step**:

Say we have 3 reps (all start at $0) and 6 accounts:

```
Accounts (sorted by ARR):  $500K, $400K, $300K, $200K, $150K, $100K

Step 1: $500K → Who has the least ARR? All are $0. Give to Rep A.
  Rep A: $500K | Rep B: $0 | Rep C: $0

Step 2: $400K → Who has the least? Rep B and C (tied at $0). Give to Rep B.
  Rep A: $500K | Rep B: $400K | Rep C: $0

Step 3: $300K → Who has the least? Rep C ($0). Give to Rep C.
  Rep A: $500K | Rep B: $400K | Rep C: $300K

Step 4: $200K → Who has the least? Rep C ($300K). Give to Rep C.
  Rep A: $500K | Rep B: $400K | Rep C: $500K

Step 5: $150K → Who has the least? Rep B ($400K). Give to Rep B.
  Rep A: $500K | Rep B: $550K | Rep C: $500K

Step 6: $100K → Who has the least? Rep A or C (tied at $500K). Give to Rep A.
  Rep A: $600K | Rep B: $550K | Rep C: $500K
```

**Result**: $600K vs $550K vs $500K. Pretty balanced! The gap is only ~$100K
on $550K average.

**The code**:
```typescript
function greedyBinPacking(accounts, reps) {
  // Sort accounts: biggest ARR first
  const sorted = [...accounts].sort((a, b) => b.ARR - a.ARR);

  // Track each rep's running total
  const repHeaps = reps.map(r => ({ ...r, currentARR: 0 }));

  return sorted.map(account => {
    // Find the rep with the lowest total ARR right now
    repHeaps.sort((a, b) => a.currentARR - b.currentARR);
    const targetRep = repHeaps[0];  // The "lightest" rep

    // Assign this account to them
    targetRep.currentARR += account.ARR;
    return { ...account, Assigned_Rep: targetRep.Rep_Name };
  });
}
```

**When to use this**: When your ONLY priority is revenue fairness and you don't
care about risk, geography, or workload.

---

### Strategy 2: ARR + Risk Balance

**Goal**: Keep revenue fair, BUT ALSO make sure risky accounts are spread around.
No one rep should be stuck with all the accounts that might churn.

**What's a "high-risk" account?** Any account with `Risk_Score > 70`. In our
dataset, roughly ~30% of accounts are high-risk.

**Cost function**:
```
cost(rep) = rep's current total ARR + risk adjustment
```

**The risk adjustment works like a nudge**:

First, we calculate a "risk budget" based on the dataset:
```
avgARRPerRep = total ARR of all accounts / number of reps
riskPenalty  = avgARRPerRep * 0.08  (8% of average book)
riskBonus    = avgARRPerRep * 0.04  (4% of average book)
```

Then, for each high-risk account we're placing:
- **If a rep already has >40% of their accounts as high-risk**: Add a PENALTY
  (makes their "cost" look higher → algorithm avoids them).
  *"You already have too many risky accounts, let someone else take this one."*

- **If a rep has <20% high-risk accounts**: Subtract a BONUS
  (makes their "cost" look lower → algorithm prefers them).
  *"You can handle more risk, come take this one."*

- **If a rep is between 20-40% high-risk**: No adjustment — they're in the
  acceptable range already.

**Why is the penalty (8%) bigger than the bonus (4%)?** Because we care MORE
about preventing a disaster (one rep with 80% risky accounts) than about
achieving perfection (every rep at exactly 30%). The penalty is a "red alert"
— the bonus is just a gentle nudge.

**Important detail**: The risk adjustment ONLY activates for high-risk accounts
(`Risk_Score > 70`). If we're assigning a low-risk account, no adjustment
happens — pure ARR balance decides.

**Also important**: When a rep has ZERO accounts so far (`count === 0`), no risk
adjustment happens either. We can't calculate a percentage of zero. The first
account assigned to each rep is always purely based on ARR.

**Walk-through**:

```
Accounts: $500K (risk:90), $400K (risk:85), $300K (risk:20), $200K (risk:75)
Reps: Alice ($0, 0 accts), Bob ($0, 0 accts)
avgARRPerRep = $700K  (total $1.4M / 2 reps)
riskPenalty = $56K    (8% of $700K)
riskBonus = $28K      (4% of $700K)

Step 1: $500K (HIGH RISK, score 90)
  Alice: cost = $0 (count=0, skip risk check) = $0
  Bob:   cost = $0 (count=0, skip risk check) = $0
  → Tie, give to Alice.
  Alice: $500K, 1 acct, 1 high-risk (100% high-risk)

Step 2: $400K (HIGH RISK, score 85)
  Alice: cost = $500K, risk% = 100% > 40% → PENALTY → $500K + $56K = $556K
  Bob:   cost = $0 (count=0, skip risk check) = $0
  → Bob wins easily.
  Bob: $400K, 1 acct, 1 high-risk (100% high-risk)

Step 3: $300K (LOW RISK, score 20)
  No risk adjustment for low-risk accounts! Pure ARR decides.
  Alice: cost = $500K
  Bob:   cost = $400K
  → Bob is lower, give to Bob.
  Bob: $700K, 2 accts, 1 high-risk (50% high-risk)

Step 4: $200K (HIGH RISK, score 75)
  Alice: cost = $500K, risk% = 100% > 40% → PENALTY → $556K
  Bob:   cost = $700K, risk% = 50% > 40% → PENALTY → $756K
  → Alice is lower at $556K, give to Alice.
  Alice: $700K, 2 accts, 2 high-risk

Result: Alice $700K (2 high-risk), Bob $700K (1 high-risk)
```

Notice: The revenue ended up perfectly balanced AND both reps share the risk.

---

### Strategy 3: ARR + Geographic Clustering

**Goal**: Keep revenue fair, BUT ALSO try to give reps accounts in their home
state. Less travel = lower costs, deeper local relationships.

**Cost function**:
```
cost(rep) = rep's current total ARR - geography bonus
```

**The geography bonus**:
```
avgARRPerRep = total ARR / number of reps
geoBonus = avgARRPerRep * 0.15  (15% of average book)
```

If the account is in the **same state** as the rep, we SUBTRACT the geoBonus
from the rep's cost. This makes the rep look "cheaper" to the algorithm, so
the account is more likely to go to them.

**Why 15%?** This is a carefully chosen number:
- **Too small** (like 1%) → geography barely matters, you get the same result
  as pure ARR balance
- **Too big** (like 50%) → geography dominates everything, one rep could end
  up with $20M and another with $5M because all the big accounts are in one state
- **15% is the sweet spot** → meaningful influence on assignment without
  destroying revenue fairness

**Walk-through**:

```
Reps: Alice (NY), Bob (CA)
Accounts: $500K (NY), $400K (CA), $300K (NY), $200K (TX)
avgARRPerRep = $700K
geoBonus = $105K (15% of $700K)

Step 1: $500K (NY)
  Alice (NY): cost = $0 - $105K = -$105K  ← same state!
  Bob (CA):   cost = $0
  → Alice wins (lower cost). Alice: $500K

Step 2: $400K (CA)
  Alice (NY): cost = $500K
  Bob (CA):   cost = $0 - $105K = -$105K  ← same state!
  → Bob wins. Bob: $400K

Step 3: $300K (NY)
  Alice (NY): cost = $500K - $105K = $395K  ← same state!
  Bob (CA):   cost = $400K
  → Alice wins ($395K < $400K). Alice: $800K

Step 4: $200K (TX)
  Alice (NY): cost = $800K  (TX ≠ NY, no bonus)
  Bob (CA):   cost = $400K  (TX ≠ CA, no bonus)
  → Bob wins. Bob: $600K

Result: Alice $800K (2 NY accts), Bob $600K (1 CA acct, 1 TX acct)
ARR gap: $200K — slightly less balanced, but NY accounts stuck together.
```

**Key insight**: Geography and ARR balance are in tension. You can't perfectly
optimize both. The 15% bonus means geography "wins" when two reps are close in
ARR, but ARR balance "wins" when the gap is large.

---

### Strategy 4: Smart Multi-Factor

**Goal**: Balance everything at once — revenue, workload, geography, and risk.
The "I want it all" strategy.

**Cost function**:
```
cost(rep) = rep's current total ARR
           + workload penalty      (if rep has too many accounts)
           - geography bonus       (if account is in rep's state)
           + risk adjustment       (if account is high-risk)
```

**The adjustments** (all scaled to average ARR per rep):

| Factor | Size | When It Kicks In |
|--------|------|-----------------|
| Workload penalty | **+6%** of avg book | Rep has more than 110% of the target account count |
| Geography bonus | **-10%** of avg book | Account is in the same state as the rep |
| Risk penalty | **+5%** of avg book | High-risk account AND rep already has >40% high-risk |
| Risk bonus | **-3%** of avg book | High-risk account AND rep has <20% high-risk |

**What's the "target account count"?**
```
target = total accounts in this segment / number of reps in this segment
```
For example: 300 Mid-Market accounts / 6 Mid-Market reps = 50 accounts each.
The workload penalty kicks in at 110% of 50 = 55 accounts.

**Why are the weights smaller than the individual strategies?**
Because they need to coexist! If geography was still 15% AND risk was still 8%,
together they'd be 23% — too strong, and they'd overpower ARR balance. By using
10% and 5%/3%, each factor gets a voice without shouting.

**Notice the geography bonus is 10% here vs 15% in Strategy 3.** That's
intentional — in Strategy 3, geography is the ONLY secondary factor, so it gets
a stronger voice. In Strategy 4, it shares the stage with workload and risk,
so it gets a smaller voice.

**Same for risk: 5%/3% here vs 8%/4% in Strategy 2.** Strategy 2 is laser-
focused on risk, so the adjustments are bigger. Strategy 4 spreads its
attention across multiple factors.

---

## 5. Step 3 — Metrics

After accounts are assigned, we measure how good the assignment is. Metrics are
computed **separately for Enterprise and Mid-Market** (because comparing across
segments doesn't make sense — Enterprise reps are expected to have different
ARR than Mid-Market reps).

### Metric 1: ARR Spread (Standard Deviation)

**What it measures**: How evenly revenue is split among reps in a segment.

**How it's calculated**:
1. Get each rep's total ARR: [$3.2M, $3.1M, $3.4M, $3.0M]
2. Find the average: $3.175M
3. Find how far each rep is from the average: [$25K, -$75K, $225K, -$175K]
4. Square those differences: [$625M, $5.6B, $50.6B, $30.6B]
5. Average the squares: $21.9B
6. Take the square root: **$148K**

**What the number means**:
- `$0` = perfect balance (every rep has exactly the same ARR)
- Lower is better
- If the std dev is $148K on a $3.175M average, that's about 4.7% variation — very good!

**Why we show the average alongside it**: "$148K std dev" means nothing without
context. On a $3M average book, that's amazing. On a $200K average book, that's terrible.

### Metric 2: Workload Balance (Range)

**What it measures**: The gap between the most-loaded and least-loaded rep.

**How it's calculated**:
```
Range = max(accounts per rep) - min(accounts per rep)
```

Example: Reps have [52, 48, 50, 51, 49, 50] accounts.
Range = 52 - 48 = **4**

**What the number means**:
- `0` = every rep has the exact same number of accounts
- Lower is better
- We also show the actual min–max range (e.g., "48–52 accts/rep") for context

### Metric 3: Same-State % (Geographic Match)

**What it measures**: What percentage of accounts are assigned to a rep in the
same state?

**How it's calculated**:
```
Same-State % = (accounts where account.Location == rep.Location) / total accounts * 100
```

Example: 80 out of 300 Mid-Market accounts are assigned to a rep in the same state.
Same-State % = 80/300 = **26.7%**

**What the number means**:
- Higher is better
- With 10 states and 10 reps, random chance would give you ~10%
- Anything above 20% means the algorithm is actively clustering by geography

### Metric 4: Risk Balance (Standard Deviation of High-Risk %)

**What it measures**: How evenly high-risk accounts are spread across reps.

**How it's calculated**:
1. For each rep, calculate their high-risk percentage:
   - Rep A: 12 high-risk out of 50 total = 24%
   - Rep B: 15 high-risk out of 52 total = 28.8%
   - Rep C: 10 high-risk out of 48 total = 20.8%
2. Take the standard deviation of those percentages: [24%, 28.8%, 20.8%]
   - Mean = 24.5%
   - Std Dev = **~3.3%**

**What the number means**:
- `0%` = every rep has the exact same proportion of risky accounts
- Lower is better
- We also show the average high-risk % (e.g., "avg 25% high-risk") for context

### Why Metrics Are Per-Segment

**This was a critical fix.** The old version computed metrics across ALL reps
together. This was misleading because:

- Enterprise reps manage ~$3M each (bigger accounts, fewer of them)
- Mid-Market reps manage ~$1.8M each (smaller accounts, more of them)
- Std dev across all 10 reps mixes apples and oranges → produces a scary big
  number like "$4M std dev" that doesn't mean anything useful

Now we compute Enterprise metrics only compared to other Enterprise reps, and
Mid-Market only compared to other Mid-Market reps. The numbers are smaller,
meaningful, and actually tell you if the strategy is working.

---

## 6. The Full Pipeline End-to-End

Here's exactly what happens when a user moves the slider or changes the strategy:

```
User moves slider to 145,000
           ↓
segmentAccounts(500 accounts, 145000)
           ↓
Each account gets Segment based on Num_Employees >= 145000
  → ~180 Enterprise accounts, ~320 Mid-Market accounts
           ↓
distributeAccounts(segmented accounts, 10 reps, "ARR + Geographic Clustering")
           ↓
  ┌─ Enterprise pool: 180 accounts → 4 Enterprise reps
  │   1. Sort 180 accounts by ARR descending
  │   2. For each account, calculate cost for each of 4 reps
  │   3. Assign to lowest-cost rep
  │   4. Update that rep's running totals
  │
  └─ Mid-Market pool: 320 accounts → 6 Mid-Market reps
      1. Sort 320 accounts by ARR descending
      2. For each account, calculate cost for each of 6 reps
      3. Assign to lowest-cost rep
      4. Update that rep's running totals
           ↓
calculateRepStats(500 assigned accounts, 10 reps)
           ↓
For each rep, count up:
  - Total ARR
  - Number of accounts
  - Number of high-risk accounts (Risk_Score > 70)
  - Number of same-state accounts
           ↓
computeSegmentMetrics(Enterprise reps) → ARR spread, workload, geo%, risk
computeSegmentMetrics(Mid-Market reps)  → ARR spread, workload, geo%, risk
           ↓
UI updates: chart re-renders, metrics table re-renders, rep cards update
```

The entire pipeline is pure functions — same input always produces the same
output. No randomness, no side effects, no database calls. Everything runs
in the browser in milliseconds.

---

## 7. Why Each Design Decision Was Made

### "Why greedy bin packing and not something more optimal?"

An optimal solution (trying every possible assignment) would take longer than
the age of the universe for 500 accounts and 10 reps. There are 10^500 possible
combinations. Greedy bin packing runs in milliseconds and gets within ~33% of
optimal. In practice, it's usually much closer than that.

### "Why sort by ARR descending specifically?"

If you sort ascending (smallest first), the small accounts get distributed
evenly, but then the big accounts at the end cause huge imbalances because
there's no room to compensate. Descending order handles the hard cases first
and lets the easy cases fill gaps.

### "Why scale adjustments to average ARR per rep?"

The original implementation used fixed dollar amounts (like a $150K penalty).
That works for one dataset, but if someone uploads a dataset where accounts
average $10K ARR, a $150K penalty would completely dominate. By using
percentages of average book size, the adjustments automatically adapt to any
dataset.

### "Why is the Risk_Score > 70 threshold hardcoded?"

In the sample dataset, Risk_Score ranges from 1 to 99. Setting the "high-risk"
line at 70 captures roughly the riskiest ~30% of accounts. This is a common
Pareto-style split — focus on the top tier of risk. It could be made
configurable, but for the challenge, a fixed threshold keeps things simple and
is a defensible choice.

### "Why run Enterprise and Mid-Market separately?"

If you ran them together, an Enterprise rep could end up with Mid-Market
accounts (or vice versa). That defeats the purpose of segmentation. Each segment
is a completely independent optimization problem.

### "Why track sameStateCount during distribution?"

We need to know how many accounts ended up in the same state as their rep. This
is tracked as accounts are assigned (not recalculated later) for efficiency.

### "Why use population standard deviation instead of sample standard deviation?"

We're measuring the entire population (all reps), not a sample from a larger
group. Population std dev (dividing by N) is the mathematically correct choice
here. Sample std dev (dividing by N-1) would slightly overstate the variation.

---

## 8. Common Interview Questions & Answers

### Q: "Walk me through how the algorithm assigns a single account."

**A**: "I'll use Strategy 3 (Geographic Clustering) as an example. Say we're assigning
a $300K account located in California. We have 4 Enterprise reps: Mickey (GA, $2M),
Goofy (NC, $1.8M), Pluto (CA, $2.1M), Daisy (OH, $1.9M). The geo bonus is $300K
(15% of the $2M average). We calculate each rep's cost:
- Mickey: $2M (not CA)
- Goofy: $1.8M (not CA)
- Pluto: $2.1M - $300K = $1.8M (CA match!)
- Daisy: $1.9M (not CA)

Goofy and Pluto tie at $1.8M, but Pluto gets the geographic benefit. The account
goes to whoever the algorithm evaluates first in a tie (Goofy in this case since
he comes first in the rep list). The key insight: the geo bonus made Pluto competitive
even though he had the highest ARR."

### Q: "Why does ARR + Geographic Clustering sometimes beat ARR + Risk Balance on the risk metric?"

**A**: "This is counterintuitive but makes sense. The Risk Balance strategy only
adjusts costs when specific conditions are met: the account must be high-risk AND
the rep must be above 40% or below 20%. There's a 'dead zone' from 20-40% where
no adjustment happens. Plus, the very first account assigned to each rep gets no
risk adjustment at all (can't compute a percentage of zero accounts).

Geographic Clustering, meanwhile, shuffles the assignment order based on state
matching. Since risk scores aren't correlated with geography in our dataset,
this random shuffling incidentally distributes risk more evenly than the
targeted-but-conservative risk strategy. It's like how shuffling a deck of
cards distributes suits more evenly than a targeted sort with strict rules."

### Q: "What's the time complexity?"

**A**: "For n accounts and k reps: O(n log n) for sorting + O(n * k) for assignment.
With 500 accounts and 10 reps, that's about 5,000 operations for sorting and
5,000 for assignment. Runs in under 1ms in the browser. Could scale to tens of
thousands of accounts without issues."

### Q: "What would you improve if you had more time?"

**A**: Good things to mention:
1. Make the high-risk threshold (70) configurable via the UI
2. Add a "constraint" mode where certain accounts must stay with certain reps
3. Add a comparison view showing two strategies side-by-side
4. Use a min-heap instead of re-sorting reps each time (O(n * log k) instead of O(n * k))
5. Add an "undo" feature to manually override specific assignments
6. Make the adjustment percentages (8%, 4%, 15%, etc.) tunable via sliders

### Q: "How do you validate that the algorithm works correctly?"

**A**: "We have 72 unit tests covering:
- **Segmentation**: threshold boundaries, empty input, exact boundary values
- **All 4 strategies**: every account gets assigned, total ARR is preserved,
  segment isolation is maintained
- **Equity invariants**: the max/min ARR ratio stays under 2x for any strategy
  (this is the proven bound for the LPT algorithm)
- **Edge cases**: zero-ARR accounts, single rep, all accounts in one segment,
  extremely skewed data
- **Threshold scenarios**: moving the slider up and down never crashes

Run them with `npm test` — all 72 pass."

### Q: "Why did the old ARR Std Dev show $4 million?"

**A**: "It was computed across ALL 10 reps together — both Enterprise and Mid-Market.
Enterprise reps carry ~$3-4M each while Mid-Market reps carry ~$1.5-2M each.
The std dev of mixing those two groups is naturally huge, but it doesn't indicate
a bad distribution. It's like calculating the average height of NBA players
and kindergarteners together — the 'spread' is large but meaningless.

We fixed this by computing metrics per-segment. Now Enterprise reps are compared
only to other Enterprise reps, and Mid-Market to Mid-Market. The numbers are
much smaller and actually tell you whether the strategy is balancing well
within each segment."

### Q: "What happens if someone uploads a dataset with different reps or accounts?"

**A**: "Everything adapts automatically because:
- Segmentation is based on the threshold and account data — works on any dataset
- All cost adjustments are scaled to 'average ARR per rep' — automatically
  calibrates to the dataset's magnitude
- Segment isolation uses the rep's declared segment — works regardless of how
  many reps are in each segment
- Edge cases are handled: zero reps in a segment leaves accounts unassigned,
  zero accounts in a segment is a no-op, single rep gets everything"

---

## Quick Reference: The Four Strategies at a Glance

| Strategy | What It Optimizes | Cost Function | Best When |
|----------|------------------|---------------|-----------|
| **Pure ARR** | Revenue fairness only | `ARR` | You just want equal revenue targets |
| **ARR + Risk** | Revenue + risk spreading | `ARR + risk nudge` | You have significant churn risk |
| **ARR + Geo** | Revenue + travel reduction | `ARR - state bonus` | Reps are field-based and travel matters |
| **Smart Multi** | Everything at once | `ARR + workload + risk - geo` | You want the best overall balance |

---

## Quick Reference: The Four Metrics at a Glance

| Metric | What It Tells You | How It's Calculated | Good vs Bad |
|--------|------------------|--------------------|----|
| **ARR Spread** | Is revenue split evenly? | Std dev of each rep's total ARR | Lower = more even |
| **Workload Balance** | Do reps have similar # of accounts? | Max accounts - Min accounts | Lower = more even |
| **Same-State %** | Are reps getting local accounts? | % of accounts in rep's state | Higher = more local |
| **Risk Balance** | Is churn risk shared? | Std dev of each rep's high-risk % | Lower = more shared |

---

*Good luck with the interview! You've got this.* 🎯
