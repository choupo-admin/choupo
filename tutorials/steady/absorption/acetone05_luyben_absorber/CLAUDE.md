# CLAUDE.md -- Choupo case: steady/acetone05_luyben_absorber

Programme record:
[`docs/design/acetone-ipa-reference-case.md`](../../../../docs/design/acetone-ipa-reference-case.md).
Siblings: `acetone01`–`acetone04`.

## Intent (this case) -- keep this updated as the project develops

- **Goal:** Luyben's absorber — 9 stages at 1.5 atm, 20 kmol/h of water washing
  acetone out of 39.80 kmol/h of hydrogen-rich offgas.

- **What is independent.** The gas inlet is Luyben's own (`Gas (to absorber)`:
  39.80 kmol/h, acetone 0.1147, IPA 0.0033) **except** its hydrogen and water,
  derived from the gas *leaving* using H₂'s inertness plus a balance. So the
  outlet H₂ and water are **not** independent checks. Everything about the
  **acetone**, and the whole **bottoms** stream, is: nothing in `0/` was built
  from those.

### The result, measured 2026-08-12

| | Luyben | Choupo | |
|---|---|---|---|
| offgas, kmol/h | 39.76 | 39.123 | |
| x acetone, offgas | 0.0634 | **0.1082** | 1.7× |
| bottoms, kmol/h | 20.05 | 20.677 | |
| x acetone, bottoms | 0.1020 | **0.0160** | |
| acetone absorbed, kmol/h | 2.045 | **0.332** | **6.2× less** |
| **recovery** | **44.8 %** | **7.3 %** | |

**The absorber barely works.** Choupo recovers a sixth of the acetone Luyben
does. Reported, not tuned — nothing in this case was adjusted to close the gap,
and the Henry pair is the curated `acetone-water.dat` as shipped.

Where the difference must live: this unit's Kremser method reads **Henry's law
alone**, so the disagreement is in the Henry constant for acetone/water at
318–320 K, in the 9-stage Kremser idealisation, or in both. It is *not* in the
activity model — see below.

### The correction this case forced on its own family

`acetone04` measured UNIFAC's acetone/water surface **in order to inform this
absorber**. That reasoning was wrong: **the absorber consumes none of it.**
Kremser reads Henry; it never asks the activity model anything.

The measurement is not wasted — it is the right surface for the two
distillation columns, which do take K from the activity model — but it does not
describe this unit, and saying so is cheaper than letting a future reader
assume the 10.27 explains the 7.3 %.

That is also why this case runs a **different package** from every other
acetone case: `diluteSolution`, water on the Raoult rung, acetone on the Henry
rung, H₂ and IPA inert. Handing it the family's `gammaPhi`/UNIFAC package is
now refused by name.

### Two engine defects found here, both fixed

**1. An absorber with nothing to absorb deleted the solvent stream and exited
0.** Given a package naming no solvent, every `isSolute` test silently returned
false, every component fell through to *inert*, the gas left unchanged and the
entire 20 kmol/h wash stream **disappeared**. The mass-balance report caught it
(49.2 % closure, oxygen failing) — but a unit that has already determined it
cannot do its job must not hand a fabricated answer to a report and hope the
report objects. Two refusals now fire, each naming what is missing and what to
write.

**2. Solvent arriving in the GAS feed was being deleted.** The material loop
read `L_in * x_in[i]` — the solvent stream alone — so the 0.345 kmol/h of water
Luyben's gas carries went into neither outlet. Mass closed at 99.12 %, oxygen
off by 1.38 %. Where it goes is not a new assumption: the method has *already*
assumed the solvent does not evaporate, so solvent entering with the gas can
only leave in the liquid. Mass and elements now close at 100.000 %.

Blast radius checked before changing: `absorber01_NH3_water` is the only other
case using this unit and its gas feed carries no water, so **no existing golden
moved**.

- **Decisions + why:**
  - **`role solute;` for acetone is declared CASE-LOCALLY**, not in
    `data/standards/`. The Henry pair is curated; the role is not, and adding
    it to the standard record is a curation act, which is reserved. Declared
    here it is a statement about *this model* ("in this absorber acetone is the
    thing being washed out") rather than a claim about the substance.
  - **No `anchor` rows.** The recovery disagrees with the paper by 6×; an
    anchor whose band cannot admit the observed value would put the suite in
    the red, and the rule is report, never tune.

- **Pending / in curation:**
  - **why the recovery is 6× low** — the Henry constant, the Kremser
    idealisation, or both. This is the open question this case leaves;
  - a stage-by-stage comparison against Luyben's 9 stages, which would separate
    the two candidates.
