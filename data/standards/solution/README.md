# `data/standards/solution/` — the aqueous (and other-solvent) solution tier

The **molecular-solute sibling** of the ionic `electrolyte/ions.dat` tier
(which carries `hfAq / sAq / cpAq` for ions). This catalogue holds the
**solution thermo of MOLECULAR solutes** — the numbers whose *definition*
names a **partner solvent**, so by the data-governance Golden Rule (arity-2)
they are **catalogue data, never a slot in the component `.dat`**.

```
solution/<solute>-<solvent>.dat
```

## Why a catalogue, not the component file

A heat of solution is defined as `crystal → species dissolved IN water`. The
definition forces you to name a **second species** (water), so it fails the
arity-1 intrinsic test. Putting it in `sucrose.dat` with water *implied* is
the Aspen black-box sin in miniature: a student opening `sucrose.dat` cannot
see that a second species was silently assumed, then runs an ethanol-solvent
case and inherits a water number with no warning. **Forbidden.** The component
`.dat` keeps only arity-1 intrinsics (crystalline `gibbsFormation`,
`solidHeatCapacity`, `liquidHeatCapacity`, `MW`, `Vliq`, `solid{}`) and
references this tier **by name**.

## What each file carries

| key | meaning |
|---|---|
| `solute` / `solvent` | the keyed pair (`<solute>-<solvent>` is the lookup key) |
| `dHsoln` | standard enthalpy of solution Δh°_soln [J/mol], **crystal → aqueous, ∞ dilution, 298 K** (endothermic ⇒ positive) |
| `Cp` | the aqueous (dissolved-solute) molar heat capacity [J/mol/K] |
| `provenance { origin; method; }` | per-value origin + the PRIMARY citation |

The engine reads `dHsoln` for the **dissolved-vs-crystalline enthalpy rung**:

```
h°(crystal,  T) = Δh°_f,cryst + ∫_298^T cp_solid dT'          [solid rung,    Component.dat]
h°(aqueous,  T) = Δh°_f,cryst + Δh°_soln + ∫_298^T cp_aq dT'  [aqueous rung,  THIS tier]
```

so the **heat of crystallisation EMERGES** as `h°_solid − h°_aq ≈ −Δh°_soln`
from ONE sourced number — never a second hand-entered constant.

## The default-solvent rule (the convenience, delivered honestly)

The `thermoPackage` declares its solvent once (`solvent water;`, already used
for Henry's law). When a solution property is needed and no solvent is named
at the call site, the resolver uses the default **and announces it on every
run**:

```
[thermo] dHsoln(sucrose): solvent not named -> DEFAULT = water;
         solution/sucrose-water.dat  [Putnam & Kilday 1986]
```

Off-default with no matching pair → **fail with a remedy** (never silently
substitute the water number — the no-silent-crutch credo, applied to solvents).

## Catalogue

| file | dHsoln | source |
|---|---|---|
| `sucrose-water.dat` | +5.40 kJ/mol | Putnam & Kilday, *J. Res. NBS* 91(4) (1986) 219 |

**Deferred (no clean PRIMARY cite found this pass):** `glucose-water.dat`
(≈ +11 kJ/mol α-D-glucose is widely quoted but the primary calorimetric
study was not located cleanly — left to a curation act rather than shipping
an aggregator-arranged value).

## Licence

Per-file. The sucrose entry derives from a U.S. Government (NBS) work
(Putnam & Kilday 1986) — **PUBLIC DOMAIN** — the same calorimetric study
already cited for sucrose's `solidHeatCapacity`, so the crystal Cp and the
heat of solution come from one study on one material.
