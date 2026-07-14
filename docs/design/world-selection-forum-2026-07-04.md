# Forum — WHO selects the VLE "world" (γ-φ / Henry / φ-φ)? (2026-07-04)

**Convened by:** the loop rule (Vítor: "em caso de dúvida convoca o fórum").
**The doubt:** step 3 of the φ-φ arc needs a trigger for K = φ^L/φ^V.  The
implementer's draft ("cubic EoS declared AND no solution{} → φ-φ") is a
HEURISTIC — the panel was asked to replace it with a declaration.

## The verdict (5/5): THE LIQUID METHOD SLOT *IS* THE WORLD

No inference, no heuristic, no hidden flag.  The package's
`propertyMethods.liquid` already declares what the liquid phase IS — that
declaration selects the world:

| `propertyMethods.liquid`     | World | K-value |
|---|---|---|
| `activity.<model>`           | 1 (γ-φ)      | K = γ·Psat/(φ^V·P) |
| `solution.henryDilute`       | 1.5 (Henry)  | solvent Raoult · solutes γ*·H·Poy/(φ^V·P) |
| `eos.<Model>`  **(NEW)**     | 2 (φ-φ)      | K = φ^L/φ^V, SAME cubic both phases |
| `electrolyte.<model>`        | electrolyte  | speciation path (unchanged) |

- **φ-φ is an explicit OPT-IN**: `liquid eos.SRK; vapour eos.SRK;` — the same
  Gibbs surface for both phases (the one-surface theorem satisfied trivially).
  A legacy flat `thermoPackage` (activityModel + equationOfState) stays γ-φ /
  Henry exactly as declared — ZERO golden risk, no case changes meaning.
- **Mixed slots are ILLEGAL and refused**: `liquid eos.SRK; vapour eos.PengRobinson;`
  is two surfaces pretending to be one VLE — refuse at assembly, naming both.
  (`liquid eos.X; vapour builtin.idealGas;` likewise.)
- The `eos.<Model>` record's referenceBasis: BOTH phases on
  `idealGasReference` + the departure — thermodynamically exact for a cubic
  (G = G_ig + departure; one surface, two roots).

## Numerics (Prof. D/E, binding)

1. Seed and SCREEN with the Michelsen `StabilityTest` (already in
   `src/solver/`): reject the trivial root (x=y) — if the TPD says one phase,
   report single-phase honestly instead of a fake split.
2. Successive substitution on lnK with acceleration + iteration cap; on
   failure REFUSE loudly (no silent fallback to Raoult — crossing worlds
   silently is the cardinal sin).
3. Announce the world in the flash log, always:
   `VLE world: phi-phi (SRK both phases; kij: N2-CH4 0.0289 DECHEMA VI)`.

## Validation (binding)

N2-CH4 VLE vs measured isotherms (DOI Crossref-verified before use), with the
step-1 kij — the same standard as Wiebe/Larson for Henry.

## Rejected

- "EoS declared → φ-φ" inference (breaks the ammonia-class packages that
  legitimately want SRK vapour + Henry liquid).
- A `world` keyword (redundant — the liquid slot already says it).
- Silent Raoult fallback on non-convergence.
