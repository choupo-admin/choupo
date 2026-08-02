# Standard catalogue — what ships in `data/standards/`

<!-- BEGIN-PROSE -->
Inventory snapshot, regenerated from `data/standards/components/`.
When declaring the thermophysical system (`constant/thermoPhysPropDict`), pick component names from this list
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
(`data/standards/parameters/solution/<solute>-<solvent>.dat` for molecular solutes;
`data/standards/species/<name>.dat` for the ∞-dilution ion tier — one
`recordType modelSpecies` file per aqueous species), referenced
by name, never copied into `<name>.dat`.  The solvent is always **named**, not
implied (`data-doctrine.md` §2).

**Henry behaviour: the ROLE is selected by the system declaration, not
stored on the substance.**  WHO dissolves in WHAT is structural: the
`formulation diluteSolution` `liquid { solvent {…} solutes {…} }` blocks of
`thermoPhysPropDict` declare it, the pair files are declared by `source` in
the solutes' `binaryParameters` (the Henry's-law pairs table below names the
shipped files), and a declared-but-missing pair REFUSES at assembly.  See
`thermo.md` → "diluteSolution".

**The private tier (`data/local/`).**  Beside the curated catalogue the engine
reads a second, gitignored home for your OWN records.  The public repository
ships it EMPTY on purpose (a `README.md` and nothing else), so nothing below
depends on it and no third-party databank values are redistributed here.  When
you do populate it — `bin/curate/chemsep_to_choupo.py` writes there, as do
`fitParameters` proposals — precedence is `inline / case-local / snapshot >
standards > local > idealDefault`: the case always wins, and among the shared
catalogues **standards beats local**, so local only ever fills gaps.  Every
consumption is announced `[local] UNVERIFIED` and carried in the result
provenance.  Treat an imported record with care: a typical import brings MW,
Tc, Pc, omega and Tb plus a PREDICTIVE (Ambrose-Walton) vapour pressure, and
leaves Cp, formation thermochemistry, transport and group data absent — good
enough to screen a flash, not good enough for an energy or reaction balance.

The component COUNT is not written here: this whole section below
`AUTO-GENERATED` is produced by `bin/regen-llm-docs` from the `.dat` files
themselves, and the heading it writes is the count.  (A number typed into this
paragraph by hand said 56 for long enough that the tree reached 247 without it
noticing — which is the same second-home failure the doctrine warns about, one
level up.)
<!-- END-PROSE -->

<!-- AUTO-GENERATED below this line by bin/regen-llm-docs. -->
<!-- Edit the .dat files in data/standards/components/, then re-run. -->

## Components (247 entries)

### Volatile (curated for VLE)

| Name | MW | role | Psat | Cp_ig | Cp_liq | standardThermochemistry | solid | solubility | sorption | Vliq | Notes |
|---|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `1Butene` | 56.1063 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `aceticAcid` | 60.052 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `acetone` | 58.080 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | Σv_F |
| `acetylene` | 26.038 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `Ar` | 39.948 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `benzene` | 78.114 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | φ_WC, μ_L |
| `carbonylSulfide` | 60.0751 | (volatile) | ✓ | ✓ | ✓ | — | — | — | — | ✓ |   |
| `cis2Butene` | 56.1063 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `CO` | 28.010 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ | Σv_F |
| `compA` | 30.0 | (volatile) | ✓ | ✓ | ✓ | — | — | — | — | ✓ |   |
| `compB` | 50.0 | (volatile) | ✓ | ✓ | ✓ | — | — | — | — | ✓ |   |
| `compC` | 50.0 | (volatile) | ✓ | ✓ | ✓ | — | — | — | — | ✓ |   |
| `cyclohexane` | 84.1595 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `cyclopentane` | 70.1329 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `cyclopropane` | 42.0810 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `D2` | 4.0282 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | — |   |
| `Dichloroethane` | 98.9590 | (volatile) | ✓ | ✓ | ✓ | — | — | — | — | ✓ |   |
| `diethylEther` | 74.1216 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `dimethylCarbonate` | 90.0779 | (volatile) | ✓ | ✓ | ✓ | — | — | — | — | ✓ |   |
| `dimethylEther` | 46.0684 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `ethane` | 30.070 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `ethanol` | 46.069 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | φ_WC, μ_L |
| `ethylAcetate` | 88.106 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `ethylBenzene` | 106.1650 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `ethylene` | 28.054 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `ethyleneOxide` | 44.0526 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `fluorine` | 37.9968 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | — |   |
| `H2` | 2.016 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ | Σv_F |
| `H2O2` | 34.0147 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `HCHO` | 30.026 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `HCN` | 27.026 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `He` | 4.0026 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `heavyWater` | 20.0275 | (volatile) | ✓ | ✓ | ✓ | — | — | — | — | ✓ |   |
| `hexamethyldisiloxane` | 162.3775 | (volatile) | ✓ | ✓ | ✓ | — | — | — | — | ✓ |   |
| `hfe143m` | 100.0400 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `isoButane` | 58.1222 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `isoButene` | 56.1063 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `isohexane` | 86.1754 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `isopentane` | 72.1488 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `krypton` | 83.7980 | (volatile) | ✓ | ✓ | ✓ | — | — | — | — | — |   |
| `MD3M` | 384.8390 | (volatile) | ✓ | ✓ | ✓ | — | — | — | — | ✓ |   |
| `MD4M` | 458.9933 | (volatile) | ✓ | ✓ | ✓ | — | — | — | — | ✓ |   |
| `MDM` | 236.5315 | (volatile) | ✓ | ✓ | ✓ | — | — | — | — | ✓ |   |
| `methanol` | 32.042 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | φ_WC, μ_L |
| `methylAcetate` | 74.079 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `methylLinoleate` | 294.4721 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `methylLinolenate` | 292.4562 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `methylOleate` | 296.4879 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `methylPalmitate` | 270.4507 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | — |   |
| `methylStearate` | 298.5038 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | — |   |
| `mXylene` | 106.1650 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `N2` | 28.013 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | Σv_F |
| `N2O` | 44.013 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `nButane` | 58.123 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nButanol` | 74.122 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nDecane` | 142.2817 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nDodecane` | 170.3348 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `neon` | 20.1790 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | — |   |
| `neopentane` | 72.1488 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nHeptane` | 100.2020 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nHexane` | 86.178 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nNonane` | 128.2551 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `NO` | 30.006 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `NO2` | 46.006 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `nOctane` | 114.231 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `novec649` | 316.0438 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nPentane` | 72.1488 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nUndecane` | 156.3083 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `O2` | 31.999 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ | Σv_F |
| `O3` | 47.9982 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `OrthoDeuterium` | 4.0282 | (volatile) | ✓ | ✓ | ✓ | — | — | — | — | — |   |
| `OrthoHydrogen` | 2.0159 | (volatile) | ✓ | ✓ | ✓ | — | — | — | — | — |   |
| `oXylene` | 106.1650 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `ParaDeuterium` | 4.0282 | (volatile) | ✓ | ✓ | ✓ | — | — | — | — | — |   |
| `ParaHydrogen` | 2.0159 | (volatile) | ✓ | ✓ | ✓ | — | — | — | — | — |   |
| `propane` | 44.096 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `propylene` | 42.081 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `propyne` | 40.0600 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `pXylene` | 106.1650 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R11` | 137.3680 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R113` | 187.3750 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R12` | 120.9130 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R1234yf` | 114.0416 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R1234zeE` | 114.0416 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R1234zeZ` | 114.0416 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R134a` | 102.0320 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R13I1` | 195.9104 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R143a` | 84.0410 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R21` | 102.9227 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R218` | 188.0193 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R22` | 86.4680 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R236EA` | 152.0384 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R245fa` | 134.0479 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R32` | 52.0240 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R365MFC` | 148.0745 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `RC318` | 200.0312 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `SF6` | 146.0554 | (volatile) | ✓ | ✓ | ✓ | — | — | — | — | ✓ |   |
| `toluene` | 92.141 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | φ_WC, Σv_F, μ_L |
| `trans2Butene` | 56.1063 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `water` | 18.015 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | φ_WC, Σv_F, μ_L |
| `Xe` | 131.2930 | (volatile) | ✓ | ✓ | ✓ | — | — | — | — | — |   |

### Permanent gas / combustion species

| Name | MW | role | Psat | Cp_ig | Cp_liq | standardThermochemistry | solid | solubility | sorption | Vliq | Notes |
|---|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `H2SO4` | 98.079 | (volatile) | — | — | ✓ | ✓ | — | — | — | ✓ |   |
| `H3PO4` | 97.995 | (volatile) | — | — | — | ✓ | ✓ | — | — | — |   |
| `HNO3` | 63.013 | (volatile) | — | — | ✓ | ✓ | — | — | — | ✓ |   |

### Soluble gas (Henry)

| Name | MW | role | Psat | Cp_ig | Cp_liq | standardThermochemistry | solid | solubility | sorption | Vliq | Notes |
|---|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `CH4` | 16.043 | solute | ✓ | ✓ | — | ✓ | — | — | — | ✓ | Σv_F |
| `Cl2` | 70.906 | solute | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `CO2` | 44.010 | solute | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | Σv_F |
| `H2S` | 34.082 | solute | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `HCl` | 36.461 | solute | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `NH3` | 17.030 | solute | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `SO2` | 64.065 | solute | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |

### Non-volatile solute

| Name | MW | role | Psat | Cp_ig | Cp_liq | standardThermochemistry | solid | solubility | sorption | Vliq | Notes |
|---|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `acetaldehyde` | 44.053 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `C` | 12.011 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `C2H` | 25.03 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `C2H3` | 27.046 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `C2H5` | 29.062 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `C2O` | 40.021 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `C3H3` | 39.057 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `C3H5` | 41.073 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `C3H7` | 43.089 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `C4H2` | 50.06 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `C4H4` | 52.076 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `C5H5` | 65.095 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `C6H5` | 77.106 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `CaCl2` | 110.98 | nonvolatile | — | — | — | — | — | — | — | — | ν=3 |
| `CH` | 13.019 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `CH2` | 14.027 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `CH2_S` | 14.027 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `CH2CO` | 42.037 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `CH2OH` | 31.034 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `CH3` | 15.0345 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `CH3CO` | 43.045 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `CH3O` | 31.034 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `CH3O2` | 47.033 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `Cl` | 35.45 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `ClO` | 51.449 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `CN` | 26.018 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `CS` | 44.071 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `CS2` | 76.131 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `dowthermA` | 165.8 | nonvolatile | — | — | ✓ | — | — | — | — | ✓ |   |
| `glucose` | 180.16 | nonvolatile | — | — | — | ✓ | — | — | — | — |   |
| `H` | 1.008 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `HCCO` | 41.029 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `HCO` | 29.018 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `hitecSalt` | 87.4 | nonvolatile | — | — | ✓ | — | — | — | — | ✓ |   |
| `HNO` | 31.014 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `HO2` | 33.0067 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `HOCl` | 52.457 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `HONO` | 47.013 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `HSO` | 49.067 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `HSO3` | 81.065 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `LiCl` | 42.394 | nonvolatile | — | — | ✓ | — | — | — | — | — |   |
| `MgSO4` | 120.37 | nonvolatile | — | — | — | — | — | — | — | — | ν=2 |
| `N` | 14.007 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `N2H2` | 30.03 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `N2H3` | 31.038 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `N2H4` | 32.046 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `NaCl` | 58.44 | nonvolatile | — | — | — | — | — | ✓ | — | — | ν=2 |
| `NaOH` | 39.997 | nonvolatile | — | — | — | — | — | ✓ | — | — | ν=2 |
| `NCO` | 42.017 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `NH` | 15.0146 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `NH2` | 16.0226 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `NNH` | 29.022 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `NO3` | 62.004 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `O` | 15.999 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `OH` | 17.008 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `PET` | 192.17 | nonvolatile | — | — | — | — | — | — | — | — |   |
| `PMMA` | 100.12 | nonvolatile | — | — | — | — | — | — | — | — |   |
| `polyethylene` | 28.05 | nonvolatile | — | — | — | — | — | — | — | — |   |
| `polypropylene` | 42.08 | nonvolatile | — | — | — | — | — | — | — | — |   |
| `polystyrene` | 104.15 | nonvolatile | — | — | — | — | — | — | — | — |   |
| `propyleneGlycol30` | 36.6 | nonvolatile | — | — | ✓ | — | — | — | — | ✓ |   |
| `PVC` | 62.5 | nonvolatile | — | — | — | — | — | — | — | — |   |
| `S` | 32.06 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `S2` | 64.12 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `SH` | 33.068 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `SO` | 48.059 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `SO3` | 80.057 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |

### Crystallising solute

| Name | MW | role | Psat | Cp_ig | Cp_liq | standardThermochemistry | solid | solubility | sorption | Vliq | Notes |
|---|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `KCl` | 74.551 | nonvolatile | — | — | ✓ | — | ✓ | ✓ | — | — | ν=2 |
| `potassiumBitartrate` | 188.177 | nonvolatile | — | — | ✓ | — | ✓ | ✓ | — | — | ν=2 |
| `sucrose` | 342.297 | nonvolatile | — | — | ✓ | ✓ | ✓ | ✓ | — | ✓ |   |

### Solids-only / pseudo-component

| Name | MW | role | Psat | Cp_ig | Cp_liq | standardThermochemistry | solid | solubility | sorption | Vliq | Notes |
|---|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `CaCO3` | 100.0869 | nonvolatile | — | — | — | ✓ | ✓ | — | — | — |   |
| `calciumHydroxide` | 74.093 | nonvolatile | — | — | ✓ | ✓ | ✓ | — | — | — |   |
| `calciumTartrate` | 188.15 | nonvolatile | — | — | ✓ | — | ✓ | — | — | — |   |
| `CaO` | 56.077 | nonvolatile | — | — | — | ✓ | ✓ | — | — | — |   |
| `CaSO4` | 136.141 | nonvolatile | — | — | ✓ | ✓ | ✓ | — | — | — |   |
| `K2SO4` | 174.259 | nonvolatile | — | — | — | ✓ | ✓ | — | — | — |   |
| `KOH` | 56.105 | nonvolatile | — | — | ✓ | ✓ | ✓ | — | — | — |   |
| `magnesiumHydroxide` | 58.320 | nonvolatile | — | — | — | ✓ | ✓ | — | — | — |   |
| `Na2CO3` | 105.988 | nonvolatile | — | — | — | ✓ | ✓ | — | — | — |   |
| `Na2SO4` | 142.036 | nonvolatile | — | — | — | ✓ | ✓ | — | — | — |   |
| `NaHCO3` | 84.007 | nonvolatile | — | — | — | ✓ | ✓ | — | — | — |   |
| `NH4Cl` | 53.491 | nonvolatile | — | — | — | ✓ | ✓ | — | — | — |   |
| `silica` | 60.08 | nonvolatile | — | — | — | ✓ | ✓ | — | — | — |   |
| `tartaricAcid` | 150.087 | nonvolatile | — | — | ✓ | ✓ | ✓ | — | — | — |   |

### Other

| Name | MW | role | Psat | Cp_ig | Cp_liq | standardThermochemistry | solid | solubility | sorption | Vliq | Notes |
|---|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `akermanite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `anthophyllite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `artinite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `barite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `bischofite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `bloedite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `burkeite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `carnallite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `celestite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `chrysotile` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `diopside` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `dolomite` | 184.40 | (volatile) | — | — | — | — | — | — | — | — |   |
| `enstatite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `epsomite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `fluorite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `forsterite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `gaylussite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `glaserite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `glauberite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `goergeyite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `gypsum` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `hexahydrite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `huntite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `hydroxyapatite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `kainite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `kalicinite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `kieserite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `labile_S` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `leonhardite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `leonite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `lithiumChlorideH2O` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `magnesite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `melanterite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `mirabilite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `misenite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `natron` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `nesquehonite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `pentahydrite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `pirssonite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `polyhalite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `pyrochroite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `rhodochrosite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `schoenite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `sepiolite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `sepiolite_d` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `siderite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `strontianite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `syngenite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `talc` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `trona` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `vivianite` | — | (volatile) | — | — | — | — | — | — | — | — |   |
| `witherite` | — | (volatile) | — | — | — | — | — | — | — | — |   |

## Henry's-law pairs

One `<gas>-<solvent>.dat` per pair; each ships its temperature dependence and its convention profile.

| Name |
|---|
| `Ar-water` |
| `CH4-water` |
| `CO-water` |
| `CO2-water` |
| `Cl2-water` |
| `H2-NH3` |
| `H2-water` |
| `H2S-water` |
| `HCHO-water` |
| `HCN-water` |
| `HCl-water` |
| `HO2-water` |
| `He-water` |
| `N2-NH3` |
| `N2-water` |
| `N2O-water` |
| `NH3-water` |
| `NO-water` |
| `NO2-water` |
| `O2-water` |
| `O3-water` |
| `OH-water` |
| `R11-water` |
| `R113-water` |
| `R114-water` |
| `R115-water` |
| `R116-water` |
| `R12-water` |
| `R123-water` |
| `R124-water` |
| `R125-water` |
| `R13-water` |
| `R134a-water` |
| `R14-water` |
| `R141b-water` |
| `R142b-water` |
| `R152a-water` |
| `R218-water` |
| `R22-water` |
| `R227EA-water` |
| `R23-water` |
| `R32-water` |
| `R40-water` |
| `R41-water` |
| `RC318-water` |
| `SF6-water` |
| `SO2-water` |
| `Xe-water` |
| `acetaldehyde-water` |
| `aceticAcid-water` |
| `acetone-water` |
| `acetonitrile-water` |
| `acetophenone-water` |
| `acetylene-water` |
| `acrolein-water` |
| `acrylonitrile-water` |
| `allylAlcohol-water` |
| `allylChloride-water` |
| `amylAcetate-water` |
| `aniline-water` |
| `anisole-water` |
| `anthracene-water` |
| `benzaldehyde-water` |
| `benzene-water` |
| `benzoicAcid-water` |
| `benzonitrile-water` |
| `benzylChloride-water` |
| `biphenyl-water` |
| `butadiene13-water` |
| `butanal-water` |
| `butene1-water` |
| `butylAcetate-water` |
| `butyne1-water` |
| `caproicAcid-water` |
| `carbonDisulfide-water` |
| `carbonTetrachloride-water` |
| `carbonylSulfide-water` |
| `chlorobenzene-water` |
| `chlorobutane1-water` |
| `chloroform-water` |
| `cumene-water` |
| `cyclohexane-water` |
| `cyclohexanol-water` |
| `cyclohexene-water` |
| `cyclohexylamine-water` |
| `cyclopentane-water` |
| `cyclopentene-water` |
| `cyclopropane-water` |
| `diacetyl-water` |
| `dichloroethane11-water` |
| `dichloroethane12-water` |
| `dichloromethane-water` |
| `dichloropropane12-water` |
| `diethylEther-water` |
| `diethylSulfide-water` |
| `diethylamine-water` |
| `diisopropylEther-water` |
| `dimethoxyethane12-water` |
| `dimethylDisulfide-water` |
| `dimethylEther-water` |
| `dimethylFormamide-water` |
| `dimethylPhthalate-water` |
| `dimethylSulfide-water` |
| `dimethylamine-water` |
| `dioxane14-water` |
| `epichlorohydrin-water` |
| `ethane-water` |
| `ethanethiol-water` |
| `ethanol-water` |
| `ethylAcetate-water` |
| `ethylBenzene-water` |
| `ethylFormate-water` |
| `ethylTertButylEther-water` |
| `ethylamine-water` |
| `ethylcyclohexane-water` |
| `ethylene-water` |
| `ethyleneOxide-water` |
| `ethylenediamine-water` |
| `formicAcid-water` |
| `guaiacol-water` |
| `heptane-water` |
| `heptanol1-water` |
| `hexanal-water` |
| `hexanol1-water` |
| `isoButane-water` |
| `isoButene-water` |
| `isohexane-water` |
| `isoprene-water` |
| `isopropylAcetate-water` |
| `krypton-water` |
| `mCresol-water` |
| `mXylene-water` |
| `mesitylene-water` |
| `methanethiol-water` |
| `methanol-water` |
| `methylAcetate-water` |
| `methylBenzoate-water` |
| `methylEthylKetone-water` |
| `methylFormate-water` |
| `methylIsobutylKetone-water` |
| `methylMethacrylate-water` |
| `methylamine-water` |
| `methylcyclohexane-water` |
| `morpholine-water` |
| `mtbe-water` |
| `nButane-water` |
| `nButanol-water` |
| `nHeptane-water` |
| `nHexane-water` |
| `nNonane-water` |
| `nOctane-water` |
| `nPentane-water` |
| `naphthalene-water` |
| `neopentane-water` |
| `nitrobenzene-water` |
| `nitroethane-water` |
| `nitromethane-water` |
| `nnDimethylacetamide-water` |
| `nonane-water` |
| `oCresol-water` |
| `oDichlorobenzene-water` |
| `oXylene-water` |
| `oneOctanol-water` |
| `onePentanol-water` |
| `onePropanethiol-water` |
| `onePropanol-water` |
| `pCresol-water` |
| `pXylene-water` |
| `pentan3one-water` |
| `pentanal-water` |
| `phenol-water` |
| `piperazine-water` |
| `piperidine-water` |
| `propanal-water` |
| `propane-water` |
| `propionitrile-water` |
| `propylAcetate-water` |
| `propylbenzene-water` |
| `propylene-water` |
| `propyleneOxide-water` |
| `propyne-water` |
| `pyridine-water` |
| `pyrrolidine-water` |
| `quinoline-water` |
| `styrene-water` |
| `tertButanol-water` |
| `tetrachloroethylene-water` |
| `tetrahydrofuran-water` |
| `tetrahydropyran-water` |
| `tetralin-water` |
| `thiophene-water` |
| `toluene-water` |
| `trichloroethane111-water` |
| `trichloroethylene-water` |
| `twoButanol-water` |
| `twoEthoxyethanol-water` |
| `twoMethoxyethanol-water` |
| `twoMethylpentane-water` |
| `twoMethyltetrahydrofuran-water` |
| `twoPentanone-water` |
| `twoPicoline-water` |
| `twoPropanol-water` |
| `valericAcid-water` |
| `vinylAcetate-water` |
| `vinylChloride-water` |
## Membranes

Each carries A_w + per-solute B_s + ratings (P_max, T_max, pH, MWCO); the ion-exchange pair carries its transport numbers.

| Name |
|---|
| `CMX_AMX` |
| `NF270` |
| `NF270_dspmde` |
| `SW30HR` |
## Adsorbents and resins

Isotherm and bed properties for the fixed-bed, TSA and softener units.

| Name |
|---|
| `SAC_Na` |
| `activatedCarbon` |
| `zeolite13X` |
| `zeolite5A` |
## Construction materials

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
- `Antoine { ... }` — `ln P = A − B/(T + C)` for VLE.
- `idealGasHeatCapacity { coefficients (a1 a2 ... ); }` — for H_ig, S_ig.
- `liquidHeatCapacity { coefficients ( ... ); }` — for sensible H_liq.
- `standardThermochemistry { dHf_298; s_298; }` — for K_eq + adiabatic flames.
- `diffusionVolume <Sigma_v>;` — for Fuller diffusivity.
- `liquidViscosity { andrade { ... } vogel { ... } }` — model-specific.
- `associationFactor <phi>;` — for Wilke-Chang liquid diffusivity.
- `solubility { coefficients ( a b c ); dHcryst; }` — c_sat(T), for crystalliser.
- `solid { rho_p; k_v; }` — for solids (cyclone / crystalliser / sprayDryer).
- `sorption { Xm; C; K; }` — GAB isotherm  **(typically case-local, axiom 4)**.
- `role <volatile|solute|nonvolatile|radical>;` — drives K-value choice.
- `dissociation <nu>;` — ions per formula (for osmotic pressure).

