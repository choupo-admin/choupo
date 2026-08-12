# Which result blocks a golden row can read

> **STATUS: FINDING + RULE, executed 2026-08-12.**  Three slices in one
> session, one root cause.  Level 3 (deep reference under the verification
> architecture); the governing document is
> [`../architecture/verification-and-validation.md`](../architecture/verification-and-validation.md).

---

## 1. The root cause

`bin/runTests` compares a case's run against a golden `expected` file, row by
row.  Each row names a **kind**, which says *where in the result JSON the
number is read from*.  For most of this project's life there were three:
`kpi`, `stream`, `diag`.

The result JSON, meanwhile, kept growing.  Every slice that shipped a new
result surface added a top-level block — and **a block the golden format
cannot read arrives unpinned, silently, with no failure anywhere**.  Nothing
announces it.  The suite goes on reporting green over a number nothing checks.

Three were found on the same day, by asking the question directly rather than
waiting for a symptom:

| block | what it carries | how long unpinned | how it was found |
|---|---|---|---|
| `validation` | the AAD of each model against a MEASURED dataset — the headline result of every `compare_*` case | since the overlay shipped | a header claiming UNIFAC "AAD ~2.6 K" against its own output's 0.407 K |
| `energyClosures` | the model-boundary ledger's three quantities (raw / step / remaining) | since 2026-08-09 | asked which blocks were readable |
| `utilityAllocation` | which catalogue utility `pickForDuty` chose, its kg/s and its €/h, on 77 cases | since the allocator shipped | same question, continued |

Only the first announced itself, and it did so through a false sentence in a
case header rather than through any machinery.  **That is the shape to
remember: an unreadable block does not fail, it just stops being checked.**

## 2. The rule

**When you add a top-level result block that carries a number a reader would
act on, add the row kind that reads it in the same commit.**

This is the Edwards lesson one layer up: *when you add a record home a model
reads, add it to the importer's closure in the same commit* — same structure,
same failure mode (something works, and its coverage silently does not follow),
same remedy.

The kinds today, each naming WHERE and nothing else:

| kind | reads | `name` | `key` |
|---|---|---|---|
| `kpi` | `kpis` of a unit | unit | KPI |
| `stream` | a named stream | stream | field |
| `diag` | `operationResults[].diagnostics` | op | field |
| `aad` | `validation[]` | dataset | `<model>.<property>.<statistic>` |
| `closure` | `energyClosures[]` | unit | field |
| `utility` | `utilityAllocation[]` | unit | `<tier>.<utility>.<field>` |

The `claim` column (`anchor`) stays orthogonal: the kind says where the number
is read from, the claim says what the row asserts about it.  One column per
axis — folding them cost this project a rewrite once already.

## 3. A word cannot be a golden value, and two ways round it

A golden row compares numbers, so the *decisions* these blocks record —
which utility, which closure status — are not directly comparable.  Two
techniques were used, and the difference matters:

* **Put the word in the KEY** (`utility`).  A row keyed
  `heating.steamLP.eur_h` matches only while steamLP is the allocation.  A
  changed pick makes the row MISSING, which fails and names what changed.
  This pins the decision itself.
* **Rely on the numeric consequences** (`closure`).  A status falling from
  `accounted` to `unconfirmed` zeroes `step_kW` and pushes `remaining_kW` up
  to the raw, both pinned.  This pins the decision *indirectly*, and the gate
  says so rather than implying coverage it lacks.

The first is stronger and should be preferred where the word is a stable
identifier.  The second is what remains when the word is free text.

## 4. What is deliberately NOT pinned, having been audited

Not every block belongs in a golden, and the ones left out are left out for
stated reasons rather than by omission:

* `convergence` — the per-unit residual HISTORY.  Volatile by construction,
  for the same reason `auto_generate` has always skipped `iterations`: it
  records the path, not the answer.
* `txy`, `profiles` — curves, tens of points each.  The KPIs summarise them,
  and the gates that care about a specific point read the CSV artefact
  (`column13` reads its declared T back from the column's own `profile.csv`).
* `componentCoverage` — booleans, a readiness surface with its own gate.
* `modelBoundaries`, `problemDivergence`, `advisories` — words.  Each has its
  own gate asserting the words are present and correct;
  `check_problem_divergence` and `check_caveat_surface` are the two that
  matter most.
* `seal`, `components`, `componentMolarMass` — inputs echoed back, guarded by
  the seal machinery and the catalogue audit.

## 5. The gates

Each of the three fixed blocks got a gate requiring **published ⇒ pinned AND
pinned ⇒ published**, because one direction alone is not enough: the first
stops a number drifting unwatched, the second stops a row that matches nothing
from reading as coverage.

`check_overlay_aad_pinned` · `check_closure_ledger_pinned` ·
`check_utility_allocation_pinned`.  All three sabotage-verified; the third
FAILED its own first run because it derived its keys by a rule of its own
instead of the writer's — *a gate that computes its keys differently from the
generator measures the difference between the two*, which is the arity sin
inside the machinery built to enforce it.  The fix was one shared rule, not a
wider gate.

**There is no gate on the RULE in §2**, and that is deliberate.  A check that
"every top-level result block has a kind" would have to decide which blocks
*should* be pinnable, and §4 is exactly the judgement it cannot make — a curve
and a decision look identical to a script.  What §2 has instead is this
document and three worked examples.
