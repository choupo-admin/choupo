# One stream, one semantics — the transport reconciled with the stream-state contract

> **KIND: ADR (executed same day).**  Ruled by Vítor 2026-08-08, on the
> flash19 numbers: *"the settled stream-state contract stays... `F` =
> overall stream molar flow... Do not preserve that contradiction...
> reconcile the structured stream result with the canonical stream-state
> semantics and add gates/tests that prevent the two meanings from
> diverging again."*  The rejected alternative is recorded in §2 — it was
> shipped for a few hours and reverted by this ruling.

## 1. The defect

The stream-state architecture (2026-07-30) defines `componentMolarFlows`
as the OVERALL material and `phases {}` as a decomposition that sums back
to it exactly — and `converged/<stream>` honours that (flash19's liquid:
CaCO₃ 0.03 kmol/h overall = 0.0109 dissolved + 0.0191 crystal, closing
component by component).  But the structured result JSON leaked the
ENGINE-INTERNAL representation instead: `F`, `composition` and `H` were
fluid-only, `H_kW` was overall, and the solid travelled "beside" the
stream.  Two public surfaces assigned different meanings to the same
names; the GUI then displayed phase totals that appeared not to close
against an F that never contained the solid.  A transport-contract defect,
not a rendering one.

## 2. The rejected fix, for the record

Relabelling the GUI ("F (fluid)") — shipped briefly, rejected the same
day: *"The solid does not ride beside the stream.  THE SOLID IS PART OF
THE STREAM."*  Internal convenience must not leak into public semantics;
the label would have preserved the two-meanings state and taught it.

## 3. What shipped

* **`ResultEmitter`** now speaks the contract: `F` = overall molar flow
  (fluid + solid), `composition` = overall mole fractions (a crystal's
  material IN the composition it belongs to), `F_mass` = overall mass,
  `H` = overall molar enthalpy so `H_kW = F·H` is ONE pair, `vf`
  documented as the vapour fraction OF THE FLUID PORTION.  The explicitly
  named parts (`F_solid_mass`, `solids{}`, `organicLiquid{}`,
  `speciation{}`) locate portions of the same material.  The engine's
  internal fluid+solid split (`ProcessStream::F/z/s`) is untouched —
  internal representation is free; public semantics are not.
* **`streamPhases()`** (the one GUI decomposition home) subtracts the
  solid out of the overall first, then the organic out of the fluid, so
  Σ(phases) == F·x component by component BY CONSTRUCTION; the
  missing-molar-mass narration now also says the fluid rows still contain
  the unconverted material.
* **Gate `check_stream_transport_closure`** (wired into `runTests`,
  sabotage-verified: a 0.1 % corruption of the emitted F fails it naming
  stream and component): on fresh runs of flash19 + flash17 it asserts
  Σx = 1, JSON == `converged/` file component by component, the FILE's
  phases sum back to its overall, `H_kW = F·H`, and the derived aqueous
  side is nonnegative.
* **Goldens**: every `stream <name> F` row recorded from the old
  fluid-only payload moves on solid-bearing streams — re-recorded in this
  slice, each a pin of the WRONG semantics, not a physics change (the
  `converged/` files, KPIs and reports are byte-identical).  The list is
  in the slice's commit.

## 4. Consequences

The hierarchy is now the same sentence on every surface — file, JSON,
reports, GUI: OVERALL MATERIAL (how much) → PHYSICAL PHASES (where) →
AQUEOUS SPECIES (what carries the aqueous material).  `vf` stays
fluid-scoped by declaration, not by accident.  The phase-absence
ambiguity ("single phase" vs "split not solved here", DEV.md §5 debt 9)
is untouched — deferred to the C3 grammar review as ruled.
