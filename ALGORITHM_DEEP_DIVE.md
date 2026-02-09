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
   - [The MinHeap Data Structure (How We Find the Lightest Box Fast)](#the-minheap-data-structure)
   - [Strategy 1: Pure ARR Balance](#strategy-1-pure-arr-balance)
   - [Strategy 2: ARR + Risk Balance](#strategy-2-arr--risk-balance)
   - [Strategy 3: ARR + Geographic Clustering](#strategy-3-arr--geographic-clustering)
   - [Strategy 4: Smart Multi-Factor](#strategy-4-smart-multi-factor)
   - [Swap Refinement: The Post-Greedy Polish](#swap-refinement-the-post-greedy-polish)
5. [Step 3 — Metrics (Measuring How Good the Assignment Is)](#5-step-3--metrics)
6. [Configurable Weights — The Tunable Knobs](#6-configurable-weights--the-tunable-knobs)
7. [The Full Pipeline End-to-End](#7-the-full-pipeline-end-to-end)
8. [Why Each Design Decision Was Made](#8-why-each-design-decision-was-made)
9. [Common Interview Questions & Answers](#9-common-interview-questions--answers)
10. [Interview Presentation Script — Impress the Profound GTM Engineer](#10-interview-presentation-script)

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

### The Kid-Friendly Version

Think of it like this: You're a teacher with a big jar of 500 different-colored candies. You
have 10 kids in your class. Some candies are big (worth a lot of money), some are small.
Some candies are "spicy" (risky — might upset the kid's stomach). Some candies are in
bags labeled with the kid's name (same state = easy to reach).

You want to give candies to kids so that:
- Every kid gets about the **same total weight** of candy (fair revenue)
- No one kid gets ALL the spicy ones (spread the risk)
- Kids get the candies with their name on them when possible (geographic match)
- Every kid gets roughly the **same number** of candies (fair workload)

This tool lets you explore different ways to hand out those candies by adjusting
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
IF the company has >= [threshold] employees -> Enterprise
IF the company has <  [threshold] employees -> Mid Market
```

### The Kid-Friendly Version

Imagine you have a height measuring stick at an amusement park ride. The stick says
"You must be THIS tall to ride." If a kid is tall enough, they go on the big-kid ride
(Enterprise). If they're shorter, they go on the regular ride (Mid Market).

The **threshold slider** is like moving that measuring stick up and down:
- Move it DOWN (low number like 500) -> almost every kid is "tall enough" -> almost everything is Enterprise
- Move it UP (high number like 200,000) -> almost no kid reaches -> almost everything is Mid-Market
- The sweet spot is somewhere in the middle

### Example

Threshold = **100,000** employees:

| Account | Employees | Segment | Why? |
|---------|-----------|---------|------|
| Walmart | 54,503 | Mid Market | 54K < 100K, too short for the big ride |
| Amazon | 86,168 | Mid Market | 86K < 100K, still too short |
| Apple | 190,538 | Enterprise | 190K >= 100K, tall enough! |
| Alphabet | 198,511 | Enterprise | 198K >= 100K, tall enough! |

### Why does the boundary use >= (greater than or equal)?

If a company has EXACTLY 100,000 employees and the threshold is 100,000, they
go into Enterprise. This is a deliberate choice — we figured a company right at
the line is better served by an Enterprise rep who handles bigger organizations.

**Kid analogy**: If you're EXACTLY as tall as the measuring stick, you get to
ride the big-kid ride. We're being generous here.

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

**Time complexity**: O(n) — we look at each account once.

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
Enterprise accounts (let's say 200) -> distributed among 4 Enterprise reps
Mid-Market accounts (let's say 300) -> distributed among 6 Mid-Market reps
```

**Kid analogy**: At school, you don't mix the 5th graders' homework with the 2nd
graders' homework. The Enterprise teacher grades Enterprise papers. The Mid-Market
teacher grades Mid-Market papers. They never cross.

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

### Why sort from biggest to smallest?

**Kid analogy**: Imagine you're putting LEGO blocks into jars so each jar weighs
the same. If you start with the tiny blocks, you'll fill the jars almost equally
with tiny blocks. But then when you get to the HUGE blocks at the end, you have
to dump one whole huge block into one jar, and it becomes way heavier than the
others. You've got no room to fix it.

But if you start with the huge blocks FIRST, you distribute those evenly. Then
the tiny blocks fill in the gaps like sand between rocks. Much better!

**Mathematically**: Handling big items first gives the algorithm the most
flexibility to compensate. Small items at the end can plug any gaps left by
the big ones.

---

### The MinHeap Data Structure

Before we dive into the strategies, let's understand the secret weapon that makes
Strategy 1 super fast: the **MinHeap**.

#### What's the problem?

Every time we place an account, we need to find which rep has the LOWEST total
ARR. If we have 10 reps, we could just look through all 10 each time. That's
fine for 10 reps. But what if we had 1,000 reps? Looking through all 1,000 for
every one of 10,000 accounts = 10 million comparisons. Ouch.

#### Kid analogy: The Magic Shelf

Imagine you have a magic bookshelf that ALWAYS keeps the lightest book on the
top shelf. When you take a book off the top (the lightest), add some weight
to it, and put it back, the shelf magically reorganizes so the new lightest
book floats to the top. You never have to search — you just grab the top one.

That's a MinHeap. Instead of searching through all reps to find the lightest,
we just "pop" the top of the heap. It takes O(log k) time instead of O(k),
where k is the number of reps.

#### How it actually works inside

A MinHeap is a binary tree stored as an array where every parent is smaller
than its children:

```
         $0          <- Root (smallest value, index 0)
        /   \
      $50    $30     <- Children of root (indices 1, 2)
     /  \   /
   $80 $60 $45      <- Grandchildren (indices 3, 4, 5)
```

The rules:
- **Parent of index i** is at `(i - 1) >> 1` (integer division by 2)
- **Left child of index i** is at `2 * i + 1`
- **Right child of index i** is at `2 * i + 2`
- **The root (index 0) is ALWAYS the minimum**

**When we push** (add a rep): Put it at the end, then "sift up" — keep swapping
with its parent until it's in the right spot. Like a bubble rising in water.

**When we pop** (remove the minimum): Take the root, move the last element to
the root, then "sift down" — keep swapping with the smaller child until it
settles. Like a heavy ball sinking.

```typescript
class MinHeap<T> {
  private heap: { key: number; value: T }[] = [];

  push(key: number, value: T) {
    this.heap.push({ key, value });
    this.siftUp(this.heap.length - 1);  // Bubble up to right spot
  }

  pop(): { key: number; value: T } | undefined {
    const top = this.heap[0];           // The minimum!
    const last = this.heap.pop()!;      // Take last element
    if (this.heap.length > 0) {
      this.heap[0] = last;              // Move it to root
      this.siftDown(0);                 // Let it sink to right spot
    }
    return top;
  }

  private siftUp(i: number) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[parent].key <= this.heap[i].key) break;  // Parent is smaller, done!
      // Swap with parent
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
      if (smallest === i) break;  // Already in the right spot!
      [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
      i = smallest;
    }
  }
}
```

#### Why does Strategy 1 use MinHeap but the other strategies don't?

Strategy 1 (Pure ARR Balance) ONLY cares about one thing: "who has the lowest
ARR?" That's exactly what a MinHeap gives you — the minimum — in O(log k) time.

Strategies 2, 3, and 4 can't use a MinHeap because their "cost" depends on the
SPECIFIC account being placed:
- Strategy 2 needs to check if the ACCOUNT is high-risk and if the REP has too
  many risky accounts
- Strategy 3 needs to check if the ACCOUNT is in the SAME STATE as the rep
- Strategy 4 needs all of the above plus workload

Since the "cost" changes depending on which account you're placing, you HAVE to
evaluate every rep fresh each time. That's O(k) per account, giving O(n * k) total.

For our dataset (500 accounts, 10 reps), this is 5,000 operations — still instant.

---

### Strategy 1: Pure ARR Balance

**Goal**: Make every rep's total revenue as equal as possible. Nothing else matters.

**Cost function**:
```
cost(rep) = rep's current total ARR
```

**Kid analogy**: You have a pile of rocks of different sizes. You have 3 buckets.
You want each bucket to weigh the same. You pick up the biggest rock first and put
it in whichever bucket is lightest. Then the next biggest. And so on. That's it.
No other rules. Just weight balance.

**How it works, step by step**:

Say we have 3 reps (all start at $0) and 6 accounts:

```
Accounts (sorted by ARR):  $500K, $400K, $300K, $200K, $150K, $100K

Step 1: $500K -> Who has the least ARR? All are $0. Give to Rep A.
  Rep A: $500K | Rep B: $0 | Rep C: $0

Step 2: $400K -> Who has the least? Rep B and C (tied at $0). Give to Rep B.
  Rep A: $500K | Rep B: $400K | Rep C: $0

Step 3: $300K -> Who has the least? Rep C ($0). Give to Rep C.
  Rep A: $500K | Rep B: $400K | Rep C: $300K

Step 4: $200K -> Who has the least? Rep C ($300K). Give to Rep C.
  Rep A: $500K | Rep B: $400K | Rep C: $500K

Step 5: $150K -> Who has the least? Rep B ($400K). Give to Rep B.
  Rep A: $500K | Rep B: $550K | Rep C: $500K

Step 6: $100K -> Who has the least? Rep A or C (tied at $500K). Give to Rep A.
  Rep A: $600K | Rep B: $550K | Rep C: $500K
```

**Result**: $600K vs $550K vs $500K. Pretty balanced! The gap is only ~$100K
on $550K average.

**How the MinHeap makes this fast**:

```
Start: Heap = [$0(A), $0(B), $0(C)]    <- All reps at $0

Step 1: Pop min = $0(A)                 <- A is cheapest
        A gets $500K account
        Push $500K(A) back
        Heap = [$0(B), $0(C), $500K(A)]

Step 2: Pop min = $0(B)                 <- B is cheapest
        B gets $400K account
        Push $400K(B) back
        Heap = [$0(C), $400K(B), $500K(A)]

Step 3: Pop min = $0(C)                 <- C is cheapest
        C gets $300K account
        Push $300K(C) back
        Heap = [$300K(C), $400K(B), $500K(A)]

Step 4: Pop min = $300K(C)              <- C is cheapest again
        C gets $200K account
        Push $500K(C) back
        Heap = [$400K(B), $500K(A), $500K(C)]

Step 5: Pop min = $400K(B)              <- B is cheapest
        B gets $150K account
        Push $550K(B) back
        Heap = [$500K(A), $500K(C), $550K(B)]

Step 6: Pop min = $500K(A)              <- A is cheapest
        A gets $100K account
        Push $600K(A) back
        Heap = [$500K(C), $550K(B), $600K(A)]
```

Each pop + push = O(log k). For n accounts, total = O(n log k).
With the sort step: O(n log n + n log k).

**The actual code**:
```typescript
function greedyBinPacking(accounts, reps, _config) {
  if (reps.length === 0) return accounts.map(a => ({ ...a, Assigned_Rep: undefined }));

  const sortedAccounts = [...accounts].sort((a, b) => b.ARR - a.ARR);

  // Build min-heap keyed by current ARR
  const heap = new MinHeap();
  for (const r of reps) {
    heap.push(0, { repName: r.Rep_Name, currentARR: 0 });
  }

  return sortedAccounts.map(acc => {
    const min = heap.pop();             // Get rep with lowest ARR
    min.value.currentARR += acc.ARR;    // Add this account's ARR
    heap.push(min.value.currentARR, min.value);  // Put rep back with new total
    return { ...acc, Assigned_Rep: min.value.repName };
  });
}
```

**When to use this**: When your ONLY priority is revenue fairness and you don't
care about risk, geography, or workload.

---

### Strategy 2: ARR + Risk Balance

**Goal**: Keep revenue fair, BUT ALSO make sure risky accounts are spread around.
No one rep should be stuck with all the accounts that might churn.

**What's a "high-risk" account?** Any account with `Risk_Score > 70` (configurable!).
In our dataset, roughly ~30% of accounts are high-risk.

**Cost function**:
```
cost(rep) = rep's current total ARR + risk adjustment
```

#### The Risk Adjustment: How It Actually Works Inside

The risk adjustment works like a system of **traffic signals** for risky accounts:

**Step 1: Calculate the "budget" for adjustments**
```
avgARRPerRep = total ARR of all accounts in this segment / number of reps
riskPenalty  = avgARRPerRep * (riskPenaltyPct / 100)    <- default: 8%
riskBonus    = avgARRPerRep * (riskBonusPct / 100)       <- default: 4%
```

Example with our data: If total Enterprise ARR is $8M across 4 reps:
```
avgARRPerRep = $8M / 4 = $2M
riskPenalty  = $2M * 0.08 = $160K
riskBonus    = $2M * 0.04 = $80K
```

**Step 2: For each account being placed, check three conditions**

The algorithm asks THREE questions about the account AND the rep:

```
Question 1: Is this account high-risk? (Risk_Score > threshold)
  |
  +-- NO  -> No adjustment. Pure ARR decides. Done.
  |
  +-- YES -> Go to Question 2.
      |
      Question 2: Does this rep have any accounts yet? (count > 0)
        |
        +-- NO  -> No adjustment. Can't calculate % of zero. Done.
        |           (This means the FIRST account each rep gets is always
        |            purely based on ARR, no matter how risky.)
        |
        +-- YES -> Go to Question 3.
            |
            Question 3: What's this rep's current high-risk percentage?
              |
              +-- > 40% high-risk:  ADD penalty to cost
              |    "RED LIGHT - This rep already has too many risky accounts.
              |     Making their cost look $160K higher pushes the algorithm
              |     to choose someone else."
              |
              +-- < 20% high-risk:  SUBTRACT bonus from cost
              |    "GREEN LIGHT - This rep can take more risk.
              |     Making their cost look $80K lower attracts the algorithm."
              |
              +-- 20% to 40%:       No adjustment
                   "YELLOW - This rep is in an acceptable range.
                    Let pure ARR balance decide."
```

#### Kid Analogy: The Spicy Candy Rule

You're handing out candies again, but some are jalape??o flavored (high-risk). You
don't want one kid to get ALL the spicy candies — they'd have a stomach ache!

Your rule: Before giving a spicy candy to a kid, check their bag.
- If MORE than 40% of their candies are already spicy -> "Sorry, you have too
  many spicy ones already. Let's try someone else." (penalty)
- If LESS than 20% of their candies are spicy -> "You can handle more spice!
  Here, take this one." (bonus)
- If between 20-40% -> "You're in the okay zone. We'll decide based on total
  weight instead."

And for the very first candy any kid gets — you don't check spiciness at all,
because you can't say "40% of zero candies are spicy." That doesn't make sense.

#### Why the Asymmetry: 8% Penalty vs 4% Bonus

The penalty is TWICE the size of the bonus. This is intentional.

**Think of it like a fire alarm vs. a comfort thermostat**:
- The penalty (8%) is a FIRE ALARM: "DANGER! This rep is overloaded with risk.
  We MUST prevent this from getting worse." Strong signal.
- The bonus (4%) is a THERMOSTAT: "Hey, this rep could take a bit more risk,
  let's nudge things that way." Gentle nudge.

We care MORE about preventing a disaster (one rep with 80% risky accounts and
their entire book churns) than about achieving perfection (every rep at exactly
30% risk). The penalty-heavy approach reflects a **risk-averse philosophy** —
preventing the worst case matters more than optimizing the average case.

#### Deep Walk-Through

```
Accounts: $500K (risk:90), $400K (risk:85), $300K (risk:20), $200K (risk:75)
Reps: Alice ($0, 0 accts), Bob ($0, 0 accts)
avgARRPerRep = $700K  (total $1.4M / 2 reps)
riskPenalty = $56K    (8% of $700K)
riskBonus = $28K      (4% of $700K)

Step 1: $500K (HIGH RISK, score 90)
  Alice: cost = $0 (count=0, skip risk check) = $0
  Bob:   cost = $0 (count=0, skip risk check) = $0
  -> Tie, give to Alice (first in rep list).
  Alice: $500K, 1 acct, 1 high-risk (100% high-risk)

Step 2: $400K (HIGH RISK, score 85)
  Alice: cost = $500K, risk% = 1/1 = 100% > 40% -> PENALTY -> $500K + $56K = $556K
  Bob:   cost = $0 (count=0, skip risk check) = $0
  -> Bob wins at $0 vs $556K.
  Bob: $400K, 1 acct, 1 high-risk (100% high-risk)

Step 3: $300K (LOW RISK, score 20)
  This account is NOT high-risk! No risk adjustment for low-risk accounts.
  Alice: cost = $500K (pure ARR)
  Bob:   cost = $400K (pure ARR)
  -> Bob is lower at $400K, give to Bob.
  Bob: $700K, 2 accts, 1 high-risk (50% high-risk)

Step 4: $200K (HIGH RISK, score 75)
  Alice: cost = $500K, risk% = 1/1 = 100% > 40% -> PENALTY -> $500K + $56K = $556K
  Bob:   cost = $700K, risk% = 1/2 = 50% > 40% -> PENALTY -> $700K + $56K = $756K
  -> Alice is lower at $556K, give to Alice.
  Alice: $700K, 2 accts, 2 high-risk

Result: Alice $700K (2 high-risk), Bob $700K (1 high-risk)
```

Notice: The revenue ended up perfectly balanced AND both reps share the risk.
Without the risk adjustment, Bob would have gotten the $200K high-risk account
too (because his ARR was lower), ending up with $900K and 2 high-risk accounts
while Alice had $500K and 1 high-risk. The risk penalty fixed both problems.

#### The actual code

```typescript
function arrRiskBalance(accounts, reps, config) {
  const sortedAccounts = [...accounts].sort((a, b) => b.ARR - a.ARR);
  const totalARR = accounts.reduce((s, a) => s + a.ARR, 0);
  const avgARRPerRep = totalARR / reps.length;
  const riskPenalty = avgARRPerRep * (config.riskPenaltyPct / 100);
  const riskBonus = avgARRPerRep * (config.riskBonusPct / 100);

  // Track each rep's running state
  const repStats = new Map(reps.map(r => [r.Rep_Name, {
    ...r, totalARR: 0, count: 0, highRiskCount: 0
  }]));

  return sortedAccounts.map(account => {
    let bestRepName = reps[0].Rep_Name;
    let minCost = Infinity;

    for (const rep of reps) {
      const stats = repStats.get(rep.Rep_Name);
      let cost = stats.totalARR;

      // Only adjust for HIGH-RISK accounts, and only if rep has accounts
      const isHighRisk = account.Risk_Score > config.highRiskThreshold;
      if (isHighRisk && stats.count > 0) {
        const currentRiskPct = stats.highRiskCount / stats.count;
        if (currentRiskPct > 0.40) {
          cost += riskPenalty;   // Red light!
        } else if (currentRiskPct < 0.20) {
          cost -= riskBonus;    // Green light!
        }
        // 20%-40% = no adjustment (yellow)
      }

      if (cost < minCost) {
        minCost = cost;
        bestRepName = rep.Rep_Name;
      }
    }

    // Update the winner's stats
    const bestRepStats = repStats.get(bestRepName);
    bestRepStats.totalARR += account.ARR;
    bestRepStats.count++;
    if (account.Risk_Score > config.highRiskThreshold) bestRepStats.highRiskCount++;

    return { ...account, Assigned_Rep: bestRepName };
  });
}
```

**Time complexity**: O(n log n) for sorting + O(n * k) for assignment.
- n log n: Sorting 500 accounts = ~4,500 comparisons
- n * k: 500 accounts * 10 reps = 5,000 cost evaluations
- Total: ~10,000 operations = instant in the browser

**When to use this**: When you have significant churn risk in your portfolio and
want to prevent any single rep from having a "ticking time bomb" book.

---

### Strategy 3: ARR + Geographic Clustering

**Goal**: Keep revenue fair, BUT ALSO try to give reps accounts in their home
state. Less travel = lower costs, deeper local relationships.

**Cost function**:
```
cost(rep) = rep's current total ARR - geography bonus (if same state)
```

#### How The Geography Bonus Works Inside

**Step 1: Calculate the bonus size**
```
avgARRPerRep = total ARR / number of reps in this segment
geoBonus = avgARRPerRep * (geoBonusPct / 100)    <- default: 15%
```

Example: If avgARRPerRep = $2M, then geoBonus = $2M * 0.15 = $300K.

**Step 2: For each account being placed, for each rep**:
```
Is the account in the same state as the rep?
  |
  +-- YES -> SUBTRACT geoBonus from this rep's cost
  |          "This rep looks $300K 'cheaper' because they're local"
  |
  +-- NO  -> No adjustment. Pure ARR decides for this rep.
```

That's it. No thresholds, no percentages, no dead zones. Just one simple
question: same state or not?

#### Kid Analogy: The Name Tag Discount

Each kid has a name tag with their city on it. Each candy has a sticker with
a city on it too. If a candy's sticker matches a kid's name tag, that kid gets
a "discount" — the candy counts as lighter when you're deciding who to give it
to. So kids tend to get the candies from their city, but not always — if one
kid is already way heavier than the others, the discount isn't enough to
overcome the imbalance.

#### Why 15%? The Goldilocks Zone

This is a carefully chosen number. Here's the intuition:

- **Too small (1%)**: Geography barely matters. A $2M rep gets a $20K discount
  for same-state. That's noise — it almost never changes the outcome. You get
  the same result as Pure ARR Balance. Pointless.

- **Too big (50%)**: Geography dominates everything. A $2M rep gets a $1M
  discount. That means a rep with $3M ARR looks cheaper than a rep with $2M if
  the account is in their state. Revenue fairness goes out the window. One rep
  could end up with $20M because all the big accounts are in their state.

- **15% is the sweet spot**: A $2M rep gets a $300K discount. This is
  meaningful — if two reps are within $300K of each other, geography can tip
  the balance. But if they're $500K apart, ARR balance still wins. Geography
  has influence without dominance.

**The math behind why this works**: In a balanced distribution, reps within the
same segment are typically $100K-400K apart in ARR. A 15% bonus ($300K on a
$2M average) falls right in this range — it can influence decisions when reps
are close, but it can't override large imbalances.

#### Deep Walk-Through

```
Reps: Alice (NY), Bob (CA)
Accounts: $500K (NY), $400K (CA), $300K (NY), $200K (TX)
avgARRPerRep = $700K
geoBonus = $105K (15% of $700K)

Step 1: $500K (NY)
  Alice (NY): cost = $0 - $105K = -$105K   <- same state! Looks really cheap!
  Bob (CA):   cost = $0                     <- no match
  -> Alice wins (-$105K < $0). Alice: $500K

Step 2: $400K (CA)
  Alice (NY): cost = $500K                  <- no match for CA
  Bob (CA):   cost = $0 - $105K = -$105K   <- same state!
  -> Bob wins (-$105K < $500K). Bob: $400K

Step 3: $300K (NY)
  Alice (NY): cost = $500K - $105K = $395K  <- same state! Discount!
  Bob (CA):   cost = $400K                  <- no match for NY
  -> Alice wins ($395K < $400K). Alice: $800K

  KEY INSIGHT: Alice has $800K and Bob has $400K. That's a $400K gap!
  But the $105K geo bonus made Alice look like $395K vs Bob's $400K.
  Geography won because the gap ($100K effective difference) was
  smaller than the geo bonus ($105K). If Bob had been at $200K instead
  of $400K, the gap would have been too large and Bob would have gotten
  this NY account despite not being in NY.

Step 4: $200K (TX)
  Alice (NY): cost = $800K                  <- TX ≠ NY, no bonus
  Bob (CA):   cost = $400K                  <- TX ≠ CA, no bonus
  -> Bob wins ($400K < $800K). Bob: $600K

Result: Alice $800K (2 NY accts), Bob $600K (1 CA acct, 1 TX acct)
ARR gap: $200K — slightly less balanced than Pure ARR would give.
Same-state: 3 out of 4 accounts matched (75%)!
```

**The trade-off**: With Pure ARR, the result would have been ~$700K each (perfectly
balanced). With Geography, we got $800K vs $600K — a $200K gap. But we got 75%
same-state matching instead of maybe 25%. That's the trade-off: you give up some
revenue fairness to gain geographic efficiency.

#### The actual code

```typescript
function arrGeographyBalance(accounts, reps, config) {
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
      const stats = repStats.get(rep.Rep_Name);
      let cost = stats.totalARR;

      if (account.Location === rep.Location) {
        cost -= geoBonus;    // Same state! Apply discount!
      }

      if (cost < minCost) {
        minCost = cost;
        bestRepName = rep.Rep_Name;
      }
    }

    const bestRepStats = repStats.get(bestRepName);
    bestRepStats.totalARR += account.ARR;
    bestRepStats.count++;
    if (account.Location === bestRepStats.Location) bestRepStats.sameStateCount++;

    return { ...account, Assigned_Rep: bestRepName };
  });
}
```

**When to use this**: When reps are field-based and travel costs matter, or when
local relationships drive sales outcomes.

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

#### How All Four Factors Work Together

Think of the cost function as a **balance scale with four weights**:

```
                    COST
                     |
        +------+-----+-----+------+
        |      |           |      |
      ARR   Workload    Risk    Geo
     (base)  (+6%)    (+5%/-3%)  (-10%)
      adds   adds     adds/     subtracts
      cost   cost   subtracts     cost
                      cost
```

Each factor either ADDS to the rep's cost (making them less likely to get the
account) or SUBTRACTS from it (making them more likely).

**The adjustments** (all scaled to average ARR per rep):

| Factor | Size | When It Kicks In | Effect |
|--------|------|-----------------|--------|
| Workload penalty | **+6%** of avg book | Rep has more than 110% of the target account count | Makes overloaded reps look more expensive |
| Geography bonus | **-10%** of avg book | Account is in the same state as the rep | Makes local reps look cheaper |
| Risk penalty | **+5%** of avg book | High-risk account AND rep already has >40% high-risk | Discourages further risk piling |
| Risk bonus | **-3%** of avg book | High-risk account AND rep has <20% high-risk | Encourages reps with low risk to take more |

#### The Workload Penalty: Explained Like a Kid

**Kid analogy**: Imagine each kid is supposed to get about 10 candies (that's
the "target"). Once a kid has 11 candies (110% of target), they get a little
sign that says "I'm full!" This makes the teacher less likely to give them
more. The sign doesn't STOP them from getting more, but it makes other kids
more attractive.

**How it works in code**:
```
target = total accounts / number of reps
         (e.g., 300 mid-market accounts / 6 reps = 50 each)

110% of target = 55 accounts

If a rep has > 55 accounts:
  cost += avgARRPerRep * 0.06    (6% of average book)
```

Example: avgARRPerRep = $2M, workloadPenalty = $120K. If Rep A has 56 accounts
and Rep B has 48, Rep A's cost is $120K higher — the algorithm avoids piling
more accounts on A.

#### Why Are the Weights Smaller Than the Individual Strategies?

This is a critical design choice. Compare:

| Factor | In its solo strategy | In Multi-Factor |
|--------|---------------------|-----------------|
| Geography | 15% (Strategy 3) | 10% |
| Risk penalty | 8% (Strategy 2) | 5% |
| Risk bonus | 4% (Strategy 2) | 3% |
| Workload | N/A | 6% |

**Kid analogy**: Imagine four kids all talking at once. If each one shouts at
full volume (15% + 8% + 6% = 29%), you can't hear any of them and the noise
is overwhelming. But if each one talks at a moderate volume (10% + 5% + 6% = 21%),
you can actually hear what each one is saying.

**Technically**: If geography was still 15% AND risk was still 8%, together
they'd push 23% of average book in adjustments. That's so strong it would
overpower ARR balance — the primary objective. By reducing each weight, we
ensure:
1. ARR balance remains the DOMINANT factor
2. Each secondary factor gets a "voice" without "shouting"
3. No single factor can hijack the distribution

**The hierarchy**: ARR balance (100% baseline) >> workload (6%) > geography
(10%) > risk (5%/3%). This means: Revenue fairness first, then workload
fairness, then geography, then risk. If two reps are very far apart in ARR,
none of the secondary factors can override it. Only when reps are close in
ARR do the secondary factors break ties.

#### Deep Walk-Through

```
Reps: Alice (NY, Enterprise), Bob (CA, Enterprise)
Accounts: $500K (NY, risk:90), $400K (CA, risk:20), $300K (NY, risk:80), $200K (TX, risk:10)
avgARRPerRep = $700K
target = 4 accounts / 2 reps = 2 each
110% of target = 2.2 accounts

workloadPenalty = $700K * 0.06 = $42K
geoBonus = $700K * 0.10 = $70K
riskPenalty = $700K * 0.05 = $35K
riskBonus = $700K * 0.03 = $21K

Step 1: $500K (NY, HIGH RISK score:90)
  Alice (NY): cost = $0
    Workload: 0 accts, not > 2.2 -> no penalty
    Geo: NY == NY -> BONUS -> cost = $0 - $70K = -$70K
    Risk: HIGH RISK but count=0 -> skip
    Final: -$70K

  Bob (CA): cost = $0
    Workload: 0 accts, not > 2.2 -> no penalty
    Geo: NY != CA -> no bonus
    Risk: HIGH RISK but count=0 -> skip
    Final: $0

  -> Alice wins (-$70K < $0). Alice: $500K, 1 acct (NY), 1 high-risk

Step 2: $400K (CA, LOW RISK score:20)
  Alice (NY): cost = $500K
    Workload: 1 acct, not > 2.2 -> no penalty
    Geo: CA != NY -> no bonus
    Risk: NOT high-risk -> skip
    Final: $500K

  Bob (CA): cost = $0
    Workload: 0 accts, not > 2.2 -> no penalty
    Geo: CA == CA -> BONUS -> cost = $0 - $70K = -$70K
    Risk: NOT high-risk -> skip
    Final: -$70K

  -> Bob wins (-$70K < $500K). Bob: $400K, 1 acct (CA), 0 high-risk

Step 3: $300K (NY, HIGH RISK score:80)
  Alice (NY): cost = $500K
    Workload: 1 acct, not > 2.2 -> no penalty
    Geo: NY == NY -> BONUS -> cost = $500K - $70K = $430K
    Risk: HIGH RISK, count=1, riskPct = 1/1 = 100% > 40% -> PENALTY
      cost = $430K + $35K = $465K
    Final: $465K

  Bob (CA): cost = $400K
    Workload: 1 acct, not > 2.2 -> no penalty
    Geo: NY != CA -> no bonus
    Risk: HIGH RISK, count=1, riskPct = 0/1 = 0% < 20% -> BONUS
      cost = $400K - $21K = $379K
    Final: $379K

  -> Bob wins ($379K < $465K)!

  WHAT HAPPENED: Even though this is a NY account and Alice is in NY,
  Bob got it because:
  1. Alice already had more ARR ($500K vs $400K) — ARR base higher
  2. Alice had 100% high-risk — got the risk PENALTY (+$35K)
  3. Bob had 0% high-risk — got the risk BONUS (-$21K)
  4. Alice's geo bonus (-$70K) couldn't overcome the $100K ARR gap
     plus the $56K risk difference ($35K penalty + $21K bonus swing)

  Multi-factor saw the bigger picture: "Yes, Alice is local, but she's
  already overloaded with risk and revenue. Bob is healthier."

  Bob: $700K, 2 accts (CA + NY), 1 high-risk (50%)

Step 4: $200K (TX, LOW RISK score:10)
  Alice (NY): cost = $500K
    Workload: 1 acct, not > 2.2 -> no penalty
    Geo: TX != NY -> no bonus
    Risk: NOT high-risk -> skip
    Final: $500K

  Bob (CA): cost = $700K
    Workload: 2 accts, not > 2.2 -> no penalty
    Geo: TX != CA -> no bonus
    Risk: NOT high-risk -> skip
    Final: $700K

  -> Alice wins ($500K < $700K). Alice: $700K, 2 accts

FINAL RESULT:
  Alice: $700K (2 accts, 1 high-risk, 1 in-state)
  Bob:   $700K (2 accts, 1 high-risk, 0 in-state)

  ARR: Perfectly balanced!
  Risk: Evenly split!
  Workload: Equal!
  Geo: 1 of 4 in-state (not great, but risk and ARR balance were prioritized)
```

#### The actual code

```typescript
function smartMultiFactor(accounts, reps, config) {
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
      const stats = repStats.get(rep.Rep_Name);
      let cost = stats.totalARR;              // BASE: ARR balance

      // WORKLOAD: Penalize if overloaded
      if (stats.count > targetCount * 1.1) {
        cost += workloadPenalty;
      }

      // GEOGRAPHY: Reward same-state
      if (account.Location === rep.Location) {
        cost -= geoBonus;
      }

      // RISK: Penalize/reward based on current risk %
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

    const bestRepStats = repStats.get(bestRepName);
    bestRepStats.totalARR += account.ARR;
    bestRepStats.count++;
    if (account.Risk_Score > config.highRiskThreshold) bestRepStats.highRiskCount++;
    if (account.Location === bestRepStats.Location) bestRepStats.sameStateCount++;

    return { ...account, Assigned_Rep: bestRepName };
  });
}
```

**When to use this**: When you want the best overall balance and no single
dimension dominates your priorities.

---

### Swap Refinement: The Post-Greedy Polish

After the greedy pass finishes, there's an optional second step: **Swap Refinement**.
This is like proofreading your essay after writing it — the greedy pass gets you
90-95% of the way there, and swap refinement cleans up the last 5-10%.

#### Why is swap refinement needed?

The greedy algorithm makes locally optimal decisions (best choice for EACH account
one at a time), but it can miss globally optimal solutions. Here's a simple
example:

```
After greedy pass:
  Rep A: $500K, $200K, $50K = $750K
  Rep B: $400K, $300K       = $700K

Gap: $50K. Not bad. But what if we swapped?

  Swap Rep A's $200K with Rep B's $300K:
  Rep A: $500K, $300K, $50K = $850K  ... worse!

  Swap Rep A's $50K with Rep B's $300K:
  Rep A: $500K, $200K, $300K = $1000K ... way worse!

  Swap Rep A's $200K with nothing? Can't — every account must be assigned.

OK, bad example. But what about this:

After greedy pass (more realistic):
  Rep A: $500K, $180K = $680K
  Rep B: $400K, $320K = $720K

Gap: $40K. What if we swap the $180K and $320K?

  Rep A: $500K, $320K = $820K
  Rep B: $400K, $180K = $580K

Gap: $240K. Worse! So we DON'T swap.

But imagine:
  Rep A: $500K, $100K = $600K
  Rep B: $300K, $310K = $610K

Swap $100K and $310K:
  Rep A: $500K, $310K = $810K
  Rep B: $300K, $100K = $400K

Gap: $410K. Much worse. Don't swap.

Swap $100K and $300K:
  Rep A: $500K, $300K = $800K
  Rep B: $310K, $100K = $410K

Gap: $390K. Worse. Don't swap.
```

In practice, the greedy algorithm with LPT sorting already does quite well, and
swaps improve things modestly (3-7% on complex datasets). The real benefit comes
with strategies 2-4 where the cost function is more complex and greedy choices
can leave more room for improvement.

#### How It Works Inside

```
1. Start with the greedy result
2. Calculate the TOTAL COST of the current assignment
   (using a cost function that measures how far we are from perfection)
3. Try EVERY possible pair of accounts from different reps:
   "What if I swap this account from Rep A with that account from Rep B?"
4. For each swap, calculate the new total cost
5. If the new cost is LOWER (even by a tiny amount), KEEP the swap
6. As soon as we find ONE improving swap, restart the whole search
   (because the swap changed the landscape — other swaps may now be better)
7. Repeat until no improving swap exists, or we hit the max iteration limit (10)
```

#### Kid Analogy: Trading Cards

You've dealt out trading cards to 3 kids. Each kid has a stack. Now you walk
around and ask: "Hey Kid A and Kid B, would it help if you traded your worst
card for the other kid's best card? No? OK, what about your second card for
their third card?" You try EVERY possible trade between EVERY pair of kids.
If any trade makes the overall fairness better, you do it. Then you start
over and try ALL trades again (because that trade might have opened up new
good trades). You keep going until no more good trades exist.

#### The Cost Function Used by Swap Refinement

The swap refinement uses a different cost function than the greedy strategies.
While the greedy strategies use a simple "assign to lowest cost rep" approach,
the swap refinement uses a comprehensive **objective function** that measures
the entire assignment's quality:

```
Total Cost = SUM over all reps of:
  (repARR - avgARRPerRep)^2              <- ARR imbalance (always)
  + risk component                       <- if strategy uses risk
  - geography component                  <- if strategy uses geography
  + workload component                   <- if strategy uses workload
```

The **squared deviation** from mean is key — it penalizes large deviations
much more than small ones. A rep who's $200K off is penalized 4x more than
a rep who's $100K off (because ($200K)^2 = 4 * ($100K)^2). This strongly
pushes toward balance.

#### Performance

- **Worst case**: O(maxIterations * k^2 * n) where k = reps, n = accounts
  per rep pair. For 10 reps and 50 accounts per rep: 10 * 45 * 2500 = ~1.1M
  operations per iteration. With 10 iterations: ~11M. Still fast in JS.
- **In practice**: Usually converges in 2-4 iterations.
- **Configurable**: Can be disabled entirely via `enableSwapRefinement: false`
  if you want the raw greedy result.

---

## 5. Step 3 — Metrics

After accounts are assigned, we measure how good the assignment is. Metrics are
computed **separately for Enterprise and Mid-Market** (because comparing across
segments doesn't make sense — Enterprise reps are expected to have different
ARR than Mid-Market reps).

### Metric 1: ARR Spread (Standard Deviation)

**What it measures**: How evenly revenue is split among reps in a segment.

**Kid analogy**: If every kid has exactly the same weight of candy, the "spread"
is zero. If one kid has a ton and another has almost none, the spread is huge.

**How it's calculated step by step**:
1. Get each rep's total ARR: [$3.2M, $3.1M, $3.4M, $3.0M]
2. Find the average: ($3.2 + $3.1 + $3.4 + $3.0) / 4 = $3.175M
3. Find how far each rep is from the average:
   - Rep 1: $3.2M - $3.175M = +$25K
   - Rep 2: $3.1M - $3.175M = -$75K
   - Rep 3: $3.4M - $3.175M = +$225K
   - Rep 4: $3.0M - $3.175M = -$175K
4. Square those differences (to make all positive and punish big gaps more):
   - $25K^2 = $625M
   - (-$75K)^2 = $5,625M
   - $225K^2 = $50,625M
   - (-$175K)^2 = $30,625M
5. Average the squares: ($625 + $5,625 + $50,625 + $30,625) / 4 = $21,875M
6. Take the square root: sqrt($21,875M) = **~$148K**

**What the number means**:
- `$0` = perfect balance (every rep has exactly the same ARR)
- Lower is better
- If the std dev is $148K on a $3.175M average, that's about 4.7% variation — very good!

**Why we show the average alongside it**: "$148K std dev" means nothing without
context. On a $3M average book, that's amazing. On a $200K average book, that's terrible.

```typescript
function stdDev(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((sq, v) => sq + Math.pow(v - mean, 2), 0) / values.length);
}
```

### Metric 2: Workload Balance (Range)

**What it measures**: The gap between the most-loaded and least-loaded rep.

**Kid analogy**: If one kid got 60 candies and another got 40, the range is 20.
If everyone got 50, the range is 0.

**How it's calculated**:
```
Range = max(accounts per rep) - min(accounts per rep)
```

Example: Reps have [52, 48, 50, 51, 49, 50] accounts.
Range = 52 - 48 = **4**

**What the number means**:
- `0` = every rep has the exact same number of accounts
- Lower is better
- We also show the actual min-max range (e.g., "48-52 accts/rep") for context

### Metric 3: Same-State % (Geographic Match)

**What it measures**: What percentage of accounts are assigned to a rep in the
same state?

**Kid analogy**: What percentage of candies had a sticker matching the kid they
went to?

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
- The Geography strategy typically achieves 25-35%

### Metric 4: Risk Balance (Standard Deviation of High-Risk %)

**What it measures**: How evenly high-risk accounts are spread across reps.

**Kid analogy**: If every kid has about the same percentage of spicy candies in
their bag, the risk balance is good (low number). If one kid has 80% spicy and
another has 5% spicy, the balance is terrible (high number).

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
- Std dev across all 10 reps mixes apples and oranges -> produces a scary big
  number like "$4M std dev" that doesn't mean anything useful

**Kid analogy**: You wouldn't average the height of 5th graders and kindergartners
together and say "wow, there's a huge height spread in this school!" Of course
there is — they're different age groups! You should measure the spread WITHIN
5th graders and WITHIN kindergartners separately.

Now we compute Enterprise metrics only compared to other Enterprise reps, and
Mid-Market only compared to other Mid-Market reps. The numbers are smaller,
meaningful, and actually tell you if the strategy is working.

---

## 6. Configurable Weights — The Tunable Knobs

Every weight and threshold in the system is now configurable via the
**Advanced Settings** panel. Here's what each one does and why:

### The Configuration Object

```typescript
interface StrategyConfig {
  highRiskThreshold: number;       // Default: 70  (Risk_Score > this = "high risk")
  riskPenaltyPct: number;          // Default: 8   (Strategy 2: penalty %)
  riskBonusPct: number;            // Default: 4   (Strategy 2: bonus %)
  geoBonusPct: number;             // Default: 15  (Strategy 3: same-state bonus %)
  workloadPenaltyPct: number;      // Default: 6   (Strategy 4: overload penalty %)
  multiGeoBonusPct: number;        // Default: 10  (Strategy 4: same-state bonus %)
  multiRiskPenaltyPct: number;     // Default: 5   (Strategy 4: risk penalty %)
  multiRiskBonusPct: number;       // Default: 3   (Strategy 4: risk bonus %)
  enableSwapRefinement: boolean;   // Default: true (run post-greedy optimization?)
  maxSwapIterations: number;       // Default: 10  (how many passes max?)
}
```

### Why Everything is a Percentage (Not a Dollar Amount)

The original implementation used fixed dollar amounts (like a $150K penalty).
That works for ONE dataset, but breaks for others:

**Example of the problem**:
- Dataset A: Average ARR per rep = $2M. A $150K penalty = 7.5% of book. Meaningful.
- Dataset B: Average ARR per rep = $50K. A $150K penalty = 300% of book. INSANE.
  The penalty is 3x the average book — risk would completely dominate everything.

By using percentages of `avgARRPerRep`, the same 8% penalty automatically becomes:
- Dataset A: $2M * 8% = $160K. Proportional and meaningful.
- Dataset B: $50K * 8% = $4K. Proportional and meaningful.

**Kid analogy**: You don't give a kindergartner the same-sized backpack as a 5th
grader. You give them backpacks PROPORTIONAL to their size. Same idea here.

### The High-Risk Threshold Slider

**Range**: 50 to 90 (default: 70)

This changes what counts as a "high-risk" account:
- **50** = more accounts flagged as high-risk (Risk_Score > 50 captures ~50% of accounts)
- **70** = moderate (captures ~30% of accounts) — the default
- **90** = very few accounts flagged (captures ~10% of accounts)

**When to change it**: If your dataset has a different risk distribution, or if
your business defines "high risk" differently.

### Swap Refinement Toggle

When enabled (default), the algorithm runs a second pass after the greedy
assignment, trying pairwise swaps to improve the overall objective. When
disabled, you get the raw greedy result — useful for understanding what the
greedy algorithm alone produces vs. what the refinement improves.

---

## 7. The Full Pipeline End-to-End

Here's exactly what happens when a user moves the slider or changes the strategy:

```
User moves slider to 145,000 and selects "Smart Multi-Factor"
           |
           v
segmentAccounts(500 accounts, 145000)
           |
           v
Each account gets Segment based on Num_Employees >= 145000
  -> ~180 Enterprise accounts, ~320 Mid-Market accounts
           |
           v
distributeAccounts(segmented accounts, 10 reps, "Smart Multi-Factor", config)
           |
           v
  +-- Enterprise pool: 180 accounts -> 4 Enterprise reps
  |    1. Sort 180 accounts by ARR descending
  |    2. Calculate avgARRPerRep, targetCount, penalties, bonuses
  |    3. For each account (biggest first):
  |       a. Calculate cost for each of 4 reps (ARR + workload + risk - geo)
  |       b. Assign to lowest-cost rep
  |       c. Update that rep's running totals (ARR, count, risk, geo)
  |    4. If swap refinement enabled:
  |       a. Calculate total objective cost
  |       b. Try all pairwise swaps
  |       c. Keep improving swaps, repeat until converged
  |
  +-- Mid-Market pool: 320 accounts -> 6 Mid-Market reps
       (Same process, completely independent)
           |
           v
calculateRepStats(500 assigned accounts, 10 reps, highRiskThreshold)
           |
           v
For each rep, count up:
  - Total ARR
  - Number of accounts
  - Number of high-risk accounts (Risk_Score > threshold)
  - Number of same-state accounts
           |
           v
computeSegmentMetrics(Enterprise reps) -> ARR spread, workload, geo%, risk
computeSegmentMetrics(Mid-Market reps)  -> ARR spread, workload, geo%, risk
           |
           v
UI updates: chart re-renders, metrics table re-renders, rep cards update
```

The entire pipeline is **pure functions** — same input always produces the same
output. No randomness, no side effects, no database calls. Everything runs
in the browser in milliseconds.

**React integration**: The pipeline runs inside `useMemo()` — React's way of
saying "only recalculate this when the inputs change." When the user moves the
slider, React detects that `threshold` changed, reruns the pipeline, and
updates the DOM. When nothing changes, the cached result is reused. Zero waste.

---

## 8. Why Each Design Decision Was Made

### "Why greedy bin packing and not something more optimal?"

An optimal solution (trying every possible assignment) would take longer than
the age of the universe for 500 accounts and 10 reps. There are 10^500 possible
combinations. Greedy bin packing runs in milliseconds and gets within ~33% of
optimal. In practice, it's usually much closer than that.

### "Why sort by ARR descending specifically?"

If you sort ascending (smallest first), the small accounts get distributed
evenly, but then the big accounts at the end cause huge imbalances because
there's no room to compensate. Descending order handles the hard cases first
and lets the easy cases fill gaps. (See the LEGO analogy in Section 4.)

### "Why scale adjustments to average ARR per rep?"

The original implementation used fixed dollar amounts (like a $150K penalty).
That works for one dataset, but if someone uploads a dataset where accounts
average $10K ARR, a $150K penalty would completely dominate. By using
percentages of average book size, the adjustments automatically adapt to any
dataset. (See the backpack analogy in Section 6.)

### "Why is there a 'dead zone' in the risk adjustment (20-40%)?"

The dead zone prevents the algorithm from constantly flip-flopping. Without it:
- Rep at 30% risk gets a bonus -> takes more risk
- Rep at 31% risk, no longer < 20%, gets a penalty -> avoids risk
- Rep drops to 29%, gets bonus again -> flip-flop!

The dead zone (20-40%) creates a stable "comfortable range" where no
adjustment happens. Only when a rep is clearly overloaded (>40%) or clearly
underloaded (<20%) do we intervene. This makes the algorithm stable and
predictable.

### "Why run Enterprise and Mid-Market separately?"

If you ran them together, an Enterprise rep could end up with Mid-Market
accounts (or vice versa). That defeats the purpose of segmentation. Each segment
is a completely independent optimization problem. (See the homework grading
analogy in Section 4.)

### "Why use population standard deviation instead of sample standard deviation?"

We're measuring the entire population (all reps in a segment), not a sample from
a larger group. Population std dev (dividing by N) is the mathematically correct
choice here. Sample std dev (dividing by N-1) would slightly overstate the
variation.

### "Why does the MinHeap use a key separate from the value?"

The heap needs to sort by a number (ARR) but also carry additional data (rep
name, running stats). Separating the key (the number we sort by) from the value
(the data we need) keeps the heap generic and reusable. The key drives the
ordering; the value is just along for the ride.

### "Why does swap refinement restart from scratch after each improving swap?"

Because a swap changes the assignment landscape. After swapping accounts
between Rep A and Rep B, the costs for ALL reps change (because the objective
function is global — it depends on how balanced EVERYONE is). A swap that
wasn't beneficial before the change might become beneficial after. Restarting
ensures we don't miss opportunities created by previous swaps.

---

## 9. Common Interview Questions & Answers

### Q: "Walk me through how the algorithm assigns a single account."

**A**: "I'll use Strategy 4 (Smart Multi-Factor) as an example. Say we're assigning
a $300K account in California with a Risk Score of 85. We have 4 Enterprise reps.
The avgARRPerRep is $2M.

For each rep, we compute a cost:
1. **Start with their current ARR** (base cost)
2. **Check workload**: If they have more than 110% of the target count, add 6% of
   $2M = $120K penalty
3. **Check geography**: If they're in California, subtract 10% of $2M = $200K bonus
4. **Check risk**: Account is high-risk (85 > 70). If the rep has >40% high-risk,
   add 5% = $100K penalty. If <20%, subtract 3% = $60K bonus. If 20-40%, nothing.

The rep with the lowest total cost gets the account. Then we update their running
stats and move to the next account."

### Q: "Why does ARR + Geographic Clustering sometimes beat ARR + Risk Balance on the risk metric?"

**A**: "This is counterintuitive but makes sense. The Risk Balance strategy only
adjusts costs when specific conditions are met: the account must be high-risk AND
the rep must be above 40% or below 20%. There's a 'dead zone' from 20-40% where
no adjustment happens. Plus, the very first account assigned to each rep gets no
risk adjustment at all (can't compute a percentage of zero accounts).

Geographic Clustering, meanwhile, shuffles the assignment order based on state
matching. Since risk scores aren't correlated with geography in our dataset,
this shuffling incidentally distributes risk more evenly than the
targeted-but-conservative risk strategy. It's like how shuffling a deck of
cards distributes suits more evenly than a targeted sort with strict rules."

### Q: "What's the time complexity?"

**A**: "For n accounts and k reps:
- **Strategy 1**: O(n log n) for sorting + O(n log k) for MinHeap assignment.
  With 500 accounts and 10 reps, that's about 5,000 operations. Under 1ms.
- **Strategies 2-4**: O(n log n) for sorting + O(n * k) for assignment.
  500 * 10 = 5,000 evaluations. Under 1ms.
- **Swap refinement**: O(iterations * k^2 * accountsPerPair). In practice,
  2-4 iterations for convergence. ~5-10ms total.
- **Full pipeline**: Dominated by sort + swap refinement. Entire thing runs
  in under 20ms on any modern browser."

### Q: "What would you improve if you had more time?"

**A**: Good things to mention:
1. **Add a "constraint" mode** where certain accounts must stay with certain reps
   (locked assignments that the algorithm can't change)
2. **Add a comparison view** showing two strategies side-by-side with metric diffs
3. **Add historical analysis** — show how territories would have performed
   over the past year based on actual churn data
4. **Simulated annealing** instead of simple swap refinement — it can escape
   local optima by sometimes accepting worse swaps
5. **Add an "undo" feature** to manually override specific assignments and see
   how it affects metrics
6. **Multi-objective Pareto frontier** — show the user the trade-off curve
   between ARR balance and geography match, letting them pick their preferred
   point on the curve

### Q: "How do you validate that the algorithm works correctly?"

**A**: "We have 72+ unit tests covering:
- **Segmentation**: threshold boundaries, empty input, exact boundary values
  (the >= edge case)
- **All 4 strategies**: every account gets assigned, total ARR is preserved
  (no money lost or created), segment isolation is maintained (no cross-segment
  assignments)
- **Equity invariants**: the max/min ARR ratio stays under 2x for any strategy
  (this is the proven bound for the LPT algorithm extended to our use case)
- **Edge cases**: zero-ARR accounts, single rep, all accounts in one segment,
  extremely skewed data, zero reps in a segment
- **Configuration**: custom weights, swap refinement on/off, different risk
  thresholds

Run them with `npm test` — all 72+ pass."

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
  zero accounts in a segment is a no-op, single rep gets everything
- All weights are configurable via the UI, so users can tune for their specific
  data distribution"

### Q: "Explain the swap refinement. When would it help vs. not help?"

**A**: "Swap refinement is a local search optimization that runs after the greedy
pass. It tries every possible pairwise swap of accounts between reps. If swapping
two accounts reduces the total objective cost (measured by squared deviation from
mean ARR plus strategy-specific factors), the swap is kept.

**When it helps most**: Complex strategies (Multi-Factor) where the greedy algorithm
has to balance 4 competing objectives. The greedy approach makes locally optimal
decisions but can miss globally better arrangements. Swap refinement can find these.

**When it helps least**: Pure ARR Balance with evenly distributed ARR values. The
LPT heuristic already produces near-optimal results for simple bin packing.

In our dataset, swap refinement typically improves the objective by 3-7%."

### Q: "Why didn't you use a genetic algorithm or simulated annealing?"

**A**: "Three reasons:
1. **Speed**: This runs in the browser on every slider change. Greedy + swap
   refinement takes <20ms. Genetic algorithms take seconds. Users expect
   instant feedback.
2. **Determinism**: Same input always produces the same output. Genetic algorithms
   and simulated annealing are stochastic — different runs give different results.
   That's confusing in a UI tool.
3. **Good enough**: For 500 accounts and 10 reps, greedy + local search gets
   within a few percent of optimal. The gap doesn't justify the added complexity."

---

## 10. Interview Presentation Script

### How to Present This Project to the Profound GTM Engineer

Below is a structured script you can use to walk the interviewer through the
Territory Slicer. It's designed to be ~8-10 minutes, hitting the technical depth
they'll want to see while showing business understanding.

---

#### Opening (30 seconds)

> "The challenge was to build a territory allocation tool that solves one of the
> hardest operational problems in sales: how do you divide accounts among reps
> fairly? Fair doesn't just mean equal revenue — it means balanced risk, reasonable
> workload, and geographic efficiency. I built Territory Slicer, which lets a sales
> leader interactively explore different allocation strategies and instantly see the
> trade-offs."

---

#### Demo Flow (3-4 minutes)

**Show the tool running. Walk through this sequence:**

> "Let me show you how it works. There are two main controls: a segmentation
> threshold and a distribution strategy.
>
> The **threshold slider** controls how we split accounts into Enterprise and
> Mid-Market. It's based on employee count — think of it as the line between
> 'big company, needs an Enterprise rep' and 'smaller company, better served by
> Mid-Market.' I can move this and instantly see how the account split changes."

*Move the slider. Point out the Enterprise/Mid-Market count changing.*

> "Once accounts are segmented, the **distribution strategy** decides how they're
> assigned to reps. I built four strategies, each optimizing for different
> priorities:
>
> **Pure ARR Balance** — focuses purely on revenue fairness. Every rep gets as
> close to the same total ARR as possible. I used a greedy bin-packing algorithm
> with a MinHeap for O(n log k) performance.
>
> **ARR + Risk Balance** — same ARR optimization, but adds a penalty/bonus
> system that prevents any single rep from accumulating too many high-risk
> accounts. The penalty is asymmetric — 8% for overload vs 4% for underload —
> because preventing disasters matters more than achieving perfect distribution.
>
> **ARR + Geographic Clustering** — adds a 15% same-state bonus to the cost
> function, so reps tend to get accounts in their home state. There's a deliberate
> trade-off: you lose some ARR balance to gain geographic efficiency.
>
> **Smart Multi-Factor** — combines all four dimensions: ARR, workload,
> geography, and risk. The weights are tuned smaller than the individual strategies
> because they need to coexist without any single factor dominating."

*Switch between strategies. Point out how the metrics change.*

> "After the greedy pass, I run an optional **swap refinement** step — a local
> search that tries pairwise swaps between reps to squeeze out another 3-7%
> improvement. You can toggle it on and off in Advanced Settings."

---

#### Technical Depth (2-3 minutes)

> "Let me highlight a few engineering decisions I'm proud of.
>
> **First, scaling**: Every cost adjustment is a percentage of average ARR per rep,
> not a fixed dollar amount. This means if someone uploads a dataset with $10K
> average accounts or $10M average accounts, the algorithm self-calibrates. The
> 8% risk penalty is always proportional to the data.
>
> **Second, segment isolation**: Enterprise and Mid-Market distributions are
> completely independent pipelines. Metrics are computed per-segment too — earlier
> I realized that mixing them produces meaningless numbers because Enterprise reps
> naturally carry higher ARR. Fixing this was critical for the metrics to actually
> mean something.
>
> **Third, the MinHeap**: For Pure ARR Balance, I implemented a custom MinHeap
> data structure instead of re-sorting the rep array on every assignment. This
> takes assignment from O(n * k log k) to O(n log k). For our 500-account dataset
> the difference is marginal, but it's the right engineering choice and would matter
> at scale.
>
> **Fourth, configurability**: All weights, thresholds, and toggles are exposed in
> the UI with sensible defaults. A sales operations person can tune the algorithm
> without touching code. The high-risk threshold alone — sliding from 50 to 90 —
> dramatically changes which accounts the risk system cares about.
>
> **Fifth, testing**: I wrote 72+ unit tests covering every strategy, every edge
> case (zero reps, single rep, all one segment, zero-ARR accounts), and equity
> invariants (max/min ratio under 2x, total ARR preserved, no orphaned accounts)."

---

#### Business Understanding (1-2 minutes)

> "The reason I chose this approach is that territory planning is fundamentally a
> multi-objective optimization problem with no single right answer. Different sales
> leaders have different priorities — some care most about fairness, others about
> geographic efficiency for field teams, others about managing churn risk.
>
> Rather than picking one 'best' algorithm, I built a tool that lets the leader
> explore the trade-off space themselves. The four strategies represent four
> philosophies, and the configurable weights let them fine-tune within each
> philosophy. The metrics dashboard gives them objective feedback on every
> dimension so they can make an informed decision.
>
> This is the kind of tool that a sales ops team would actually use during
> quarterly territory planning — not just a one-time analysis, but an interactive
> decision support system."

---

#### Closing — Future Improvements (30 seconds)

> "If I had more time, the top three things I'd add are:
> 1. **Locked assignments** — the ability to pin certain accounts to specific reps
>    (important for key accounts with deep relationships)
> 2. **Strategy comparison view** — side-by-side metrics for two strategies so you
>    can quantify the exact trade-off
> 3. **Historical validation** — overlay actual churn data to see which strategy
>    would have performed best over the past year
>
> I'm excited about this problem space. Territory planning sits at the intersection
> of algorithms, data, and business strategy — which is exactly where GTM engineering
> lives."

---

#### Handling Follow-Up Questions

**If they ask "What was the hardest part?"**

> "Getting the cost function weights right. It's easy to build a system where one
> factor dominates everything else. I went through several iterations where risk
> penalties were too strong (every account went to the lowest-risk rep regardless
> of ARR) or geography bonuses were too weak (same result as Pure ARR). The
> current weights came from testing against the actual dataset and verifying that
> each factor has meaningful but not overwhelming influence."

**If they ask "How would this scale to 10,000 accounts?"**

> "The greedy algorithms are O(n log n) or O(n * k). For 10,000 accounts and
> 50 reps, that's about 500K operations — still instant. The swap refinement is
> the bottleneck at O(iterations * k^2), but with 50 reps that's about
> 10 * 2500 = 25K iterations, each touching a subset of accounts. Maybe 100ms
> total. For truly massive datasets (100K+ accounts), I'd consider replacing
> swap refinement with a more efficient local search like Kernighan-Lin, or
> running it as a background web worker so the UI stays responsive."

**If they ask "Why not just use a linear programming solver?"**

> "LP solvers can find globally optimal solutions, but they have practical
> downsides for this use case:
> 1. They require a linear objective function — our cost function with thresholds
>    (40% risk, 110% workload) isn't naturally linear
> 2. They add a heavy dependency (like GLPK.js) for a problem our heuristic
>    already solves well
> 3. Users need instant feedback on slider changes — LP solvers for this problem
>    size might take 100-500ms, which feels sluggish
> 4. The greedy + swap approach is transparent and explainable. A sales leader
>    can understand 'biggest account goes to lightest rep.' An LP solution is a
>    black box."

**If they ask about the tech stack:**

> "React 19 with TypeScript, Vite for the build, TailwindCSS + shadcn/ui for
> styling, Recharts for visualization, PapaParse for CSV parsing, and Vitest
> for testing. Express on the backend just serves static files. All algorithm
> logic runs client-side — pure functions, no API calls, no database. The entire
> pipeline is inside a `useMemo` hook so it only recalculates when inputs change."

---

## Quick Reference: The Four Strategies at a Glance

| Strategy | What It Optimizes | Cost Function | Data Structure | Time Complexity | Best When |
|----------|------------------|---------------|----------------|-----------------|-----------|
| **Pure ARR** | Revenue fairness only | `ARR` | MinHeap | O(n log n + n log k) | You just want equal revenue targets |
| **ARR + Risk** | Revenue + risk spreading | `ARR + risk nudge` | Map (linear scan) | O(n log n + n * k) | You have significant churn risk |
| **ARR + Geo** | Revenue + travel reduction | `ARR - state bonus` | Map (linear scan) | O(n log n + n * k) | Reps are field-based and travel matters |
| **Smart Multi** | Everything at once | `ARR + workload + risk - geo` | Map (linear scan) | O(n log n + n * k) | You want the best overall balance |

---

## Quick Reference: The Four Metrics at a Glance

| Metric | What It Tells You | How It's Calculated | Good vs Bad |
|--------|------------------|--------------------|----|
| **ARR Spread** | Is revenue split evenly? | Std dev of each rep's total ARR | Lower = more even |
| **Workload Balance** | Do reps have similar # of accounts? | Max accounts - Min accounts | Lower = more even |
| **Same-State %** | Are reps getting local accounts? | % of accounts in rep's state | Higher = more local |
| **Risk Balance** | Is churn risk shared? | Std dev of each rep's high-risk % | Lower = more shared |

---

## Quick Reference: The Configurable Weights

| Weight | Default | Which Strategy | Effect |
|--------|---------|---------------|--------|
| High-Risk Threshold | 70 | All (risk-aware) | Risk_Score above this = "high risk" |
| Risk Penalty | 8% | Strategy 2 | Penalty for >40% high-risk reps |
| Risk Bonus | 4% | Strategy 2 | Bonus for <20% high-risk reps |
| Geo Bonus | 15% | Strategy 3 | Same-state assignment bonus |
| Workload Penalty | 6% | Strategy 4 | Penalty for >110% of target count |
| Multi Geo Bonus | 10% | Strategy 4 | Same-state bonus (smaller, shares stage) |
| Multi Risk Penalty | 5% | Strategy 4 | Risk penalty (smaller, shares stage) |
| Multi Risk Bonus | 3% | Strategy 4 | Risk bonus (smaller, shares stage) |
| Swap Refinement | On | All | Post-greedy local search optimization |
| Max Swap Iterations | 10 | All | Convergence limit for swap refinement |

---

*You've got this. Go crush the interview.*
