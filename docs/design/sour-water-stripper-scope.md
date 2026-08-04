# Sour-water stripper — a distillation column under speciation (scope)

**Status: SCOPE, awaiting Vítor's alignment.  No code is authorised by this
document.**  Requested 2026-08-04 ("podemos fazer o caso 1?"); this states
what the case is, what the engine must gain, what can be validated WITHOUT
the primary source, and the one thing only Vítor can supply.

---

## 1. Why this case

Every distillation tutorial in the corpus runs `gammaPhi` — a molecular
world.  A sour-water stripper is the case where that is not enough: the
volatility of NH₃ and CO₂ is set by a chemistry the column itself moves.
Strip CO₂ from the top and the liquid's pH rises; the rising pH converts
NH₄⁺ back to free NH₃, which then strips.  **The separation and the
speciation are the same problem**, and a molecular K-value cannot express
it.  It is also the sharpest possible teaching contrast: the same feed,
the same trays, and an answer no `gammaPhi` column can produce.

It sits directly on the work of 2026-08-03: `basis01_two_unit_chain`
already runs exactly this chemistry (NH₃ + CO₂ + water, the `ammonia` and
`carbonate` networks at once) through the reactive flash.

## 2. The primary anchor — and the problem with it

The canonical source is **Edwards, T. J., Maurer, G., Newman, J. &
Prausnitz, J. M., "Vapor-liquid equilibria in multicomponent aqueous
solutions of volatile weak electrolytes", AIChE J. 24(6): 966–976 (1978)**
— model AND data for NH₃/CO₂/H₂S/SO₂/HCN in water.  Existence and
citation verified 2026-08-04.

**It cannot be obtained from this environment.**  The session's network
policy permits search but denies document fetching: `escholarship.org`
(the LBL report copy) and the other candidate hosts return 403 at the
gateway.  The AIChE original is paywalled regardless.

So the numbers must come from Vítor (IST access) or from another machine.
**This does not block the engine work** — §4 is anchored on internal
identities that need no paper — but it does mean the case ships in two
stages, and the second is a curation act, not a coding one.

## 3. What the engine must gain

The seam is exact and small to state.  The column asks, per stage:

    K[j] = thermo.Kvec(T[j], P, x[j], x[j]);        // molecular K-values

and the reactive path lives elsewhere entirely:

    ReactiveVLE::solve(T_K, P_Pa, F, z, ...) -> ReactiveVLEResult

`Kvec` has no reactive branch.  A stage under speciation therefore has no
equilibrium to ask for.

**Proposed: EFFECTIVE APPARENT K-VALUES PER STAGE.**  At each stage
evaluation, run the reactive flash at that stage's (T, P, z) and read back
K_i = y_i / x_i on the APPARENT component basis.  Feed those into the
existing MESH.

Why this shape and not a species-variable MESH:

* it keeps the apparent components as the state, which is the settled
  doctrine (CLAUDE.md, the two-bases rule) — the speciation is internal to
  the stage exactly as it is internal to a flash;
* it reuses the reactive solver rather than writing a second one, so the
  column and the flash cannot disagree about the same chemistry;
* the per-stage speciation block is then carriable by the machinery built
  on 2026-08-03 (`origin`, `solvedAtT`, `equilibriumValidHere`), so each
  tray can REPORT its ion profile and its pH honestly.

What it costs, stated plainly: one reactive flash per stage per outer
iteration.  A 10-stage column at ~6 Newton iterations is ~60 reactive
flashes — seconds, not minutes, but an order of magnitude above a
molecular column, and the case header must say so rather than let a
student wonder.

What it is NOT: it is not a rigorous species-basis MESH.  The Jacobian
sees apparent components; the chemistry is re-solved inside each residual
evaluation (the same nested posture the two-liquid flash already uses).
That must be DECLARED in the case and in `PinchPass`-style method
hypotheses on the class, never implied.

## 4. What can be validated WITHOUT the paper

Three internal anchors, each strong enough to catch a real error:

1. **THE ONE-STAGE IDENTITY.**  A column of a single equilibrium stage,
   total reboiler, no reflux, must reproduce the reactive FLASH at the
   same (T, P, z) to machine precision.  Two independent code paths, one
   answer — this is the anchor that catches a wrong K-value definition,
   and it needs no literature at all.
2. **CONSERVATION PER TRAY AND OVERALL.**  Element closure and charge
   closure on every stage's liquid, and across the column boundary.  The
   gates for both already exist.
3. **THE PHYSICS DIRECTION.**  Stripping CO₂ must RAISE the liquid pH down
   the column, and the free-NH₃ fraction must rise with it.  A column that
   strips ammonia while its pH falls is wrong in a way no residual would
   show.  Pinned as a monotonicity check, not a number.

## 5. What only the paper can give

The quantitative anchor: the paper's own computed/measured partial
pressures for the NH₃–CO₂–H₂O system at stated molalities and
temperatures, golden-locked digit for digit — the pattern the
external-reference battery already follows (`cavett01`, the Williams-Otto
four).  Until then the case is honest but self-referential, and its header
must say exactly that rather than imply a validation it does not have.

**What I need from Vítor:** the paper's Table(s) for NH₃–CO₂–H₂O — the
Henry's constants, the chemical equilibrium constants and their
temperature dependence, the interaction parameters, and at least one
worked VLE point with its total and partial pressures.  Pasted as text is
enough; I will not need the PDF.

## 6. Staging

* **S1** — the effective-K seam: `Kvec` gains a reactive branch (or the
  column gains a `stageEquilibrium` that dispatches), with the ONE-STAGE
  IDENTITY as its witness.  No new case yet.
* **S2** — the stripper case: a real multi-stage sour-water column, the
  per-tray speciation reported, conservation + direction gated.
* **S3** — the literature anchor, once the tables exist: goldens locked on
  the paper's numbers, provenance of every value in the case header.
* **S4 (deferred, named)** — H₂S as the third volatile weak electrolyte.
  The paper covers it; the corpus has no H₂S network records, so it is a
  curation slice of its own and must not ride along silently.

## 7. Decision requested

Approve the effective-K shape (§3) and the two-stage delivery (engine now,
literature anchor when the tables arrive) — or amend.  If the shape is
approved I start at S1, whose witness needs nothing that is not already in
the repository.
