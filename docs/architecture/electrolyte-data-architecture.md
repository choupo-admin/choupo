# Choupo — Thermophysical Data Architecture (electrolytes & beyond)

> **Status: SETTLED 2026-07-01.** Design stress-tested through multi-perspective
> AI-assisted review passes and locked by the byte-exact 208-case regression;
> not yet reviewed by a human co-author. Derived **bottom-up** from 10
> real systems, not imposed top-down. This is the canonical, simple statement of
> where every thermophysical fact lives. Supersedes the earlier
> iterations (now in [`archive/`](archive/)) and the basis-map sketch in
> `final-property-architecture.md` on the points where they differ.

> **Implementation addendum (2026-07-16) — how the ratified homes materialised.**
> This document is the DESIGN record; the shipped tree concretised four of its
> homes differently (the normative statement of the current tree is
> [`property-architecture.md`](property-architecture.md) §2):
> * `species/` landed as **ONE catalogue file** `species/aqueous.dat` (45
>   masters), not per-species files — the per-file layout survives only inside
>   sealed case snapshots (`constant/propertyData/`);
> * `phases/solid/` and `chemistry/{salts,mineralSolubility}/` were **retired**
>   — a mineral's dissolution equilibrium, solid thermochemistry and crystal
>   data folded into its own `components/<mineral>.dat` `solidPhases{}` block
>   (one substance = one file; 64 minerals today);
> * `propertyPackages/` as a shared catalogue was **retired 2026-07-15** — the
>   manifest is INLINE in each case's `constant/propertyDict`, and the runtime
>   refuses a `package <name>;` selector ("the package selects the role" holds;
>   the package just lives in the case, not in a catalogue);
> * basis vocabulary: **flowsheet/component basis** vs **aqueous-species
>   basis** — the older "apparent/true" wording below is retained only as
>   historical record of the ratification debate.

## The one idea

A substance never "is" molecular or electrolyte. **The same NaCl plays different
roles; the role is chosen by the `propertyPackage` a case selects, not by the
substance.** Two things vary between simulations, and both are the package's /
method's choice — never a property stored on the substance:

- **REPRESENTATION** — how a component becomes species: *lumped* → *complete
  dissociation* → *partial / ion-pair* → *multi-ion*. A continuum with a knob;
  the **package** turns it.
- **REFERENCE** — what datum the species anchor to: one of four discrete rungs —
  *solid* · *pure-liquid (Raoult)* · *aqueous-infinite-dilution* ·
  *fused-salt (Temkin)*. The **method** selects the rung.
  *(mixed-solvent is NOT a fifth rung — it is aqueous-inf-dilution + a transfer
  term in `parameters/`.)*

The same Na⁺ has an aqueous reference when dissolved and a fused reference when
molten — so `species/` is **medium-agnostic** (Na⁺ is one file) and the method
picks the rung. That is why molten salt is not a special case: it is just another
method (`reference = fused`, `solvent = none`), species unchanged.

## The seven homes

| home | declares | example (NaCl) |
|---|---|---|
| `components/<name>.dat` | identity (name, MW, formula) **+ `dissociatesTo`** — the ion stoichiometry, a formula-like *identity*, not behaviour | `components/NaCl.dat` → `dissociatesTo { Na 1; Cl 1; }` |
| `species/<name>.dat` | model species: charge + `…Thermo{}` blocks **tagged by medium** (`aqueousThermo`, later `fusedThermo`); header "never fed to a flowsheet" | `species/aqueous/Na.dat`, `Cl.dat` |
| `phases/solid/<phase>.dat` | crystalline phase (ρ_p, k_v, polymorphs) | `phases/solid/halite.dat` |
| `chemistry/` | REAL equilibria (stoichiometry + K + ΔH): `dissolution` (solid⇌ions+nH₂O), `association`/`speciation` (has a K) | `chemistry/salts/halite.dat` |
| `parameters/` | model interaction params (Pitzer pairs + mixing θ/ψ, NRTL, fused, transfer terms) — keyed by method | `parameters/electrolyte/pitzer/pairs/Na-Cl.dat` |
| `propertyMethods/<medium>/<model>.dat` | DECLARES the model + its reference rung (never stores the datum value) | `propertyMethods/electrolyte/pitzer.dat` |
| `propertyPackages/<case>.dat` | **SELECTS** all of the above; activates the representation; one per scenario; a pure manifest (references, never values) | `propertyPackages/aqueousNaCl_pitzer.dat` |

**The flow:** `propertyPackage` declares → `ThermoPackageBuilder` assembles
(loads, never estimates) → `ThermoPackage` computes → unit ops.
The reference DAG is acyclic; the package is a manifest, not a god-object.

**Honesty note — declared vs load-bearing.** Today the builder DISPATCHES on the
package's `propertyMethods.liquid` string; it loads the method record, asserts
`requires.ionSpecies`, and echoes the declared `referenceBasis` — the rung is a
visible declaration, not yet mechanically consumed in the γ/enthalpy math (that
consumption is roadmap). A `propertySets/` kind existed briefly as a declared
output spec with zero readers; it was deleted 2026-07-01 — a future feature is a
roadmap note, not a data kind.

## Why it is validated: the 10 systems it was built from

Fixed component set {NaCl, MgSO₄, water, ethanol}. Every scenario is one package;
all fit without a special branch:

| # | system | representation | reference | homes exercised |
|---|---|---|---|---|
| 1 | NaCl drying | lumped | solid | components, phases/solid |
| 2 | water+ethanol distillation | molecular | Raoult | components, parameters (NRTL) |
| 3 | NaCl+water screening | lumped (ν=2) | — | components |
| 4 | NaCl+water | complete dissociation | aqueous | + species, chemistry/dissolution, parameters |
| 5 | MgSO₄+water | **partial** (ion pair MgSO₄⁰, has K) | aqueous | + chemistry/association |
| 6 | NaCl+MgSO₄+water | multi-ion speciation | aqueous | + parameters/mixing (θ,ψ) |
| 7 | NaCl+water+ethanol | complete, **antisolvent** | **mixed** (aqueous + transfer term) | + parameters transfer term |
| 8 | MgSO₄+water+ethanol | complete, **hydrate** epsomite·7H₂O | mixed | chemistry/dissolution carries +7H₂O |
| 9 | NaCl molten | complete | **fused** (Temkin) | method selects fused rung; no water |
| 10 | NaCl+MgSO₄ molten eutectic | multi-ion | fused | — |

The MgSO₄ ion pair (#5) and epsomite hydrate (#8) prove the key point: the
"dissociation" is a genuine **chemistry** equilibrium (it has a K, ΔG, extent)
the moment it is partial or hydrated. Only the *complete, K-free* split is a plain
stoichiometric identity — and that lives as `dissociatesTo` on the component.

## The settled decisions

1. **Complete dissociation `NaCl→Na+Cl` is `dissociatesTo` on `components/<salt>.dat`**
   — a formula-like identity (no K, no model, no solubility → *not* the old
   "everything-in-the-component bag"). The package activates it; when there is a
   K (ion pair, hydrate) the equilibrium lives in `chemistry/`. (Owner-approved:
   *"a estequiometria dentro de components fica mesmo bem"*.)
2. **The reference datum value lives in the species, medium-tagged; the method
   selects the rung** — species carries no loose `hf`.
3. **`species/` is medium-agnostic** — one Na⁺ file serves aqueous and molten.
4. **Seven homes, no ceremony** — no top-level `basisMaps/` (it is the K→∞ limit
   of dissociation, and is per-(component,method), so it is not a kind of its
   own); no `propertySets/` (zero readers — deleted rather than kept as theatre).

## Rejected (do not reopen)

Two `NaCl.dat` files (an "apparent" one + a molecular one) — they compete
mentally; **the `components/apparent/*` records are deleted, the builder reads
identity from `components/`.** The term **"true species"** (it lies — the ion is
not more real than the salt; it is the speciation the model postulates) — replaced
by *model / solver species*. A top-level `basisMaps/` folder. Per-medium species
duplication (`species/aqueous/Na` + `species/fused/Na`). mixed-solvent as a fifth
reference rung.

## The cross-method seam is tested

The central claim — *reference lives in the method, not the substance* — is put
under load where a stream crosses a **model boundary inside a recycle**.
`tutorials/steady/crystallisation/crystalliser09_dignified` does exactly that: an
antisolvent crystalliser on the **eNRTL** global package feeds a solvent-recovery
distillation carrying its **own NRTL** model (per-unit `thermo{}` override), and
the recovered ethanol recycles back through a Newton tear. The run prints the
**model-boundary audit** ("H conserved; T is the model-dependent readout") and the
per-unit cascade ("inherited (global package)" vs "LOCAL override
activityModel=NRTL"). So the eNRTL↔NRTL seam is not merely designed — it converges
and is audited in a shipped golden case.

## Reproducibility of lean cases

A lean case carries no data copy — it *selects* from `data/standards/`. What pins
it to the catalogue it was validated against? **The repository version, exactly as
in OpenFOAM.** The cases and the catalogue live in the *same* git tree: checking
out tag `choupo-2606` gives you both the case dicts and the `data/standards/` they
were golden-recorded against, together. There is no per-case `catalogueVersion`
field because there is no independent catalogue to drift — a case and its data
move as one commit. `bin/runTests` re-verifies every golden against the catalogue
in the same checkout, so a curation commit that changes a value fails the golden
loudly rather than silently altering a past result. (If a case must be shipped
*outside* the repo, it can still copy its `constant/` data — self-contained stays
the portable option, just not the default; see the credo note.)

## Implementation status (branch `feat/solution-directory`)

Done and green (202/0 regression, byte-exact):
- **F1** `components/true/` → `species/`
- **F2** `species/solids/` → `phases/solid/`
- **F3** `true` purged from the 41 species records (`recordType modelSpecies` +
  "never fed to a flowsheet" header) and from the method `requires` block
  (`trueSpecies` → `ionSpecies`)
- **F4** `dissociatesTo` added to `components/{NaCl,NaOH,KCl}.dat`;
  `ThermoPackageBuilder` rewritten to read salt identity + `dissociatesTo` from
  `components/`, solid from `phases/solid/`, anchor from `chemistry/salts/`;
  **`components/apparent/*` deleted**; the orphan `compatibility` block removed
  from the packages.

Open (naming polish, deliberately deferred — the composition BASIS, not "true
species"): the package's `apparentToTrue` / `componentApproach apparent` and the
`trueComposition` property set describe the *dissociated composition basis* (a
legitimate output axis); a future rename to `dissociatedComposition` /
`componentApproach apparent|dissociated` would complete the vocabulary. `species/`
still keeps an `aqueous/` subfolder (harmless; the medium tag lives in-file). No
`fusedThermo` species blocks yet (no molten case ships) — the structure accepts
them when the first melt lands.
