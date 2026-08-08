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
| **S2** | The service seam: candidate assembly (a solid the DATA defines and the CASE admits becomes a `SolidCandidate` with its model behind the closure), exposed through the phase-equilibrium layer per R4; announcements ride AdvisoryLog.  **S2a**: the mineral→master sink resolution extracted to ONE `resolveOne` inside `solve()` and exposed report-only (`SpeciationInput::sinksFor` → `SpeciationResult::sinks`), solve byte-identical (flash16/flash19 goldens + spike gate unmoved).  **S2b**: `SolidEquilibriumService` — provider resolves existence + stoichiometry, service owns presence/transfer/narration; flash16's own chemistryDict declaration assembles end to end and reproduces the internal oracle to 5e-11 rel.  Gate `check_solid_service` (A1–A6, sabotage-verified: a halved transfer fails A2 naming both numbers; A6's word-boundary lesson recorded in place) | **SHIPPED 2026-08-08** |
| **S3** | `SpeciationSolver` becomes provider/client: its internal mineral transfer replaced by the common closure — after this slice there is ONE transfer mechanism in the engine, which is R2's architectural point.  The existing mineral answers are the regression harness (crystallisers, flash16, pitzer_calcite_brine goldens must not move) | not started |
| **S4** | Flash/crystalliser integration + the C3 uniform `phases ( … )` grammar (approved, coexisting, no mass migration) | not started |
| **S5** | Witnesses: the Marcilla LLS tie-triangle (aqueous + organic + solid NaCl at once — the flagship; anchors staged in [`solid-migration-witness-data.md`](solid-migration-witness-data.md)); the ice + dihydrate eutectic once the dihydrate is curated (Vítor's, non-blocking per R3) | not started |

## S2 design (recorded 2026-08-08, after reading the provider)

The provider surface is already public where it matters:
`SpeciationSolver::minerals()` (the `MineralEntry` records the DATA defined),
`solve()` (speciation, activities, `SI` per available mineral), and the
case's admission is `chemistryDict equilibria.solidPhases` /
`equilibrate { minerals (…) }`.  ONE thing the service needs is not yet on
that surface: the mineral→master SINK RESOLUTION (`Allowed::nuPj` — a
mineral referencing a computed species chains through its mass action onto
the MASTER balances; built inside `solve()` as a local).  The service must
not re-derive it — a second copy of the stoichiometry resolution is the
arity sin, and R1 assigns "transfer stoichiometry" to the MODEL/provider
side anyway.  So:

* **S2a** — extract the sink-resolution into a shared private helper and
  expose it as a public provider method (`mineralMasterSinks`), `solve()`
  byte-identical (the whole corpus is the harness).
* **S2b** — `SolidEquilibriumService` in `thermo/solidEquilibrium/`:
  verifies each ADMITTED name against the provider's minerals (refusing by
  name with the curation remedy), builds `SolidCandidate`s whose `lnSI`
  prices through `provider.solve()` (no equilibrate set) and whose
  `remove` sinks master totals through the S2a stoichiometry, runs the
  common `equilibrate()`, announces appearance/redissolution via
  AdvisoryLog, returns formed amounts + the final aqueous state.  Gate:
  assembly from flash16's own declarations reproduces the
  `SpeciationSolver` internal-equilibrate oracle (the spike's D3, now
  through the ASSEMBLY path, not hand-built closures).  The internal
  augmented-Newton mineral path stays untouched — it dies in S3, when the
  service becomes the ONE mechanism.

## Slice discipline

One slice per commit-and-suite cycle; each slice keeps every existing golden
byte-identical unless the slice's record says which golden moves and why.
The spike gate stays green throughout and is superseded only when the
migration's own gates cover strictly more than it does.
