# Proposal — general salt reconstruction

**Status: IMPLEMENTED 2026-07-27** (slice 1 — the forward map, the rank test
and the vertical spike). Section 8 records what the spike found. The original
proposal text below is unchanged, so it can still be read against what shipped.

**Was: PROPOSAL. Nothing here is implemented.** It exists to be accepted,
amended or rejected before any code is written, per the house rule that
architecture is aligned first.

**Driven by:** `docs/design/flashComplex/` — the design-driver case, whose two
solids both refuse today, and whose second forum ordered this slice *ahead of*
the second liquid phase.

---

## 1. The refusal, and what it is telling us

`flashComplex` feeds CaCO₃ and can precipitate NH₄HCO₃. Both stop the build:

```
apparent component 'CaCO3' carries TWO candidate marker elements (C, Ca)
  -- the spike's collapse contract needs exactly one; generalised salt
  reconstruction is a later, deliberate slice.
```
`ThermoPackageBuilder.cpp:690`

Declaring the typed bridge on each does not rescue them either. `markersSeen`
(line 709) refuses two components sharing a marker element, and CO₂, CaCO₃ and
NH₄HCO₃ all carry C.

The message is accurate and it names its own successor. This document is that
successor.

## 2. What the current contract actually is

`ReactiveVLEConfig::Family` (`ReactiveVLE.H:96`) is a **1:1 map**:

```cpp
struct Family
{
    std::size_t apparentIdx;   // the flowsheet component
    std::string marker;        // "N"
    SpeciesId   master;        // "NH4"
};
```

and the totals are built one-for-one (`ReactiveVLE.cpp:141`):

```cpp
const scalar liq = n[fam.apparentIdx] - vap[fam.apparentIdx];
in.totals[fam.master] = std::max(liq, 0.0) / kgw;
```

One component → one master, coefficient implicitly 1. Every component the
reactive path has ever seen fits: NH₃ → NH₄⁺, acetic acid → Acetate⁻, CO₂ →
HCO₃⁻, H₂S → HS⁻. The marker element is how the builder *finds* the master
when no typed bridge is declared — a heuristic that works because each of
those components has exactly one non-H/O element.

**A salt breaks it because a salt is not a member of one family.** Dissolved
CaCO₃ *is* calcium and carbonate at once. There is no single master that
carries it, and no single element that identifies it.

This is not an implementation limit that grew by accident. It is the
(c−1)(a−1) degrees of freedom appearing as a data-structure shape: with one
master per component the map is trivially invertible, so the question of
non-uniqueness never had to be asked.

## 3. The proposal, in one sentence

**Replace the single master with the stoichiometric vector that is already in
the data, and treat the component↔species crossing as the linear map it is.**

### 3.1 The data already exists

A salt's dissolution stoichiometry is already curated, in the component's own
record, in the corpus form:

```
solidPhases
{
    calcite
    {
        dissolutionReaction { masters ( { ion Ca; nu 1; } { ion HCO3; nu 1; } { ion H; nu -1; } ); }
        equilibrium { logK25 1.879; dH -28078.8; ... }
    }
}
```

and the molecular components already carry the same shape as `aqueousMapping`:

```
aqueousMapping ( { species HCO3; nu 1; } { species H; nu 1; } );
```

**No new grammar is proposed.** The bridge a salt needs is the vector it
already declares. What changes is that the engine reads a vector where it
today reads a name.

### 3.2 The forward map is a matrix

Let **A** be the (masters × components) matrix whose column *j* is component
*j*'s declared mapping. Then the family totals handed to the speciation solver
are

```
m = A n
```

Always well defined, for any number of masters per component, always linear.
The code change is small and mechanical:

```cpp
struct Family
{
    std::size_t apparentIdx;
    std::vector<std::pair<SpeciesId, scalar>> mapping;   // was: one SpeciesId
};
```
```cpp
for (const auto& [master, nu] : fam.mapping)
    in.totals[master] += nu * std::max(liq, 0.0) / kgw;   // was: assignment
```

Note `+=` where there was `=`. That single character is the whole
generalisation on the solver side: two components may now contribute to the
same family total, which is exactly what CO₂ and CaCO₃ both doing carbonate
means.

### 3.3 The backward map is where the honesty lives

Projecting a converged species state back onto flowsheet components is

```
n = A⁻¹ m
```

which exists and is unique **iff A has full column rank and m lies in its
column space**. It is not a detail — it is the whole (c−1)(a−1) question, now
in a form the engine can *test* rather than assume:

| situation | rank test | engine behaviour |
|---|---|---|
| full column rank, m in range | unique | solve; no convention needed |
| rank deficient | (c−1)(a−1) > 0 dof | **refuse**, naming the deficiency, until a projection convention is declared |
| m outside the column space | a species total no declared component can carry | **refuse**, naming the species (a "cross" salt nobody declared) |

The current marker-element heuristic is the special case where **A** is a
permutation-like matrix: trivially full rank, trivially invertible, no
convention required. Everything that works today keeps working, by
construction, because a 1-master component is a column with a single 1.

**The projection convention itself is NOT part of this proposal.** It is a
later, separately-aligned slice. What this proposal delivers is the engine
knowing when it needs one, and refusing rather than guessing.

### 3.4 What the marker element becomes

It stops being the mechanism and becomes a **fallback for undeclared
components**, unchanged in behaviour and unchanged in its refusals. A
component that declares its mapping never reaches it.

The `markersSeen` clash (two components sharing a marker) simply stops firing
for declared components, because they no longer need a marker at all — which
is the correct resolution of CO₂/CaCO₃/NH₄HCO₃ all carrying C.

## 4. The vertical spike

Doctrine: *build via a vertical spike end-to-end through all layers before any
mass migration.* Here is the smallest system that exercises the general map
and nothing more.

**System:** water + CO₂ + CaCO₃. Masters: HCO₃⁻, Ca²⁺ (H⁺ is the shared
mediator, never a declared master).

```
        CO2   CaCO3
HCO3  [  1      1  ]
Ca    [  0      1  ]
```

Chosen deliberately:

* it is **not** 1:1 — CaCO₃ spans two masters and both components contribute
  to carbonate, so `+=` is genuinely exercised;
* **A is full rank**, so the backward map is unique and the spike does *not*
  depend on the projection convention that is being deferred;
* it is small enough to check by hand: feed 1 mol CaCO₃ and the carbonate
  total must rise by exactly 1 while the calcium total rises by exactly 1,
  with the H⁺ leg absorbed by electroneutrality.

**Layers it must cross, all of them:** component record → builder (mapping
read, no marker) → `ReactiveVLEConfig` → `ReactiveVLE` totals → speciation
solver → converged state → back-projection → stream file → reports.

### 4.1 Acceptance

1. **Backwards compatibility is byte-exact.** `flash09` through `flash13` are
   the entire reactive-path corpus and every component in them is 1-master.
   Their goldens must not move by one digit. If any moves, the generalisation
   is wrong, not the golden.
2. **The hand check passes** — the two totals above, verified numerically
   before any golden is recorded.
3. **An independent cross-check.** The same system through the existing
   `speciate` props op (which reads the whole solid list and does not use the
   marker collapse) must agree with the reactive path within solver tolerance.
   Two different routes to one answer is the only evidence worth having.
4. **The rank refusals fire on constructed cases** — one rank-deficient, one
   out-of-range — each with the deficiency named. A refusal with no test is a
   refusal that will rot.
5. `bin/runTests` green, 318 + the new case.

## 5. What this does NOT do

Stated so the scope cannot creep silently:

- **No projection convention.** Rank-deficient systems refuse. Choosing the
  convention is its own slice with its own alignment.
- **No multi-salt activity engine.** The single-salt Pitzer adapter keeps its
  refusal (`6b081583`). This proposal is about the *basis map*, not the
  activity model.
- **No change to the stream file.** Species in `0/` and `converged/` remain
  forbidden; the three-level stream is constitutional and separate.
- **No mass migration.** No existing record is rewritten. Salts that declare
  nothing keep the marker fallback.
- **`flashComplex` still will not run** afterwards — it still needs the second
  liquid phase. This slice removes one of its two blockers, not both.

## 6. Cost, honestly

| piece | size | risk |
|---|---|---|
| `Family` struct + `+=` in `ReactiveVLE` | ~20 lines | low — the 1-master case is a strict subset |
| builder: read the declared mapping, demote the marker to fallback | ~60 lines | medium — it is the seam every reactive case crosses |
| rank test + the two refusals | ~80 lines | medium — needs a small dense linear-algebra helper (hand-rolled, no deps, per doctrine) |
| the spike case + goldens + cross-check | a case | low |

The rank test is the only genuinely new machinery, and it is small: Gaussian
elimination with partial pivoting on a matrix whose dimensions are the number
of masters and components, which is single digits in every case that exists.
`src/solver/` already hand-rolls Gauss for `NewtonND`.

## 7. The ask

Three questions, and only the first blocks:

1. **Is the linear-map framing accepted** — component↔species as `m = A n`,
   with rank as the test for whether a convention is needed?
2. **Is the spike the right one** (water + CO₂ + CaCO₃, full rank, deferring
   the convention), or should it include a rank-deficient system from the
   start so the refusal ships with its first real user?
3. **Does the forum see it first**, or is this document enough?


---

## 8. What shipped, and what the spike found

### 8.1 Delivered

* `ReactiveVLEConfig::Family` carries the stoichiometric **vector**, not one
  master. The solver accumulates (`+=`) instead of assigning.
* The builder reads the **declared bridge** in full; the marker element is
  demoted to a fallback for undeclared components. A component that declares
  its mapping needs no marker, which is also how the shared-marker clash
  (CO₂/CaCO₃/NH₄HCO₃ all carrying C) stops being a problem.
* **The rank test**, by Gaussian elimination with partial pivoting on the
  masters × components matrix, with the deficiency refusal. It announces
  `[basis] component -> master map: N component(s), rank R` on every reactive
  run.
* `tutorials/steady/flash/flash14_calcite_carbonate_basis` — the spike,
  sealed, golden-recorded.

### 8.2 Acceptance, as measured

| criterion | result |
|---|---|
| flash09–13 goldens byte-exact | **pass** — the whole reactive corpus, unmoved |
| hand check of `m = A n` | **pass** — instrumented totals equal the hand calculation to every printed digit |
| independent cross-check | **pass** — see below |
| rank refusal reachable | announced on every run; the deficiency branch has **no corpus case yet** (§8.4) |
| `bin/runTests` | **319 PASS / 0 FAIL** |

The cross-check ran the converged totals (Ca 0.006993, HCO₃ 0.035987 mol/kg,
313.15 K) through the `speciate` props op — a route that never touches
`ReactiveVLE` or the component→master map:

| | reactive flash | speciate op |
|---|---|---|
| pH | 6.016 | 6.016 |
| I [mol/kg] | 1.9469e-02 | 1.9471e-02 |
| a_w | 0.99924 | 0.99924 |
| SI calcite | −0.013 | −0.013 |
| SI aragonite | −0.149 | −0.149 |

The ionic-strength difference is the sixth significant figure of the totals I
typed in, not a disagreement.

### 8.3 The defect the spike found, which was not what it was looking for

The reactive path printed its speciation diagnostics — pH, ionic strength,
a_w, species count, gamma passes, Newton steps **and the whole SI table** —
from the **first inner call**, i.e. the initial guess, reported as though it
were the answer. The mechanism: the inner solve was verbose only on its first
call so the activation trace would print once, and the post-convergence
re-evaluation (`residual(u)`, "re-evaluate EVERYTHING at the answer") then ran
silently.

It is **pre-existing** and independent of this slice — `flash09`, untouched
here and byte-exact, printed `SOLVED pH = 10.164` in the block while its own
converged summary said `9.900`. With a salt in the system the gap reached
**1.7 pH units**, and the SI table was the saturation state of a guess.

It was found because the cross-check disagreed and the disagreement was
chased instead of explained away. It cost a false lead first: the spike's feed
was tuned to calcite saturation against the *guess* SI and had to be retuned
against the converged one (0.065 → 0.0122 kmol/h — a factor of five).

Fixed here: `SpeciationInput::announceClosure` separates the one-time trace
from the result diagnostics, so the trace prints on the first call and the
**converged** call reports. `flash09` now prints 9.900 in both places.

A glass box that shows the wrong number is worse than one that shows none.

### 8.4 Still open after this slice

* **The projection convention** — unchanged, still deferred. The engine now
  refuses a rank-deficient basis instead of assuming; choosing what to do
  about it is the next slice.
* **No rank-deficient corpus case.** The refusal has no test, and a refusal
  with no test rots. The natural one is K/Na × Cl/SO₄, where the rank drops by
  exactly (c−1)(a−1) = 1.
* **The salt's bridge is case-local.** `flash14`'s `aqueousMapping` on CaCO₃
  lives in a sealed by-name overlay, not in the catalogue. Promoting it is a
  curation act that touches every case reaching CaCO₃; it waits on this slice
  being accepted.
* **`flashComplex` still does not run** — it needs the second liquid phase.
  This slice removed one of its two blockers, as stated.
