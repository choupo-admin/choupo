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

## Components (603 entries)

### Volatile (curated for VLE)

| Name | MW | role | Psat (Trange, K) | Cp_ig | Cp_liq | standardThermochemistry | solid | solubility | sorption | Vliq | Notes |
|---|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `112Trichloroethane` | 133.4042 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `11Dichloroethane` | 98.95916 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `11Dimethylcyclohexane` | 112.2126 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `11Dimethylcyclopentane` | 98.18607 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `1234Tetramethylbenzene` | 134.2182 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `1235Tetramethylbenzene` | 134.2182 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `123Trimethylbenzene` | 120.1916 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `1245Tetramethylbenzene` | 134.2182 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `124Trichlorobenzene` | 181.447 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `124Trimethylbenzene` | 120.1916 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `12Butadiene` | 54.09044 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `12PropyleneOxide` | 58.07804 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `13Butadiene` | 54.09044 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `14Butanediol` | 90.121 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `14Dioxane` | 88.10513 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `1Butene` | 56.1063 | (volatile) | 189-411 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `1Heptanol` | 116.2013 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `1Heptene` | 98.18607 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `1Hexanol` | 102.1748 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `1Hexene` | 84.15948 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `1Methyl1Ethylcyclopentane` | 112.2126 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `1Methyl3NPropylbenzene` | 134.2182 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `1Methyl4NPropylbenzene` | 134.2182 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `1Methylindene` | 130.1864 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `1Methylnaphthalene` | 142.1971 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `1Nitrobutane` | 103.1198 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `1Nitropropane` | 89.09318 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `1Nonene` | 126.2392 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `1Octene` | 112.2126 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `1Pentanol` | 88.14818 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `1Pentene` | 70.1329 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `1Phenylnaphthalene` | 204.2665 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `1Propanol` | 60.09502 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `1Undecene` | 154.2924 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2233Tetramethylbutane` | 114.2285 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2233Tetramethylpentane` | 128.2551 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2234Tetramethylpentane` | 128.2551 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `223Trimethylbutane` | 100.202 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `223Trimethylpentane` | 114.2285 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2244Tetramethylpentane` | 128.2551 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `224Trimethylpentane` | 114.2285 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `225Trimethylhexane` | 128.2551 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `22Dimethyl1Propanol` | 88.14818 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `22Dimethylbutane` | 86.17536 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `22Dimethylheptane` | 128.2551 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `22Dimethylhexane` | 114.2285 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `22Dimethyloctane` | 142.2817 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `22Dimethylpentane` | 100.202 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2334Tetramethylpentane` | 128.2551 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `233Trimethylpentane` | 114.2285 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `234Trimethylpentane` | 114.2285 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `23Dimethylbutane` | 86.17536 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `23Dimethylhexane` | 114.2285 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `23Dimethylpentane` | 100.202 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `244Trimethylhexane` | 128.2551 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `246Trinitrotoluene` | 227.1311 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `24Dimethylhexane` | 114.2285 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `24Dimethylpentane` | 100.202 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `24Dinitrotoluene` | 182.1335 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `25Dimethylhexane` | 114.2285 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `25Dinitrotoluene` | 182.1335 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `26Dinitrotoluene` | 182.1335 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Butanol` | 74.1216 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2EthylMXylene` | 134.2182 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2EthylPXylene` | 134.2182 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Heptanone` | 114.1855 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Hexanone` | 100.1589 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Methoxy2MethylHeptane` | 144.2545 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Methyl1Butanol` | 88.14818 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Methyl1Butene` | 70.1329 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Methyl1Heptene` | 112.2126 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Methyl1Pentene` | 84.15948 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Methyl1Propanol` | 74.1216 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Methyl2Butanol` | 88.14818 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Methyl2Butene` | 70.1329 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Methyl2Heptanol` | 130.2279 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Methyl2Propanol` | 74.1216 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Methyl3Ethylpentane` | 114.2285 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Methylheptane` | 114.2285 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Methylhexane` | 100.202 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Methylindene` | 130.1864 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Methylnaphthalene` | 142.1971 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Methylnonane` | 142.2817 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Methyloctane` | 128.2551 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Methylpropanal` | 72.10572 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Nitropropane` | 89.09318 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Pentanol` | 88.14818 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `2Pentanone` | 86.1323 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `335Trimethylheptane` | 142.2817 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `33Diethylpentane` | 128.2551 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `33Dimethyl2Butanone` | 100.1589 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `33Dimethylhexane` | 114.2285 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `33Dimethylpentane` | 100.202 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `34Dimethylhexane` | 114.2285 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `34Dinitrotoluene` | 182.1335 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `35Dinitrotoluene` | 182.1335 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `3Ethylheptane` | 128.2551 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `3Ethylhexane` | 114.2285 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `3Ethylpentane` | 100.202 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `3Heptanone` | 114.1855 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `3Hexanone` | 100.1589 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `3Methyl1Butene` | 70.1329 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `3Methyl3Ethylpentane` | 114.2285 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `3Methylheptane` | 114.2285 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `3Methylhexane` | 100.202 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `3Methylnonane` | 142.2817 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `3Methyloctane` | 128.2551 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `3Methylpentane` | 86.17536 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `3Pentanone` | 86.1323 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `4EthylMXylene` | 134.2182 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `4EthylOXylene` | 134.2182 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `4Heptanone` | 114.1855 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `4MethylCis2Pentene` | 84.15948 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `4Methylheptane` | 114.2285 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `4Methylnonane` | 142.2817 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `4Methyloctane` | 128.2551 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `4MethylTrans2Pentene` | 84.15948 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `5Methyl2Hexanone` | 114.1855 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `5Methylnonane` | 142.2817 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `acenaphthene` | 154.2078 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `aceticAcid` | 60.052 | (volatile) | 290-392 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `aceticAnhydride` | 102.0886 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `acetone` | 58.080 | (volatile) | 259-508 | ✓ | ✓ | ✓ | — | — | — | ✓ | Σv_F |
| `acetonitrile` | 41.05192 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `acetylChloride` | 78.49762 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `acetylene` | 26.038 | (volatile) | 192-308 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `acrylicAcid` | 72.06266 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `acrylonitrile` | 53.06262 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `adipicAcid` | 146.1412 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `air` | 28.96 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `aniline` | 93.12648 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `anisole` | 108.1378 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `Ar` | 39.948 | (volatile) | 83-94 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `benzene` | 78.114 | (volatile) | 288-354 | ✓ | ✓ | ✓ | — | — | — | ✓ | φ_WC, μ_L |
| `benzoicAcid` | 122.1213 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `biphenyl` | 154.2078 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `bromine` | 159.808 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `bromobenzene` | 157.0079 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `butanal` | 72.10572 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `butylVinylEther` | 100.1589 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `carbonTetrachloride` | 153.8227 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `carbonylSulfide` | 60.0751 | (volatile) | 170-371 | ✓ | ✓ | — | — | — | — | ✓ |   |
| `chloroform` | 119.3776 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `chrysene` | 228.2879 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `cis12Dimethylcyclohexane` | 112.2126 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `cis12Dimethylcyclopentane` | 98.18607 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `cis13Dimethylcyclohexane` | 112.2126 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `cis13Dimethylcyclopentane` | 98.18607 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `cis14Dimethylcyclohexane` | 112.2126 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `cis2Butene` | 56.1063 | (volatile) | 196-427 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `cis2Hexene` | 84.15948 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `cis2Pentene` | 70.1329 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `cisDecahydronaphthalene` | 138.2499 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `CO` | 28.010 | (volatile) | 68-132 | ✓ | — | ✓ | — | — | — | ✓ | Σv_F |
| `compA` | 30.0 | (volatile) | 300-400 | ✓ | ✓ | — | — | — | — | ✓ |   |
| `compB` | 50.0 | (volatile) | 300-400 | ✓ | ✓ | — | — | — | — | ✓ |   |
| `compC` | 50.0 | (volatile) | 300-400 | ✓ | ✓ | — | — | — | — | ✓ |   |
| `cumene` | 120.1916 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `cumeneHydroperoxide` | 152.1904 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `cyclobutane` | 56.10632 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `cyclohexane` | 84.1595 | (volatile) | 280-543 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `cyclohexanol` | 100.1589 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `cyclohexanone` | 98.143 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `cyclohexene` | 82.1436 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `cyclopentane` | 70.1329 | (volatile) | 230-501 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `cyclopropane` | 42.0810 | (volatile) | 274-391 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `D2` | 4.0282 | (volatile) | 19-38 | ✓ | ✓ | ✓ | — | — | — | — |   |
| `diButylCarbonate` | 174.2374 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `dichloroacetaldehyde` | 112.9427 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `dichloroacetylChloride` | 147.3877 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `Dichloroethane` | 98.9590 | (volatile) | 253-550 | ✓ | ✓ | — | — | — | — | ✓ |   |
| `dicyclopentadiene` | 132.2023 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `diethanolamine` | 105.1356 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `diethylamine` | 73.13684 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `diEthylCarbonate` | 118.1311 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `diethylDisulfide` | 122.2522 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `diethyleneGlycol` | 106.1204 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `diethylenetriamine` | 103.1661 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `diethylethanolamine` | 117.1894 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `diethylEther` | 74.1216 | (volatile) | 270-459 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `diethylSulfide` | 90.18719 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `diisobutylKetone` | 142.2386 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `diisopropanolamine` | 133.1888 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `diisopropylamine` | 101.19 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `diisopropylEther` | 102.1748 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `diisopropylKetone` | 114.1855 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `dimethylacetylene` | 54.09044 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `dimethylCarbonate` | 90.0779 | (volatile) | 278-546 | ✓ | ✓ | — | — | — | — | ✓ |   |
| `dimethylDisulfide` | 94.19904 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `dimethylethanolamine` | 89.13624 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `dimethylEther` | 46.0684 | (volatile) | 180-392 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `dimethylSulfide` | 62.13404 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `dimethylSulfoxide` | 78.13344 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `dimethylTerephthalate` | 194.184 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `diNButylEther` | 130.2279 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `diNPropylDisulfide` | 150.3054 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `diNPropylSulfide` | 118.2404 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `diPhenylCarbonate` | 214.2167 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `diphenylDisulfide` | 218.3378 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `diSecButylEther` | 130.2279 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `diTertButylDisulfide` | 178.3585 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `ethane` | 30.070 | (volatile) | 168-305 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `ethanol` | 46.069 | (volatile) | 273-369 | ✓ | ✓ | ✓ | — | — | — | ✓ | φ_WC, μ_L |
| `ethylAcetate` | 88.106 | (volatile) | 266-373 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `ethylacetylene` | 54.09044 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `ethylamine` | 45.08368 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `ethylBenzene` | 106.1650 | (volatile) | 278-605 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `ethylChloride` | 64.5141 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `ethylcyclohexane` | 112.2126 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `ethylcyclopentane` | 98.18607 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `ethylene` | 28.054 | (volatile) | 150-283 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `ethyleneCarbonate` | 88.06207 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `ethylenediamine` | 60.09832 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `ethyleneGlycol` | 62.06784 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `ethyleneOxide` | 44.0526 | (volatile) | 211-460 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `ethylFormate` | 74.07854 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `ethylMercaptan` | 62.13404 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `ethylMethylDisulfide` | 108.2256 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `ethylPhenylCarbonate` | 166.1739 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `ethylPropylDisulfide` | 136.2788 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `ethylTertPentylEther` | 116.2013 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `fluoranthene` | 202.2506 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `fluorene` | 166.2185 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `fluorine` | 37.9968 | (volatile) | 65-142 | ✓ | ✓ | ✓ | — | — | — | — |   |
| `furfural` | 96.08406 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `glycerol` | 92.09382 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `H2` | 2.016 | (volatile) | 14-25 | ✓ | — | ✓ | — | — | — | ✓ | Σv_F |
| `H2O2` | 34.0147 | (volatile) | 330-446 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `HCHO` | 30.026 | (volatile) | 230-300 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `HCN` | 27.026 | (volatile) | 260-330 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `He` | 4.0026 | (volatile) | 2-5 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `heavyWater` | 20.0275 | (volatile) | 290-631 | ✓ | ✓ | — | — | — | — | ✓ |   |
| `heptanal` | 114.1855 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `hexamethyldisiloxane` | 162.3775 | (volatile) | 233-508 | ✓ | ✓ | — | — | — | — | ✓ |   |
| `hexanal` | 100.1589 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `hfe143m` | 100.0400 | (volatile) | 240-370 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `hydrogenIodide` | 127.9124 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `indane` | 118.1757 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `indene` | 116.1598 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `iodobenzene` | 204.0084 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `isoButane` | 58.1222 | (volatile) | 184-400 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `isoButene` | 56.1063 | (volatile) | 188-410 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `isobutylAcetate` | 116.1583 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `isobutylbenzene` | 134.2182 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `isobutylMercaptan` | 90.18719 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `isohexane` | 86.1754 | (volatile) | 224-488 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `isopentane` | 72.1488 | (volatile) | 207-451 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `isoprene` | 68.11702 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `isopropanol` | 60.09502 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `isopropylAcetate` | 102.1317 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `isopropylButylEther` | 116.2013 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `isopropylcyclopentane` | 112.2126 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `isopropylMercaptan` | 76.16061 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `krypton` | 83.7980 | (volatile) | 116-205 | ✓ | ✓ | — | — | — | — | — |   |
| `maleicAcid` | 116.0722 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `maleicAnhydride` | 98.05688 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `mCresol` | 108.1378 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `mCymene` | 134.2182 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `MD3M` | 384.8390 | (volatile) | 283-615 | ✓ | ✓ | — | — | — | — | ✓ |   |
| `MD4M` | 458.9933 | (volatile) | 294-640 | ✓ | ✓ | — | — | — | — | ✓ |   |
| `mDichlorobenzene` | 147.002 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `mDiethylbenzene` | 134.2182 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `MDM` | 236.5315 | (volatile) | 254-554 | ✓ | ✓ | — | — | — | — | ✓ |   |
| `mesitylene` | 120.1916 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methacrylicAcid` | 86.08924 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methacrylonitrile` | 67.0892 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methanol` | 32.042 | (volatile) | 288-356 | ✓ | ✓ | ✓ | — | — | — | ✓ | φ_WC, μ_L |
| `methylAcetate` | 74.079 | (volatile) | 250-351 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `methylal` | 76.09442 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylamine` | 31.0571 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylChloride` | 50.48752 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylcyclohexane` | 98.18607 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylcyclopentane` | 84.15948 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylDiEthanolAmine` | 119.1622 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylethanolamine` | 75.10966 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylEthylCarbonate` | 104.1045 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylEthylEther` | 60.09502 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylEthylKetone` | 72.10572 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylEthylSulfide` | 76.16061 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylFormate` | 60.05196 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylIodide` | 141.939 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylIsobutylEther` | 88.14818 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylIsobutylKetone` | 100.1589 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylIsopropylEther` | 74.1216 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylIsopropylKetone` | 86.1323 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylLinoleate` | 294.4721 | (volatile) | 360-783 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `methylLinolenate` | 292.4562 | (volatile) | 347-757 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `methylMercaptan` | 48.10746 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylMethacrylate` | 100.1158 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylNPropylEther` | 74.1216 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylNPropylSulfide` | 90.18719 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylOleate` | 296.4879 | (volatile) | 352-766 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `methylPalmitate` | 270.4507 | (volatile) | 340-740 | ✓ | ✓ | ✓ | — | — | — | — |   |
| `methylPhenylCarbonate` | 152.1473 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylPropionate` | 88.10513 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylStearate` | 298.5038 | (volatile) | 349-760 | ✓ | ✓ | ✓ | — | — | — | — |   |
| `methylTButylSulfide` | 104.2138 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylTertButylEther` | 88.14818 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylTertPentylEther` | 102.1748 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `mEthyltoluene` | 120.1916 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `methylTPentylSulfide` | 118.2404 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `mNitrotoluene` | 137.136 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `monochlorobenzene` | 112.5569 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `monoethanolamine` | 61.08308 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `mXylene` | 106.1650 | (volatile) | 278-605 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `N2` | 28.013 | (volatile) | 61-84 | ✓ | ✓ | ✓ | — | — | — | ✓ | Σv_F |
| `N2O` | 44.013 | (volatile) | 181-197 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `nAminoethylEthanolamine` | 104.1509 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nAminoethylPiperazine` | 129.2034 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `naphthalene` | 128.1705 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nButane` | 58.123 | (volatile) | 273-425 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nButanol` | 74.122 | (volatile) | 295-392 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nButylAcetate` | 116.1583 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nButylbenzene` | 134.2182 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nButylcyclohexane` | 140.2658 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nButylcyclopentane` | 126.2392 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nButyricAcid` | 88.10513 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nDecane` | 142.2817 | (volatile) | 278-605 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nDocosane` | 310.6006 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nDodecane` | 170.3348 | (volatile) | 296-645 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nEicosane` | 282.5475 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `neon` | 20.1790 | (volatile) | 25-44 | ✓ | ✓ | ✓ | — | — | — | — |   |
| `neopentane` | 72.1488 | (volatile) | 257-425 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nHeneicosane` | 296.5741 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nHeptacosane` | 380.7336 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nHeptadecane` | 240.4677 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nHeptane` | 100.2020 | (volatile) | 244-530 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nHexacosane` | 366.707 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nHexadecane` | 226.4412 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nHexane` | 86.178 | (volatile) | 286-343 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nHexylAcetate` | 144.2114 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nHexylMercaptan` | 118.2404 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nitrobenzene` | 123.1094 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nitroethane` | 75.0666 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nitrogenTetroxide` | 92.011 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nitrogenTrioxide` | 76.0116 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nitromethane` | 61.04002 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nNDimethylacetamide` | 87.12036 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nNDimethylformamide` | 73.09378 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nNonacosane` | 408.7867 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nNonadecane` | 268.5209 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nNonane` | 128.2551 | (volatile) | 268-583 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `NO` | 30.006 | (volatile) | 107-128 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `NO2` | 46.006 | (volatile) | 250-294 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `nOctacosane` | 394.7601 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nOctadecane` | 254.4943 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nOctane` | 114.231 | (volatile) | 326-399 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `novec649` | 316.0438 | (volatile) | 199-433 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nPentacosane` | 352.6804 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nPentadecane` | 212.4146 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nPentane` | 72.1488 | (volatile) | 211-460 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nPentylAcetate` | 130.1849 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nPropylAcetate` | 102.1317 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nPropylbenzene` | 120.1916 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nPropylcyclohexane` | 126.2392 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nPropylcyclopentane` | 112.2126 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nPropylFormate` | 88.10513 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nPropylMercaptan` | 76.16061 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nTetracosane` | 338.6538 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nTetradecane` | 198.388 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nTricosane` | 324.6272 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nTridecane` | 184.3614 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `nUndecane` | 156.3083 | (volatile) | 287-626 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `O2` | 31.999 | (volatile) | 54-154 | ✓ | — | ✓ | — | — | — | ✓ | Σv_F |
| `O3` | 47.9982 | (volatile) | 80-161 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `oCresol` | 108.1378 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `oCymene` | 134.2182 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `oDichlorobenzene` | 147.002 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `oDiethylbenzene` | 134.2182 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `oEthyltoluene` | 120.1916 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `oNitrotoluene` | 137.136 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `OrthoDeuterium` | 4.0282 | (volatile) | 19-38 | ✓ | ✓ | — | — | — | — | — |   |
| `OrthoHydrogen` | 2.0159 | (volatile) | 15-33 | ✓ | ✓ | — | — | — | — | — |   |
| `oToluicAcid` | 136.1479 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `oxalicAcid` | 90.03488 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `oXylene` | 106.1650 | (volatile) | 284-618 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `ParaDeuterium` | 4.0282 | (volatile) | 19-38 | ✓ | ✓ | — | — | — | — | — |   |
| `ParaHydrogen` | 2.0159 | (volatile) | 15-32 | ✓ | ✓ | — | — | — | — | — |   |
| `pCresol` | 108.1378 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `pCymene` | 134.2182 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `pDichlorobenzene` | 147.002 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `pDiethylbenzene` | 134.2182 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `pDiisopropylbenzene` | 162.2713 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `pentanal` | 86.1323 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `pEthyltoluene` | 120.1916 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `phenanthrene` | 178.2292 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `phenol` | 94.11124 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `phosgene` | 98.9161 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `phthalicAcid` | 166.1308 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `piperazine` | 86.1356 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `pNitrotoluene` | 137.136 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `pPhenylenediamine` | 108.1411 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `propadiene` | 40.06386 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `propanal` | 58.07914 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `propane` | 44.096 | (volatile) | 231-321 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `propionicAcid` | 74.07854 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `propionitrile` | 55.0785 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `propylene` | 42.081 | (volatile) | 165-242 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `propyleneCarbonate` | 102.0886 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `propyne` | 40.0600 | (volatile) | 274-395 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `pToluicAcid` | 136.1479 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `pXylene` | 106.1650 | (volatile) | 287-604 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `pyrene` | 202.2506 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `pyridine` | 79.0999 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `R11` | 137.3680 | (volatile) | 212-462 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R113` | 187.3750 | (volatile) | 237-477 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R12` | 120.9130 | (volatile) | 173-377 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R1234yf` | 114.0416 | (volatile) | 220-360 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R1234zeE` | 114.0416 | (volatile) | 172-375 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R1234zeZ` | 114.0416 | (volatile) | 274-415 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R134a` | 102.0320 | (volatile) | 170-367 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R13I1` | 195.9104 | (volatile) | 178-389 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R143a` | 84.0410 | (volatile) | 162-339 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R21` | 102.9227 | (volatile) | 204-444 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R218` | 188.0193 | (volatile) | 155-338 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R22` | 86.4680 | (volatile) | 166-362 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R236EA` | 152.0384 | (volatile) | 244-404 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R245fa` | 134.0479 | (volatile) | 192-418 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R32` | 52.0240 | (volatile) | 158-344 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `R365MFC` | 148.0745 | (volatile) | 240-451 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `RC318` | 200.0312 | (volatile) | 234-381 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `salicylicAcid` | 138.1207 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `secButylbenzene` | 134.2182 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `secButylMercaptan` | 90.18719 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `SF6` | 146.0554 | (volatile) | 224-312 | ✓ | ✓ | — | — | — | — | ✓ |   |
| `squalane` | 422.8133 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `styrene` | 104.149 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `sulfolane` | 120.1701 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `terephthalicAcid` | 166.1308 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `tertButylbenzene` | 134.2182 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `tertButylcyclohexane` | 140.2658 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `tertButylEthylEther` | 102.1748 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `tertButylMercaptan` | 90.18719 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `tetraethyleneGlycol` | 194.2255 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `tetrahydrofuran` | 72.10572 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `thiophene` | 84.13956 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `toluene` | 92.141 | (volatile) | 273-380 | ✓ | ✓ | ✓ | — | — | — | ✓ | φ_WC, Σv_F, μ_L |
| `trans12Dimethylcyclohexane` | 112.2126 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `trans12Dimethylcyclopentane` | 98.18607 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `trans13Dimethylcyclohexane` | 112.2126 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `trans13Dimethylcyclopentane` | 98.18607 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `trans14Dimethylcyclohexane` | 112.2126 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `trans2Butene` | 56.1063 | (volatile) | 193-420 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `trans2Hexene` | 84.15948 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `trans2Pentene` | 70.1329 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `transDecahydronaphthalene` | 138.2499 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `trichloroacetaldehyde` | 147.3877 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `trichloroacetylChloride` | 181.8328 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `trichloroethylene` | 131.3883 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `triethanolamine` | 149.1882 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `triethylamine` | 101.19 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `triethyleneGlycol` | 150.173 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `trimethylamine` | 59.11026 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `vinylAcetate` | 86.08924 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `vinylChloride` | 62.49822 | (volatile) | ✓ | — | — | — | — | — | — | — |   |
| `water` | 18.015 | (volatile) | 273-373 | ✓ | ✓ | ✓ | — | — | — | ✓ | φ_WC, Σv_F, μ_L |
| `Xe` | 131.2930 | (volatile) | 162-284 | ✓ | ✓ | — | — | — | — | — |   |

### Permanent gas / combustion species

| Name | MW | role | Psat (Trange, K) | Cp_ig | Cp_liq | standardThermochemistry | solid | solubility | sorption | Vliq | Notes |
|---|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `H2SO4` | 98.079 | (volatile) | — | — | ✓ | ✓ | — | — | — | ✓ |   |
| `H3PO4` | 97.995 | (volatile) | — | — | — | ✓ | ✓ | — | — | — |   |
| `HNO3` | 63.013 | (volatile) | — | — | ✓ | ✓ | — | — | — | ✓ |   |

### Soluble gas (Henry)

| Name | MW | role | Psat (Trange, K) | Cp_ig | Cp_liq | standardThermochemistry | solid | solubility | sorption | Vliq | Notes |
|---|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `CH4` | 16.043 | solute | 91-190 | ✓ | — | ✓ | — | — | — | ✓ | Σv_F |
| `Cl2` | 70.906 | solute | 176-256 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `CO2` | 44.010 | solute | 154-204 | ✓ | ✓ | ✓ | — | — | — | ✓ | Σv_F |
| `H2S` | 34.082 | solute | 186-227 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `HCl` | 36.461 | solute | 160-201 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `NH3` | 17.030 | solute | 195-371 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `SO2` | 64.065 | solute | 199-263 | ✓ | — | ✓ | — | — | — | ✓ |   |

### Non-volatile solute

| Name | MW | role | Psat (Trange, K) | Cp_ig | Cp_liq | standardThermochemistry | solid | solubility | sorption | Vliq | Notes |
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

| Name | MW | role | Psat (Trange, K) | Cp_ig | Cp_liq | standardThermochemistry | solid | solubility | sorption | Vliq | Notes |
|---|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `KCl` | 74.551 | nonvolatile | — | — | ✓ | — | ✓ | ✓ | — | — | ν=2 |
| `potassiumBitartrate` | 188.177 | nonvolatile | — | — | ✓ | — | ✓ | ✓ | — | — | ν=2 |
| `sucrose` | 342.297 | nonvolatile | — | — | ✓ | ✓ | ✓ | ✓ | — | ✓ |   |

### Solids-only / pseudo-component

| Name | MW | role | Psat (Trange, K) | Cp_ig | Cp_liq | standardThermochemistry | solid | solubility | sorption | Vliq | Notes |
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

| Name | MW | role | Psat (Trange, K) | Cp_ig | Cp_liq | standardThermochemistry | solid | solubility | sorption | Vliq | Notes |
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
## Friendly-name aliases

A component name is resolved EXACT-FIRST against the table above; on a miss, these aliases map a friendly spelling to its canonical record (`methane` -> `CH4`).  Either spelling works in a case.

| Alias | Canonical |
|---|---|
| `C2H2` | `acetylene` |
| `C2H4` | `ethylene` |
| `C2H6` | `ethane` |
| `C3H6` | `propylene` |
| `C4H10` | `nButane` |
| `C8H18` | `nOctane` |
| `butane` | `nButane` |
| `carbonDioxide` | `CO2` |
| `carbonMonoxide` | `CO` |
| `chlorine` | `Cl2` |
| `ethene` | `ethylene` |
| `ethyne` | `acetylene` |
| `hydrogen` | `H2` |
| `hydrogenPeroxide` | `H2O2` |
| `methane` | `CH4` |
| `nitrogen` | `N2` |
| `octane` | `nOctane` |
| `oxygen` | `O2` |
| `propene` | `propylene` |

## SRK binary-interaction (kij) pairs

One `<a>-<b>.dat` per pair, declarable from a phiPhi case's `binaryInteractions`; a pair NOT listed here runs kij = 0 (announced), and a declared-but-missing file refuses.  (S6 of the authoring-seams scope: the catalogue listed every Henry pair and no kij home, so an author could not know what may be declared.)

| Name |
|---|
| `N2-CH4` |
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

