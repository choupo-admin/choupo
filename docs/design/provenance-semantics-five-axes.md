# What a number IS: five axes, one responsibility each

**Status: RATIFIED 2026-08-12 (Vítor + the architect, over four exchanges).
CONTRACT ONLY — no implementation authorised by this record.  It exists because
the component-bootstrap slice would otherwise mint a new status word per
generated `.dat`, and a vocabulary that drifts cannot be audited.**

---

## 1. Why this had to be settled first

Choupo is about to start GENERATING components: a molecule that is
structurally known but not curated becomes a working `.dat` through a
predictive ladder (groups → Joback → Lee-Kesler → Rowlinson-Bondi →
Ambrose-Walton → UNIFAC for mixtures).

That is the right feature.  It is also the fastest way to destroy the one thing
the project has that breadth-first tools do not: **you can always tell what a
number is.**  Every generated record carries a dozen marked values; get the
marks wrong once and the error is multiplied by every component ever
bootstrapped.

So the semantics is settled BEFORE the first generated file, not after.

---

## 2. What was actually wrong — measured, not assumed

Two separate muddles, both found by counting rather than by reading.

### 2.1 `derived` was never an origin

The tree carried four `origin=` values.  Three of them answer *"how was this
number produced?"*.  One does not:

| mark | occurrences | answers |
|---|---|---|
| `origin=predictive` | 170 371 | how |
| `origin=calculated` | 28 447 | how |
| `origin=measured` | 7 | how |
| **`origin=derived`** | **28 152** | **only that it HAS PARENTS** |

`derived` says nothing about the local operation.  It says the value came from
other values — which is a statement about **dependency**, not about origin, and
it belongs on its own axis.

The proof is one pair of lines from a single record:

```
Tc      722.74;   [origin=predictive method=joback]
omega   0.7887;   [origin=predictive method=lee-kesler]
```

Lee-Kesler ω is computed from Tb, Tc and Pc.  Here all three are Joback
predictions with AAD 10–11 %, so this ω inherits their error.  **The same
method applied to MEASURED Tb/Tc/Pc would be a far better number and would
carry the identical mark.**  Two values of very different trustworthiness,
indistinguishable in the record.

### 2.2 `provenance` as a scalar was doing three jobs

| scalar value | occurrences | what it actually is |
|---|---|---|
| `synthetic` | 6 | provenance (correct) |
| `measured` | 5 | an **origin** |
| `fittedToCase` | 3 | an **origin** + a scope |
| `derivedDiluteVolume` | 3 | an **origin + a method**, fused into one token |
| `derived` | 2 | an origin |
| `asserted` | 2 | an origin |
| `undeclared` | 1 | a null |

Six of twenty-two uses answer the question the axis is named for.

**And the remedy already existed in the tree.**  The BLOCK form of the same key
already separates the axes correctly, and at scale:

```
provenance
{
    origin        ...   (45 uses)
    method        ...   (45 uses)
    methodVersion ...   (40 uses)
}
```

This record therefore **generalises the block form and retires the scalar
shorthand**.  Nothing here is invented.

---

## 3. The five axes

| axis | question it answers | must never carry |
|---|---|---|
| `origin` | what KIND of operation produced this number locally | a method name, a data source, a maturity |
| `method` (+ `methodVersion`) | WHICH operation, and which revision of it | anything about the inputs |
| `from` | which other computational objects it depends on | where data came from |
| `provenance` | where the DATA or EVIDENCE came from (source, DOI, dataset, licence) | how the number was produced |
| `reviewStatus` / `validation` | what MATURITY it has | how it was produced |

One responsibility each.  A value that wants to say two things says them on two
axes.

### 3.1 `origin` — exactly four words

* **`measured`** — an experimental determination.
* **`fitted`** — regressed against data.  The data's identity lives in
  `provenance`, never inside this word (which is why `fittedToCase` is retired
  as an origin: it fused the origin with its scope).
* **`predicted`** — a model or correlation.
* **`calculated`** — a definition or an identity.

`derived` is **not** an origin and is retired.  Its job moves to `from`.

### 3.2 THE BOUNDARY, and the case that defines it

The line between `calculated` and `predicted` is NOT whether the formula
contains fitted coefficients.  It is:

> **If the inputs were perfect, would this result necessarily be exact?**

* yes → `calculated`
* no → `predicted`

**The exhibit is `K_f`**, the cryoscopic constant, derived as
`R·Tb²·M/ΔHvap`.  That arithmetic is exact and contains not one regressed
coefficient — so a rule phrased as *"exact transformation of the inputs"* would
file it `calculated`.  **That would be wrong.**  The formula embodies the ideal
dilute colligative model; with perfect Tb, M and ΔHvap the answer is still only
as right as that model.  It is `predicted`.

This is not hypothetical: when `K_f` was promoted from reference-only to
derived (2026-08-07) it gave **1.8603 against a declared 1.853** — two
independent primaries 0.39 % apart, recorded as a finding.

`K_f` stays in this record permanently, so nobody again confuses **an exact
formula** with **an exact physical model**.

Worked examples:

| value | operation | origin |
|---|---|---|
| `MW` | Σ nᵢ·Aᵢ — a definition | `calculated` |
| `dH_rxn` | Σ νᵢ·hᵢ — Hess's law, an identity | `calculated` |
| `K_f` | exact arithmetic, ideal-dilute MODEL | **`predicted`** |
| `omega` | Lee-Kesler — an empirical fit | `predicted` |
| `Tc` | Joback — group contribution | `predicted` |

### 3.3 `from` — the dependency graph

A value produced from other values names them:

```
omega  0.7887;
origin        predicted;
method        lee-kesler;
methodVersion "...";
from          ( Tb Tc Pc );
reviewStatus  unreviewed;
```

`origin` describes the **local operation only** — deliberately.  Lee-Kesler
applied to measured inputs and Lee-Kesler applied to Joback inputs are the same
local operation, so they carry the same `origin`, and the whole difference in
trustworthiness comes from `from`.  Re-encoding the inputs' status into
`origin` would give one fact two homes, which is the defect this record exists
to remove.

A rule falls out, and it is machine-checkable:

> **A value can never be more trustworthy than what it depends on.**

A record marking ω as resting on measured inputs while `Tc` is Joback is
refusable.

### 3.4 Confidence is COMPUTED, never stored

No `confidence` / `lowConfidence` / `tier` field on a descendant.  That would be
a stored derivative of the `from` graph — the arity sin, with every way to
drift silently.  The graph is walked instead.

**And the graph shows something a label cannot.**  The bootstrap ladder's real
shape:

```
Psat        <- Ambrose-Walton
 |- Tc      <- Joback
 |- Pc      <- Joback
 `- omega   <- Lee-Kesler
              |- Tb  <- Joback
              |- Tc  <- Joback
              `- Pc  <- Joback
```

Four inputs, **one root**.  The errors are not independent — independent errors
partly cancel, correlated ones do not.  So the honest statement is not
*"Psat: estimated"*, nor even *"Psat depends on four estimates"*.  It is
**"Psat depends on one fragmentation"**.

This is the pedagogical payload: *a decision taken at one scale crosses
properties, models and units and can survive all the way to the process
answer.*  A generic "estimated" tag hides exactly that.

---

## 4. What this makes ASKABLE (and what is NOT authorised here)

The `from` graph turns a vague question into a specific one: instead of *"can I
trust this column?"*, **"how does the answer move when the fragmentation
moves?"** — and that is ONE perturbation, not four, precisely because the four
are correlated.  Choupo already has the outer drivers to run it.

**No uncertainty-quantification feature is authorised by this record.**  What
is claimed is narrower and worth stating on its own: the semantics makes the
question formulable **without inventing independences that do not exist**.
Perturbing Tc, Pc, Tb and ω as four independent errors would be arithmetic
built on a falsehood, and before `from` there was nothing in the record that
could have told anyone so.

---

## 5. Migration scope — measured

The scale fear was checked twice, and both times it dissolved:

* the **170 371** `origin=predictive` marks are almost entirely in
  `data/groupEstimative/`, in the derived-number half that the lake reform
  deletes anyway.  **The lake reform IS the vocabulary migration.**
* the curated catalogue uses `origin=` **7 times**; the scalar `provenance`
  shorthand appears **22 times**.

So the hand-migration is on the order of thirty values, not a hundred and
seventy thousand.  There is no renaming campaign, and none is authorised: the
point is a single semantics for what is generated from here on, with the past
migrated only as far as that requires.

---

## 6. What is deliberately NOT settled

* **Whether a rolled-up confidence is ever SHOWN** (as opposed to stored — that
  is refused above).  Walking the graph to a single displayed verdict is a
  presentation decision nobody has taken.
* **Where `from` is enforced.**  Whether an unmarked derived value is refused,
  announced, or silently allowed during a transition period is an
  implementation ruling, not a semantic one.
* **UQ**, per §4.
* **Whether `asserted` survives** as an origin.  It appears twice and neither
  use was examined; it may be `measured` with no citation, which is a different
  and worse thing that the honesty doctrine already has a name for.

---

## 7. Sequencing this unblocks

1. this contract (here)
2. `RowlinsonBondi` — the one missing rung of the predictive ladder; without a
   liquid Cp route no bootstrapped component is usable at all
3. `choupo-bootstrap-component` — lake structure + groups → a reviewable `.dat`
   in the case, every value marked on the five axes, and the engine's refusal
   naming this command (the estimation stays at CURATION time; the runtime
   resolver remains rejected)
4. isopropanol as the first witness — closing the case that blocked the
   2026-08-11 agent test
