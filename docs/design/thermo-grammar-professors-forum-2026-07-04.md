# Professors' forum — the COMPLETE thermophysics declaration grammar (2026-07-04)

**Convened by:** Vítor, two directives: (1) *"parar de apagar fogos e consolidar
a arquitetura termofísica"*; (2) *"para além do thermo default, pode haver forma
de especificar os modelos termodinâmicos por componente ou conjunto de
componentes? O fórum é que deve definir isto."*  The NH₃ process is explicitly
OUT of scope for this phase — this forum defines the GRAMMAR; processes come
later.

Panel: the same five archetypal chairs as the flash forum (molecular/statistical
thermo; applied phase equilibria; electrolyte; EoS development; process
systems).

---

## 1. The central theorem the panel ratifies first

> **ONE Gibbs-energy surface per phase; many CONVENTIONS on that surface.**

Everything legal and illegal about "thermo per component" follows from it:

- A phase's fugacities must all derive from ONE model of that phase's Gibbs
  energy — otherwise Gibbs-Duhem is violated and mass/energy balances silently
  leak (the model-boundary rule's compositional twin).  **ILLEGAL, therefore:**
  half the liquid on NRTL and half on UNIQUAC; two EoS mixed in one vapour;
  any "per-component γ-model" within a phase.
- A **reference convention** (symmetric γ→1 as x→1; unsymmetric γ*→1 as x→0;
  ion aqueous-infinite-dilution; fused-salt Temkin) is a NORMALISATION of the
  same surface, not a different surface.  **LEGAL, therefore:** different
  components of ONE phase carrying different conventions — the solvent
  symmetric, the dissolved gases unsymmetric (Henry), the ions on the aqueous
  rung with molecular water beside them.  Gibbs-Duhem is satisfied because the
  underlying surface is one.
- **Input correlations are per-component by nature** (Antoine/Wagner, Cp(T),
  ρ_p): they are DATA about a pure species, not a mixture surface.  Already so
  in Choupo; no change.
- **Parameters are per-pair by nature** (NRTL a_ij, kij, Henry H(T), Pitzer
  β): they are data about an interaction.  Already so; no change.

So Vítor's question has a precise answer: **models per PHASE; conventions
(reference rungs) per COMPONENT-GROUP within the phase; correlations per
COMPONENT; parameters per PAIR.**  Plus the pre-existing spatial axis: a
per-UNIT `thermo {}` override selects a different PACKAGE for one unit (the
model-boundary audit covers the seam).  Five axes, each with its home — nothing
else is legal.

## 2. The ratified grammar (the four record families, uniform)

### propertyMethod — one record shape for EVERY family
```
recordType propertyMethod;   name <name>;   family activity|electrolyte|solution|eos;
referenceBasis
{
    <phase>
    {
        <group> { rung <rung>; convention "<normalisation>"; }   // >=1 group
        ...
    }
    ...
}
requires { <what the method needs: pairs, species, charges...>; }
provides { <what it computes>; }
```
**AMENDMENT A1 (ratified 5/5): per-GROUP rungs inside a phase.**  U2 declared
the rung per phase; the dilute-solution structure needs groups (solvent /
solutes; water / ions).  The electrolyte methods already do this implicitly —
the grammar now says it explicitly.  A method with one group keeps the old
shape (a degenerate group).

### propertyPackage — the manifest a case SELECTS
```
recordType propertyPackage;   name <name>;
components      ( ... );
propertyMethods { liquid <family>.<name>;  vapour <family>.<name>;
                  transport <name>; }                  // per PHASE (+transport)
solution        { solvent <c>;  solutes ( <c> ... ); } // per GROUP (when the
                                                       //   liquid method needs it)
parameters      { <kind> { <pair> "<path>"; ... } }    // per PAIR, DECLARED paths
```
**AMENDMENT A2 (ratified): `vapour` names a real method** (`eos.SRK`,
`eos.PengRobinson`, `builtin.idealGas`) and **`transport` is a first-class
method slot** — no more flat `equationOfState{}`/`transport{}` folklore keys in
the user-facing record.
**AMENDMENT A3 (ratified): declared parameters are VERIFIED at assembly** —
a declared pair whose file is missing REFUSES loudly (U3 applied to every
family); an undeclared pair that would be needed also refuses, naming the file
to add.

### The runtime split stays as ratified (U1)
`propertyPackage` = declarative source · `ThermoPackageBuilder` = assembler
(loads, verifies, announces, NEVER estimates) · `ThermoPackage` = runtime
compute.  The legacy `thermoPackage` remains the degenerate form forever;
assembly-level keys the Builder writes (e.g. `solutes`) are plumbing, not the
user convention.

## 3. Per-chair verdicts (condensed)

- **Molecular/statistical:** the one-surface theorem is the non-negotiable;
  conventions-per-group is textbook (unsymmetric convention IS a per-group
  normalisation).  Approves A1.
- **Applied phase equilibria:** insists the `solution{}` block name BOTH sides
  (solvent AND solutes) — no heuristics ("largest MW is the solvent" must
  die; keep it only as a LOUD legacy fallback).  Approves A2, A3.
- **Electrolyte:** confirms the electrolyte methods already fit the per-group
  grammar (water molecular + ions aqueous-rung); asks only that the grammar
  never force "aqueous" as a default (U2 already forbids it).
- **EoS development:** `vapour eos.<name>` must carry its OWN parameters slot
  eventually (kij) — records the hook, defers the kij databank to the flash
  φ-φ arc.
- **Process systems:** the Builder must ANNOUNCE the whole assembly in one
  readable block at startup (package name, methods per phase, groups, pairs
  loaded with sources) — the run log is where a student reads the case's
  thermo.  Error messages must name the missing FILE, not the missing concept.

## 4. What this closes and what stays open

**Closed:** the grammar (A1-A3); the five-axes answer to per-component thermo;
the one-surface theorem as the legality test; solution{} as the per-group
declaration; verified-declared parameters.

**Open (deferred, in order):** the kij databank for `eos.*` (flash φ-φ arc);
case-local propertyPackage records (self-contained credo — needs its own
short forum); migration of legacy dicts (opt-in per case, never forced);
SAFT/CPA family.

**Next step (this loop):** implement the consolidated grammar generically —
method records for the `solution` family + `eos`/`transport` slots, Builder
generalisation, exercised on MINIMAL cases (CO₂-water Henry; ethanol-water
NRTL) — NOT the ammonia plant (Vítor: fica para depois).  Then the students'
forum on readability.
