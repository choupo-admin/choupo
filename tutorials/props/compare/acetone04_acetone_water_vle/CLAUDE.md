# CLAUDE.md -- Choupo case: props/acetone04_acetone_water_vle

Programme record:
[`docs/design/acetone-ipa-reference-case.md`](../../../../docs/design/acetone-ipa-reference-case.md).
Siblings: `acetone01_ipa_water_azeotrope` (the other binary),
`steady/reactors/acetone02_luyben_reactor`,
`steady/flowsheets/acetone03_luyben_reaction_section`.

## Intent (this case) -- keep this updated as the project develops

- **Goal:** measure the thermodynamics the **absorber** rests on, before
  building it. Luyben's absorber washes acetone out of the reactor's
  hydrogen-rich offgas with water; what that unit costs, and whether it can
  work, is set by how volatile acetone is out of dilute water.

- **Why this is a cleaner test than `acetone01`:** both components are
  **curated**. Neither comes from the estimate lake, so there is no
  pure-component error to separate out afterwards — whatever appears is the
  mixture model plus the two curated vapour pressures, and the two pure
  boiling points below say how much the second part is.

### What it found, measured 2026-08-12

**1. The pure acetone leg is essentially exact.**

| | Choupo | Luyben | |
|---|---|---|---|
| acetone normal bp | **329.4179 K** | 329.4 K | **0.02 K** |
| water normal bp | 372.4536 K | 373 K | −0.70 K |

Acetone lands on the published boiling point to two hundredths of a kelvin.
The water leg reproduces, independently, the 0.70 K deficit already recorded
in `acetone01` — Choupo's curated water Antoine set used at the very top of its
own declared window. Measured again here rather than quoted, because a number
carried from another case is a number with two homes.

**2. The number the absorber turns on:** at 1 mol % acetone in water, 318 K,

> γ_acetone = **10.27**,  Psat = 0.6746 bar,  **K = 6.84**

so a liquid at 1 mol % sits under a vapour at 6.8 mol %. Acetone is strongly
driven out of dilute water, which is what makes the absorber a real unit rather
than a formality. **No independent value is cited against this** — no measured
γ^∞ for acetone/water is in hand — so it is published as the model's number and
nothing is claimed about its accuracy.

**3. THE FINDING: UNIFAC predicts an azeotrope where the paper says there is
none.**

Luyben states acetone/water has **no azeotrope**, only a pinch at the
high-acetone end. On a fine grid over the top 8 mol %:

| x acetone | T_bubble | y − x |
|---|---|---|
| 0.9600 | 329.3946 | +0.0037772 |
| 0.9760 | 329.3737 | +0.0002559 |
| 0.9840 | 329.3764 | −0.0006025 |
| 0.9900 | 329.3858 | −0.0007724 |
| 1.0000 | 329.4179 | 0 |

The bubble temperature passes through a **minimum at x ≈ 0.978** and y − x
changes sign there: that is a minimum-boiling azeotrope, not a pinch.

**Its size is the whole story.** It is **0.044 K** below pure acetone's boiling
point, with |y − x| never exceeding **7.7 × 10⁻⁴**. Pinch and azeotrope are
being decided in the fourth decimal place, well inside any experimental
resolution. This is not "UNIFAC is wrong by a lot"; it is a tight pinch that
the model tips just over the line.

**But it is not academic, and this is why the measurement came first.** An
azeotrope at 97.9 mol % acetone puts a **ceiling** on what a distillation can
produce, and Luyben's acetone product spec is **99.9 mol %**. A column C1 built
on this thermodynamics should be expected to asymptote near 97.9 % and fail his
spec — and if it had been built before this was measured, the column would have
been blamed for a defect that lives in the activity model.

That is a **prediction to test when C1 is built**, stated here in advance so it
cannot be retrofitted afterwards. It is not yet an established fact about the
column.

- **Decisions + why:**
  - **UNIFAC**, because Choupo ships no fitted acetone–water pair (checked:
    `parameters/NRTL/` and `parameters/UNIQUAC/` carry none) and inventing one
    would convert *unsourced* into *falsely sourced*.
  - **A fine second scan** over the top 8 mol %: the coarse 0.02 step in x
    cannot resolve a feature that lives at 1e-4, and reporting "no azeotrope"
    off a grid too coarse to see one would have been a measurement artefact
    presented as a result.
  - **No `anchor` rows.** Acetone's boiling point could carry one and the
    remaining two could not (water's is the known catalogue deficit; the
    azeotrope is a qualitative statement, not a number). Anchoring one of three
    would suggest the other two were checked.

- **Pending / in curation:**
  - a fitted acetone–water pair, which is what would settle whether the
    azeotrope is real;
  - a measured γ^∞ to compare the 10.27 against;
  - water's 0.70 K, shared with `acetone01`.
