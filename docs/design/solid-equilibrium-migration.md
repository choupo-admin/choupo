# The solid-equilibrium migration — the authorised campaign, slice by slice

> **KIND: SCOPE.**  The C2 review (2026-08-08) ratified the target
> architecture and AUTHORISED this migration under four boundary rulings —
> [`solid-equilibrium-spike.md`](solid-equilibrium-spike.md) §7 is the
> authority; this record only sequences the work and tracks what is built.
> Every slice ships under the C1 delegation (gate-guarded, reversible,
> announced); anything touching a reserved boundary stops and escalates.

## The boundaries, restated as build constraints

* **R1** — production solver = ACTIVE-SET complementarity (explicit, never a
  smooth surrogate) + SIMULTANEOUS damped Newton on the active set.
  Announcements are solver/service behaviour.
* **R2** — data defines what a solid IS · the case declares whether it is
  ADMITTED · the equilibrium service decides whether it is PRESENT.  The
  common closure is the ONLY mechanism that moves material from the fluid
  inventory into any solid phase; `SpeciationSolver` becomes a
  provider/client (aqueous state in; speciation, activities, IAP out).
* **R3** — sub-zero Ksp(T) / the NaCl·2H₂O dihydrate are curation gaps,
  never migration blockers.
* **R4** — the interface lives in the PHASE-EQUILIBRIUM LAYER (thermo),
  not inside SpeciationSolver, a crystalliser, a flash, the chemistry
  parser, or a concrete SolidPhase.  Model contract stays SMALL (residual,
  derivatives, stoichiometry, validity); the solver owns active-set logic,
  appearance/disappearance, the coupled solve, ledger closure,
  announcements and refusals.

## Slices

| slice | content | status |
|---|---|---|
| **S1** | **The production solver** in `src/thermo/solidEquilibrium/SolidEquilibrium.H`: the spike's damped-sequential secant replaced by R1's active-set + simultaneous damped Newton (probed Jacobian, partial-pivot solve, damped clamp at n ≥ 0, singular-coupling refusal naming the banned duplicated-mechanism shape) with appearance/redissolution narration through a caller event sink.  Model contract unchanged (`lnSI` + `remove` + `n`).  Acceptance: the spike gate D1–D5 + purity, UNCHANGED — same physics, ratified solver form (D1 7.0e-9 K, D2 exact m_sat / 1e-15 ledger, D3 3.0e-10 vs the untouched oracle, D4 1e-16, D5 −30 % seen) | **SHIPPED 2026-08-08** |
| **S2** | The service seam: candidate assembly (a solid the DATA defines and the CASE admits becomes a `SolidCandidate` with its model behind the closure), exposed through the phase-equilibrium layer per R4; announcements ride the run header/AdvisoryLog | not started |
| **S3** | `SpeciationSolver` becomes provider/client: its internal mineral transfer replaced by the common closure — after this slice there is ONE transfer mechanism in the engine, which is R2's architectural point.  The existing mineral answers are the regression harness (crystallisers, flash16, pitzer_calcite_brine goldens must not move) | not started |
| **S4** | Flash/crystalliser integration + the C3 uniform `phases ( … )` grammar (approved, coexisting, no mass migration) | not started |
| **S5** | Witnesses: the Marcilla LLS tie-triangle (aqueous + organic + solid NaCl at once — the flagship; anchors staged in [`solid-migration-witness-data.md`](solid-migration-witness-data.md)); the ice + dihydrate eutectic once the dihydrate is curated (Vítor's, non-blocking per R3) | not started |

## Slice discipline

One slice per commit-and-suite cycle; each slice keeps every existing golden
byte-identical unless the slice's record says which golden moves and why.
The spike gate stays green throughout and is superseded only when the
migration's own gates cover strictly more than it does.
