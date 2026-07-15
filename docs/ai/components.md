# Standard catalogue — what ships in `data/standards/`

<!-- BEGIN-PROSE -->
Inventory snapshot, regenerated from `data/standards/components/`.
When composing a property package (`constant/propertyDict`), pick component names from this list
(case-sensitive).  Adding a new component is a project-level act, not
a per-case one --- case-local overlays (axiom 4) can refine
sample-specific **blocks** but NOT MW / Tc / Pc.

The overlay merges **block-by-block** (top-level-key-by-key), NOT
field-by-field inside a sub-dict: an overlay carrying `solid { rho_p 1610; }`
replaces the **whole** `solid{}` block (the standard's `k_v` is lost, not
deep-merged).  A reference-state block is the atomic unit of physical meaning;
the curator MUST copy the whole block they refine.  A lone-scalar overlay is
the forbidden **hidden hybrid** (it would silently mix a sample's `rho_p` with
the catalogue's `k_v`).  See [`data-doctrine.md`](data-doctrine.md) §3.

**Dissolved-solute / solution thermo is PAIR data, not a component field.**
A property whose definition names a **solvent** — an "in-water" ΔH_soln, an
aqueous Hf°, a solubility curve — is arity-2 and lives in a **catalogue**
(`data/standards/solution/<solute>-<solvent>.dat` for molecular solutes;
`data/standards/species/aqueous/` for the ∞-dilution ion tier), referenced
by name, never copied into `<name>.dat`.  The solvent is always **named**, not
implied (`data-doctrine.md` §2).

**Henry behaviour: the ROLE is selected by the package, not stored on the
substance.**  The `role solute;` flag in a `.dat` (the "Soluble gas" table
below) is the legacy flat-`thermoPackage` trigger.  The modern route is the
`propertyPackage` `solution { solvent water; solutes ( CO2 ); }` block (the
`solution.henryDilute` world) — the PACKAGE declares WHO dissolves in WHAT,
the pair files are declared in `parameters.henryPairs` (the Henry's-law
pairs table below names the shipped files), and a declared-but-missing pair
REFUSES at assembly.  See `thermo.md` → "propertyPackage".

*56 components currently shipped.*
<!-- END-PROSE -->

## Extended catalogue (`data/local/`)

Choupo also ships an **extended, unverified tier**. At the current snapshot the
file-level inventory is 194 records in `data/standards/components/` and 625 in
`data/local/components/`; overlapping names and identities mean these counts
must not be added and advertised as an equal-quality compound total. The GUI
shows proposals separately and the engine prints `[local]` whenever one is
actually used.

The ChemSep v8.3 import contributes 279 new proposal files after CAS
deduplication. Each carries the source-file SHA-256, Artistic-2.0 licence,
record name and per-property `Origin`. The imported pure-component skeleton is
normally:

- `MW`, `Tc`, `Pc`, `omega`, `Tb`: source database values, `origin literature`;
- `vaporPressure`: **predictive** Ambrose-Walton from `Tc/Pc/omega`, not a
  measured vapour-pressure correlation;
- `Cp`, formation thermochemistry, transport, `Vliq`, Joback and UNIFAC groups:
  absent unless another explicitly identified source already supplied them.

Therefore these records are useful for screening flashes and cubic-EOS work,
but a component with missing Cp/formation data is not ready for an energy or
reaction calculation. Run the gap report and inspect the Property Explorer
provenance before choosing one.

ChemSep also stages 748 NRTL/UNIQUAC/Wilson records under
`data/local/binaryPairs/`. Pair resolution is lower-precedence than the
standard library and is announced as `[local]`; missing pairs still
ideal-default loudly. The records passed the deterministic identity, source
hash and unit-conversion audit in `data/local/CHEMSEP-PAIR-AUDIT.md`, but
their imported DECHEMA parameters have no captured temperature range and must
be checked against project VLE data before design use.

Maintainer regeneration and gates:

```sh
python3 bin/curate/chemsep_to_choupo.py --dry-run
python3 bin/curate/chemsep_to_choupo.py
python3 bin/curate/reconcile_chemsep_collisions.py --prune-resolved
python3 bin/curate/audit_proposed.py
python3 bin/curate/validate_components.py
python3 bin/curate/audit_chemsep_pairs.py
```

<!-- AUTO-GENERATED below this line by bin/regen-llm-docs. -->
<!-- Edit the .dat files in data/standards/components/, then re-run. -->

## Components (56 entries)

### Volatile (curated for VLE)

| Name | MW | role | Psat | Cp_ig | Cp_liq | gibbsFormation | solid | solubility | sorption | Vliq | Notes |
|---|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `aceticAcid` | 60.052 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `Ar` | 39.948 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `benzene` | 78.114 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | φ_WC, μ_L |
| `C2H2` | 26.038 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `C2H4` | 28.054 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `C2H6` | 30.070 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `C3H6` | 42.081 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `C3H8` | 44.097 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `C4H10` | 58.123 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `C8H18` | 114.231 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `CO` | 28.010 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ | Σv_F |
| `compA` | 30.0 | (volatile) | ✓ | ✓ | ✓ | — | — | — | — | ✓ |   |
| `compB` | 50.0 | (volatile) | ✓ | ✓ | ✓ | — | — | — | — | ✓ |   |
| `compC` | 50.0 | (volatile) | ✓ | ✓ | ✓ | — | — | — | — | ✓ |   |
| `ethanol` | 46.069 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | φ_WC, μ_L |
| `ethylAcetate` | 88.106 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `H2` | 2.016 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ | Σv_F |
| `H2O2` | 34.0147 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `HCHO` | 30.026 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `HCN` | 27.026 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `He` | 4.0026 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `methanol` | 32.042 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | φ_WC, μ_L |
| `N2` | 28.013 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | Σv_F |
| `N2O` | 44.013 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `nButanol` | 74.122 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nHexane` | 86.178 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `NO` | 30.006 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `NO2` | 46.006 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `O2` | 31.999 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ | Σv_F |
| `O3` | 47.9982 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `toluene` | 92.141 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | φ_WC, μ_L |
| `water` | 18.015 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | φ_WC, Σv_F, μ_L |

### Permanent gas / combustion species

| Name | MW | role | Psat | Cp_ig | Cp_liq | gibbsFormation | solid | solubility | sorption | Vliq | Notes |
|---|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `C` | 12.011 | (volatile) | — | ✓ | — | ✓ | — | — | — | — |   |
| `CH3` | 15.0345 | (volatile) | — | ✓ | — | ✓ | — | — | — | — |   |
| `H` | 1.008 | (volatile) | — | ✓ | — | ✓ | — | — | — | — |   |
| `HO2` | 33.0067 | (volatile) | — | ✓ | — | ✓ | — | — | — | — |   |
| `N` | 14.007 | (volatile) | — | ✓ | — | ✓ | — | — | — | — |   |
| `NH` | 15.0146 | (volatile) | — | ✓ | — | ✓ | — | — | — | — |   |
| `NH2` | 16.0226 | (volatile) | — | ✓ | — | ✓ | — | — | — | — |   |
| `O` | 15.999 | (volatile) | — | ✓ | — | ✓ | — | — | — | — |   |
| `OH` | 17.008 | (volatile) | — | ✓ | — | ✓ | — | — | — | — |   |

### Soluble gas (Henry)

| Name | MW | role | Psat | Cp_ig | Cp_liq | gibbsFormation | solid | solubility | sorption | Vliq | Notes |
|---|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `CH4` | 16.043 | solute | ✓ | ✓ | — | ✓ | — | — | — | ✓ | Σv_F |
| `Cl2` | 70.906 | solute | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `CO2` | 44.010 | solute | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | Σv_F |
| `H2S` | 34.082 | solute | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `HCl` | 36.461 | solute | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `NH3` | 17.030 | solute | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `SO2` | 64.065 | solute | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |

### Non-volatile solute

| Name | MW | role | Psat | Cp_ig | Cp_liq | gibbsFormation | solid | solubility | sorption | Vliq | Notes |
|---|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `dowthermA` | 165.8 | nonvolatile | — | — | ✓ | — | — | — | — | ✓ |   |
| `hitecSalt` | 87.4 | nonvolatile | — | — | ✓ | — | — | — | — | ✓ |   |
| `propyleneGlycol30` | 36.6 | nonvolatile | — | — | ✓ | — | — | — | — | ✓ |   |

### Crystallising solute

| Name | MW | role | Psat | Cp_ig | Cp_liq | gibbsFormation | solid | solubility | sorption | Vliq | Notes |
|---|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `sucrose` | 342.297 | nonvolatile | — | — | ✓ | ✓ | ✓ | ✓ | — | ✓ |   |

### Solids-only / pseudo-component

| Name | MW | role | Psat | Cp_ig | Cp_liq | gibbsFormation | solid | solubility | sorption | Vliq | Notes |
|---|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `silica` | 60.08 | nonvolatile | — | — | — | — | ✓ | — | — | — |   |

### Other

| Name | MW | role | Psat | Cp_ig | Cp_liq | gibbsFormation | solid | solubility | sorption | Vliq | Notes |
|---|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `glucose` | 180.16 | nonvolatile | — | — | — | — | — | — | — | — |   |
| `MgSO4` | 120.37 | nonvolatile | — | — | — | — | — | — | — | — | ν=2 |
| `NaCl` | 58.44 | nonvolatile | — | — | — | — | — | — | — | — | ν=2 |

## Henry's-law pairs

Each ships van't Hoff temperature dependence.

| Name |
|---|
| `CH4-water` |
| `CO2-water` |
| `Cl2-water` |
| `H2S-water` |
| `HCl-water` |
| `NH3-water` |
| `O2-water` |
| `SO2-water` |
## Membranes

Each carries A_w + per-solute B_s + ratings (P_max, T_max, pH, MWCO).

| Name |
|---|
| `NF270` |
| `SW30HR` |
## Materials

Each carries ρ, F_M (Guthrie), σ_y, max T, max P.

| Name |
|---|
| `SS304` |
| `SS316` |
| `aluminium` |
| `carbonSteel` |

## Field glossary (what each block on a component means)

- `MW`, `Tc`, `Pc`, `omega`, `Tb`, `Hvap_Tb` — universal pure-compound (axiom 1).
- `Vliq` — liquid molar volume (apparent for solutes).
- `vaporPressure { model... }` — Psat(T) for VLE/flash. Two models:
  - `Antoine` — `log10(Psat[bar]) = A − B/(T + C)`; `coefficients (A B C); Trange (Tmin Tmax);`. The data-fit route (measure or `choupoProps vaporPressureFit`).
  - `AmbroseWalton` — corresponding-states PREDICTION from `Tc`, `Pc`, `omega` ALONE (taken from the component automatically — declare them once; no extra keys). Closes the Psat gap of a Joback estimate so an estimated component is **flashable without measured data**. It is an ESTIMATE: ~3 % near Tb, degrading at low reduced T and for polar/associating species — overlay vs data before design use (see `tutorials/props/compare/compare_psat_ambrose_walton`).
- `idealGasHeatCapacity { coefficients (a1 a2... ); }` — for H_ig, S_ig.
- `liquidHeatCapacity { coefficients (... ); }` — for sensible H_liq.
- `gibbsFormation { dHf_298; s_298; phase; }` — for K_eq, adiabatic flames, **the isothermal reactor duty / heat of reaction**, and elements-reference stream enthalpy. **Every reacting species in a reactor needs this block** — it is the single enthalpy base for the heat of reaction (`dH_rxn = Σ νᵢ·hᵢ(T)`); without it the heat of reaction is dropped (steady reactors, announced) or falls back to the dict `dH_rxn` override (batch/dynamic). The optional `phase` keyword (`gas` / `liquid` / `solid`) tells the solver in which phase `dHf_298` is tabulated; if omitted it defaults to `gas` (the NIST / JANAF convention). Set it explicitly for any new component, and use `solid` for crystalline non-volatiles like sucrose whose Hf cannot honestly be referenced to gas. Throws clearly at `h_formation` time if the matching Cp model is absent (gas needs `idealGasHeatCapacity`; liquid + solid need `liquidHeatCapacity`).
- `diffusionVolume <Sigma_v>;` — for Fuller diffusivity.
- `liquidViscosity { andrade {... } vogel {... } }` — model-specific.
- `associationFactor <phi>;` — for Wilke-Chang liquid diffusivity.
- `solubility { coefficients (a b c ); dHcryst; }` — c_sat(T), for crystalliser.
- `solid { rho_p; k_v; }` — for solids (cyclone / crystalliser / sprayDryer).
- `sorption { Xm; C; K; }` — GAB isotherm  **(typically case-local, axiom 4)**.
- `role <volatile|solute|nonvolatile|radical>;` — drives K-value choice.
- `dissociation <nu>;` — ions per formula (for osmotic pressure).
- `electrolyte { cation <ion>; anion <ion>; solubility <m_sat>; dissolutionEnthalpy <J/mol>; }`
  — a dissociating salt for the `pitzer` / `eNRTL` activity models (ions index
  `data/standards/electrolyte/{ions,pairs,enrtl}.dat`). `solubility` is the measured
  m_sat [mol/kg] at 25 °C; the optional `dissolutionEnthalpy` [J/mol] sets the
  van't Hoff temperature shift of the solubility product `Ksp(T)` (omit it and `Ksp`
  is held flat in T — fine for NaCl, whose solubility is nearly T-independent).
  - **Self-contained cases:** the ion charges (`ions.dat`) and the pair parameters
    (`pairs.dat` for Pitzer β, `enrtl.dat` for eNRTL τ) resolve **case-local first** —
    drop the entries you use into `<case>/constant/electrolyte/{ions,pairs,enrtl}.dat`
    and the case carries every parameter the solver reads (the standard catalogue
    fills any entry you did not localise; a `[overlay]` line announces the shadowing).
    Same mechanism as `constant/components/<name>.dat` for the components.
- `relativePermittivity <eps>;` — static dielectric constant (25 °C); on an
  **antisolvent** (e.g. ethanol 24.3) it drives the mixed-solvent eNRTL
  (drowning-out). The electrolyte models are temperature-dependent: `eps_w(T)` /
  `rho_w(T)` (Malmberg-Maryott / Kell) set `A_DH(T)`, and `tau(T)=tau_25·298.15/T`.


## The reference-state layout (NEW component .dats — forum 2026-06-11)

New `.dat` files group data by **declared reference state** — the file reads as
the γ-φ equation itself (legacy flat files stay valid forever; never mix the
two forms for one datum — the loader refuses loudly):

```
identity   { name  formula  CAS  MW }            // who
critical   { Tc  Pc  omega }                     // the fluid's corresponding-states anchor (Pc in bar)
gasIdeal   { Hf_298  S_298  Cp{...} }            // ideal-gas reference = the formation datum (phase keyword dies)
liquidPure { Tb  HvapTb  Vliq  Psat{...}  Cp{...} }   // symmetric (Raoult) reference; Psat IS f°(T)
solid      { Hf_298  S_298  rho_p  k_v  forms(...) }  // crystallising species; hydrates/polymorphs in forms
aqueousInfDil { ... }                            // ∞-dilution ion tier (electrolyte-enthalpy build)
electrolyte{ cation anion solubility dissolutionEnthalpy provenance{...} }   // unchanged
anchors    { K_f ... }                           // measured anchors; K_b is DERIVED (R·Tb²·MW/HvapTb), not stored
transport  { diffusionVolume associationFactor liquidViscosity{...} }        // kinetic branch
```

Unit comment on every scalar line is mandatory.  First natives:
`data/standards/components/NaOH.dat`, `CaCl2.dat`; estimate proposals are now
born in this layout.


## Pseudo-components (petroleum cuts, polymers) — a lump, NOT a molecule

A **pseudo-component** is an ordinary component `.dat`, resolved by **exact
name** like any other — but it represents a **LUMP** (a petroleum cut of
hundreds of species; a polymer as one average chain) with **no single
molecular structure**.  There is **no new component type**: a pseudo-component
is just a `.dat` that carries **only the fields a lump can honestly own**, via
the reference-state dual-reader above:

```
identity   { MW }                       // a lump AVERAGE molar mass
critical   { Tc  Pc  omega }            // corresponding-states constants of the cut
gasIdeal   { Cp{...} }                  // ideal-gas Cp (NO Hf_298 / S_298)
liquidPure { Tb  Vliq  Cp{...}  Psat{ model AmbroseWalton; } }
// optional:  role nonvolatile;   solid { rho_p; }
```

It deliberately **OMITS**:

- **`formula` / `CAS`** — there is no single molecule to name;
- **`gibbsFormation`** — a formation datum needs a stoichiometric reaction, and
  a lump has none.  (So a pseudo-component **cannot** appear in a Gibbs reactor
  or carry a heat of reaction — it does **sensible** energy balances only.)

It still **FLASHES** (`critical{}` + Ambrose-Walton `Psat`) and **closes a
sensible energy balance** (`gasIdeal` / `liquidPure` `Cp`), with **no measured
data**.

The provenance block must **SCREAM** that it is lumped and estimated:

```
provenance
{
    status   "ESTIMATE";
    origin   estimated;
    lumped   true;
    method   "Riazi-Daubert (1987) from (Tb,SG); omega Lee-Kesler; Cp Kesler-Lee";
    note     "petroleum pseudo-component, NOT a real species";
}
```

The engine reads `provenance.status` / `provenance.lumped` and prints a loud
`[estimate] component '<name>' carries an ESTIMATE provenance ...` line on every
run that uses it — an unvalidated lump never hides.

Worked example (self-contained, FLASHES + closes an energy balance):
`tutorials/steady/flash/flash_pseudoComponent_petCut`.

### The structure is identity — `jobackGroups` + `bin/estimate` (no case needed)

A molecular component's Joback groups live **in its own `.dat`**, like the
formula (sibling of the UNIFAC `groups {}` block — different table, same idea):

```
jobackGroups { CH3 2; ketone 1; }     // acetone = 2 x CH3 + 1 x >C=O
```

Any component that declares them is estimable with **one command, zero case
ceremony**:

```bash
bin/estimate acetone            # resolves case-local, then data/standards/
bin/estimate path/to/new.dat    # or an explicit file
```

Prints the full glass-box build-up and drops ONE stable proposal
(`<name>.estimated.dat`) next to the source — review, then promote by hand.
Never writes into `data/standards/`; the solver never estimates at runtime.
The `estimateComponent` op still accepts inline `groups (...)` when the
estimate itself is the lesson (`tutorials/props/estimate/estimate_acetone`).

### Estimating a petroleum cut from (Tb, SG) — `model RiaziDaubert;`

A crude assay reports each cut's **normal boiling point Tb** and **specific
gravity SG**, not its groups.  The **Riazi-Daubert (1987)** correlations turn
`(Tb, SG)` into `(MW, Tc, Pc, Vc)`; `omega` follows by Lee-Kesler and the
ideal-gas `Cp` by Kesler-Lee (1976).  This is the **SCALAR-input** sibling of
the Joback **group** path (a lump has no group decomposition) — selected via the
same `estimateComponent` op with `model RiaziDaubert;` and an `anchors` block
instead of `groups`:

```
{
    type        estimateComponent;
    model       RiaziDaubert;        // scalar-input estimator (Tb, SG)
    component   petCut_C7plus;
    anchors     { Tb 447.3 K;  SG 0.730; }
    output      { proposal auto; }   // writes a reviewable .estimate-<date>.dat
}
```

It writes a glass-box proposal whose provenance screams `status ESTIMATE /
lumped true`; you review it, then **promote** it with the printed `mv` into
`constant/components/`.  Cross-checked against n-decane (the nearest real
species at this Tb/SG): **Tc** lands ~exact, **omega** within ~2 %, **MW** / **Pc**
within the correlation's stated ~6 %.  Primary source — cite this, not an
aggregator: *M. R. Riazi & T. E. Daubert, Ind. Eng. Chem. Res. 26 (1987)
755-759* (consolidated set in Riazi, ASTM MNL50, 2005, Ch. 2).
Tutorial: `tutorials/props/estimate/estimate_petroleum_cut`.

### A polymer as a pseudo-component (fixed average MW) — and its limit

A polymer can be modelled as a pseudo-component with **one fixed average molar
mass** (Mn): `identity { MW <Mn>; }` + `role nonvolatile;` (it never enters the
vapour, so it needs no `critical{}` / `Psat` to flash) + a melt/solid `Cp` for
energy balances.  **Zero new code** — the same data model as a petroleum cut.

> **LOUD limitation.**  This is a single average MW, **NOT** the molecular-weight
> **DISTRIBUTION** (no Mn/Mw/PDI tracking, no chain-length population balance,
> no copolymer composition).  True polymer-property methods (the
> *Polymers-Plus* / segment-based PC-SAFT class) are **NOT supported** and are
> out of Choupo's scope.  Use the lump **only** where a single average MW is an
> acceptable engineering approximation (solvent devolatilisation, a heat / mass
> balance on a polymer solution) — never for MWD-dependent design.

Example `.dat` + worked devolatilisation flash (the polymer stays 100 % in the
liquid by `role nonvolatile;`, the solvent boils off):
`tutorials/steady/flash/flash_polymer_devolatilisation`.

### The predefined `air` mixture (forthcoming)

A common convenience lump is **air** (≈ 79 % N2 / 21 % O2 by mole).  Until a
predefined-mixture shorthand lands, author it explicitly — list `N2` and `O2`
in the property package's `components` and set the feed `molarComposition { N2
0.79; O2 0.21; }`.  Both are fully curated permanent gases (criticals, Cp_ig,
gibbsFormation), so an air feed flashes and balances energy with the standard
catalogue alone.


## Solids are first-class — the data already there to use

Solids are **not** a second-class afterthought; the component model already
carries a deep solids stack.  Surface it when authoring a crystalliser, dryer,
cyclone, or any solid-handling case:

- **PSD is a STREAM attribute, not a component field.**  A particle-size
  distribution lives on the *stream* that carries the solid (set / read by the
  population-balance unit ops), because the same species can flow at different
  size distributions in different streams.  The **component** carries only the
  per-particle constants the PSD math needs:
  `solid { rho_p <kg/m3>; k_v <-> ; }` — particle (true) density and the volume
  shape factor `k_v` (`V = k_v d^3`; sphere = π/6 ≈ 0.5236, the default).
- **Sublimation reference** (the solid-vapour P-T anchor):
  `sublimation { tripleT <K>; tripleP <Pa>; Hfus <J/mol>; Hsub <J/mol>; }`
  — anchors the Clausius-Clapeyron sublimation line + the triple point of the
  P-T phase diagram.  Absent ⇒ the diagram stays L-V + critical only (every
  existing `.dat` unaffected).
- **Solid-liquid equilibrium** `c_sat(T)` (a crystallising solute):
  `solubility { coefficients (a b c ...); dHcryst <J/mol>; }` — saturation
  concentration `c_sat(T) = Σ aᵢ·(T−273.15)ⁱ` in kg solute / kg solvent; the
  crystalliser reads it for the yield.  (Crystallisation **kinetics** k_n / k_g
  are separate — `constant/crystallisation`, not the component.)
- **GAB water-sorption isotherm** (a drying solid):
  `sorption { Xm; C; K; }` — the equilibrium-moisture-vs-water-activity relation
  `Xe = Xm·C·K·aw / [(1−K·aw)(1−K·aw+C·K·aw)]`.  Typically **case-local**
  (axiom 4): the isotherm is sample-specific.  (The critical moisture Xc and the
  drying-RATE curve are **kinetics** — `constant/dryingKinetics`, not the
  component.)
- **Crystalline formation datum**: a solid-tabulated `solid { Hf_298; S_298; }`
  (or legacy `gibbsFormation { ...; phase solid; }`) lets a non-volatile
  crystalline species (sucrose, NaOH) carry its heat of formation **without** a
  gas-phase Cp it never has — the dissolved-solute enthalpy path uses
  `liquidHeatCapacity` as the sensible heat from 298 K.

See `sucrose` (solubility + sorption + solid + crystalline gibbsFormation) and
`NaOH` (solid formation datum + electrolyte block) for fully-worked solid
`.dat`s in the catalogue.
