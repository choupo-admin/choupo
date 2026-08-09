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
| **S3** | `SpeciationSolver` becomes provider/client — ONE transfer mechanism.  **Design (recorded 2026-08-08, after the caller inventory):** the internal augmented Newton is ALREADY R1's ratified shape (active-set + simultaneous, n_p unknowns beside the ln-block); its defect is WHERE the entry lives, not its math.  So the service gains a **coupled route**: for an all-mineral candidate set it invokes the provider's own simultaneous solve — one door, the service owning admitted-list, formed ledger and narration — while the **general probed route** (solidEq::equilibrate) serves mixed-model sets (S4: ice beside a mineral).  Two implementations of one complementarity, ONE entry; the gate pins their AGREEMENT, which a nested re-route could never make byte-identical and this design does trivially.  Clients migrate: **S3a** Speciate op — SHIPPED 2026-08-08, five speciate-family witnesses byte-identical, gate arm A7 pins coupled == internal oracle EXACTLY.  **S3b** ReactiveVLE (the crystalliser/flash16 route) + ScalingScan + the one-entry lockdown (no code outside the service fills `SpeciationInput::equilibrate`; grep-style gate arm).  S3b entry notes, paid for by inspection: (1) ReactiveVLE calls solve-with-equilibrate INSIDE its FD-Jacobian loop — the service's narration must be flag-gated (`narrate`), else hundreds of near-duplicate advisories with moving n in the text flood the log; narrate only the converged call, as ReactiveVLE already does with announceClosure.  (2) The lockdown grep excludes exactly two writers: the service (the door) and the input struct's own default — Speciate/ScalingScan/ReactiveVLE must all be clean | **SHIPPED 2026-08-08 (S3a + S3b)** — ONE transfer mechanism: the service is the engine's only writer of the equilibrate channel (gate arm A8, the lockdown as a compile fact); Speciate, ScalingScan and both ReactiveVLE sites walk through the door with narration flag-gated; eight harness witnesses byte-identical (flash16/19, crystalliser05/09, pb82, scaling/precipitation_ro_brackish, pitzer_calcite_brine) |
| **S4** | Flash/crystalliser integration + the C3 uniform `phases ( … )` grammar (approved, coexisting, no mass migration).  **Design (recorded 2026-08-08, at the refusal site):** `IsothermalFlash` today REFUSES a declared solid Phase, and its refusal text names this exact slice ("anyone adding a solid declaration should expect this refusal first, and should treat reaching it as the design question it is").  The answer: a fusion-class solid Phase (`SolidPhase` — ice) becomes a `SolidCandidate` whose `lnSI` prices through `fEffective` and whose `remove` moves the owning component out of the fluid, served by the service's GENERAL route (the mixed-model solver built for exactly this) around the existing VLE solve — the freeze-concentration flash.  Acceptance: fpd01's curve inverted THROUGH THE FLASH (the spike's D1, now as a unit operation), flash19 byte-identical (the chemistry route untouched), the refusal retired only where the grammar actually serves the declaration.  C3's `phases ( liquid solid vapour )` with per-phase `type` is the declaring grammar, coexisting with the current forms | **S4a SHIPPED 2026-08-08** — the C3 uniform `phases ( … )` grammar is live in the gammaGamma form (coexisting; two authorities refuse; solid entries reach the Phase factory), and the flash's solid refusal flipped from unreachable-by-construction to REACHABLE-AND-FIRING from a real case (gate arm A9: coexistence on vlle01's own split, the reachable refusal, the two-authorities refusal).  **S4b next — scope corrected 2026-08-09** (the first statement above named fpd01's curve as acceptance, and that was a world error): the C3 grammar lives in the gammaGamma MOLECULAR world while fpd01's brine prices on the Pitzer SALT surface — the declaration and the anchor could never meet in one case.  So S4b's first honest scope is the **molecular freeze-concentration flash**: water + ethanol liquor + ice, a_w = γ_w·x_w from the declared activity model, LIQUID+SOLID phase set only (solid-beside-vapour refused as a named S4c gap), verified against the closed-form identity ln a_w = −ΔG_fus/RT that `check_ice_freezing` already pins.  The candidate's `lnSI` = ln(a_w·Psat/f_solid) through `fEffective`; `remove` pulls the owning component from the liquid inventory; the service's general route decides presence.  The salt-world flash follows once the Pitzer surface gains a declaring grammar — a separate slice, not this one.  **S4b first slice SHIPPED 2026-08-09**: the SLE branch is live (`solveSLE` in IsothermalFlash — crystallizing solid(s) + ONE liquid + no vapour dispatch to the ONE mechanism; every other solid shape refuses by name as the S4c gap), witnessed by `flash21_freeze_concentration` (ice 0.476 mol/mol at 258.15 K, identity γ_w·x_w = exp(−ΔG_fus/RT) to 9e-11, sealed, goldened; gate arm A10 recomputes the closed form).  Paid for on the way, recorded at the sites: (1) `fEffective` is the X-FREE effective fugacity — the first lnSI omitted x_c and the solver's own d lnSI/dn ≥ 0 guard caught it on first contact (its first live catch); (2) refusal paths ABANDONED the buffered cout narration — main flushes now; (3) the importer's closure had never traced catalogue pairs for the v2 `activityModel { model … }` form without inline `binaryParameters` — `validate_staged_agrees` caught the ideal-priced seal (0.299 vs 0.476) before install, the Edwards defect shape refused as designed.  **The S4b duty gap is CLOSED (2026-08-09)** by `tp-stream-energy-coherence.md` slice 1 (R-E3/R-E4): `h_formation` gained its gas-natural → solid view from the record's own declared transition data, the flash prices every crystallised mole on that ONE solid rung (the same leg the balance report reads), and flash21's warm-feed duty is a published golden (−167.4 kW = sensible + fusion; gate arms A10/A11).  **S4b remainder**: the salt-world flash (Pitzer surface grammar) |
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
