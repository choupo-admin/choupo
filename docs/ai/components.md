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

## Components (687 entries)

### Volatile (curated for VLE)

| Name | MW | role | Psat (Trange, K) | Cp_ig | Cp_liq | standardThermochemistry | solid | solubility | sorption | Vliq | Notes |
|---|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `1122Tetrachloroethane` | 167.8380 | fit | 283-419 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `112Trichloroethane` | 133.4042 | (volatile) | 366-536 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `11Dichloroethane` | 98.95916 | (volatile) | 318-468 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `11Diethoxyethane` | 118.1760 | fit | 328-375 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `11Dimethylcyclohexane` | 112.2126 | (volatile) | 356-517 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `11Dimethylcyclopentane` | 98.18607 | (volatile) | 330-475 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `1234Tetramethylbenzene` | 134.2182 | (volatile) | 420-620 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `1235Tetramethylbenzene` | 134.2182 | (volatile) | 408-610 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `123Trimethylbenzene` | 120.1916 | (volatile) | 400-595 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `1245Tetramethylbenzene` | 134.2182 | (volatile) | 413-608 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `124Trichlorobenzene` | 181.447 | (volatile) | 435-633 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `124Trimethylbenzene` | 120.1916 | (volatile) | 392-583 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `12Butadiene` | 54.09044 | (volatile) | 273-402 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `12Butanediol` | 90.1220 | fit | 372-470 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `12Propanediol` | 76.0950 | fit | 345-461 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `12PropyleneOxide` | 58.07804 | (volatile) | 290-433 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `13Butadiene` | 54.09044 | (volatile) | 255-381 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `13Butanediol` | 90.1220 | fit | 288-688 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `13Dioxolane` | 74.0790 | fit | 275-351 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `13Propanediol` | 76.0950 | fit | 292-465 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `14Butanediol` | 90.121 | (volatile) | 408-588 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `14Dioxane` | 88.10513 | (volatile) | 353-528 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `16Hexanediol` | 118.1760 | fit | 523-740 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `1Butene` | 56.1063 | (volatile) | 189-411 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `1Chlorobutane` | 92.5660 | fit | 278-352 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `1Decanol` | 158.2850 | fit | 469-497 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `1Heptanol` | 116.2013 | (volatile) | 380-563 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `1Heptene` | 98.18607 | (volatile) | 324-477 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `1Hexanol` | 102.1748 | (volatile) | 369-550 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `1Hexene` | 84.15948 | (volatile) | 303-445 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `1HPerfluorooctane` | 420.0620 | fit | 288-333 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `1Methoxy2Propanol` | 90.1220 | fit | 331-579 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `1Methoxy2PropylAcetate` | 132.1590 | fit | 318-419 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `1Methyl1Ethylcyclopentane` | 112.2126 | (volatile) | 350-520 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `1Methyl3NPropylbenzene` | 134.2182 | (volatile) | 395-590 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `1Methyl4NPropylbenzene` | 134.2182 | (volatile) | 398-590 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `1Methylindene` | 130.1864 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `1Methylnaphthalene` | 142.1971 | (volatile) | 464-693 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `1Nitrobutane` | 103.1198 | (volatile) | 383-555 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `1Nitropropane` | 89.09318 | (volatile) | 363-536 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `1Nonene` | 126.2392 | (volatile) | 357-530 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `1Octanol` | 130.2310 | fit | 298-468 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `1Octene` | 112.2126 | (volatile) | 340-504 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `1Pentanamine` | 87.1660 | fit | 323-378 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `1Pentanol` | 88.14818 | (volatile) | 353-526 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `1Pentene` | 70.1329 | (volatile) | 283-414 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `1Phenylnaphthalene` | 204.2665 | (volatile) | 514-743 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `1Propanol` | 60.09502 | (volatile) | 323-483 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `1Propoxy2Propanol` | 118.1760 | fit | 298-413 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `1Undecene` | 154.2924 | (volatile) | 384-573 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2233Tetramethylbutane` | 114.2285 | (volatile) | 374-507 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2233Tetramethylpentane` | 128.2551 | (volatile) | 368-535 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2234Tetramethylpentane` | 128.2551 | (volatile) | 361-523 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `223Trimethylbutane` | 100.202 | (volatile) | 320-473 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `223Trimethylpentane` | 114.2285 | (volatile) | 341-504 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2244Tetramethylpentane` | 128.2551 | (volatile) | 344-497 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `224Trimethylpentane` | 114.2285 | (volatile) | 328-488 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `225Trimethylhexane` | 128.2551 | (volatile) | 342-506 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `22Dimethyl1Propanol` | 88.14818 | (volatile) | 333-491 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `22Dimethylbutane` | 86.17536 | (volatile) | 298-439 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `22Dimethylheptane` | 128.2551 | (volatile) | 347-511 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `22Dimethylhexane` | 114.2285 | (volatile) | 331-490 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `22Dimethyloctane` | 142.2817 | (volatile) | 225-602 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `22Dimethylpentane` | 100.202 | (volatile) | 313-463 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2334Tetramethylpentane` | 128.2551 | (volatile) | 365-539 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `233Trimethylpentane` | 114.2285 | (volatile) | 345-513 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `234Trimethylpentane` | 114.2285 | (volatile) | 341-505 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `23Dimethylbutane` | 86.17536 | (volatile) | 300-444 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `23Dimethylhexane` | 114.2285 | (volatile) | 272-564 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `23Dimethylpentane` | 100.202 | (volatile) | 160-537 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `244Trimethyl1Pentene` | 112.2160 | fit | 306-356 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `244Trimethylhexane` | 128.2551 | (volatile) | 351-514 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `246Trinitrotoluene` | 227.1311 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `24Dimethylhexane` | 114.2285 | (volatile) | 272-554 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `24Dimethylpentane` | 100.202 | (volatile) | 315-463 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `24Dinitrotoluene` | 182.1335 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `25Dimethylhexane` | 114.2285 | (volatile) | 333-492 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `25Dinitrotoluene` | 182.1335 | (volatile) | 489-711 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `26Dinitrotoluene` | 182.1335 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Amino2Methyl1Propanol` | 89.1380 | fit | 293-452 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `2Butanol` | 74.1216 | (volatile) | 323-477 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Butoxyethanol` | 118.1760 | fit | 407-442 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Chlorobutane` | 92.5660 | fit | 320-342 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Chlorotoluene` | 126.5830 | fit | 274-429 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `2Ethoxyethanol` | 90.1220 | fit | 346-408 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Ethoxypropene` | 86.1340 | fit | 321-335 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `2Ethyl1Hexanol` | 130.2310 | fit | 294-458 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `2EthylMXylene` | 134.2182 | (volatile) | 406-600 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2EthylPXylene` | 134.2182 | (volatile) | 413-600 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Ethylthiophene` | 112.1900 | fit | 292-410 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Heptanone` | 114.1855 | (volatile) | 367-550 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Hexanone` | 100.1589 | (volatile) | 354-525 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Methoxy2MethylHeptane` | 144.2545 | (volatile) | 313-618 | ✓ | — | ✓ | — | — | — | — |   |
| `2Methoxyethanol` | 76.0950 | fit | 336-417 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `2Methyl1Butanol` | 88.14818 | (volatile) | 346-515 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Methyl1Butene` | 70.1329 | (volatile) | 280-413 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Methyl1Heptene` | 112.2126 | (volatile) | 342-507 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Methyl1Pentene` | 84.15948 | (volatile) | 305-447 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Methyl1Propanol` | 74.1216 | (volatile) | 330-489 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Methyl2Butanol` | 88.14818 | (volatile) | 328-485 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Methyl2Butene` | 70.1329 | (volatile) | 283-418 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Methyl2Heptanol` | 130.2279 | (volatile) | 327-637 | ✓ | — | ✓ | — | — | — | — |   |
| `2Methyl2Propanol` | 74.1216 | (volatile) | 304-452 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Methyl3Ethylpentane` | 114.2285 | (volatile) | 343-503 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Methylfuran` | 82.1020 | fit | 285-508 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `2Methylheptane` | 114.2285 | (volatile) | 337-503 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Methylhexane` | 100.202 | (volatile) | 318-473 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Methylindene` | 130.1864 | (volatile) | 439-620 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `2Methylnaphthalene` | 142.1971 | (volatile) | 461-673 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Methylnonane` | 142.2817 | (volatile) | 375-545 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Methyloctane` | 128.2551 | (volatile) | 354-521 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Methylpropanal` | 72.10572 | (volatile) | 309-444 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Methyltetrahydrofuran` | 86.1340 | fit | 279-508 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `2Nitropropane` | 89.09318 | (volatile) | 363-529 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Pentanol` | 88.14818 | (volatile) | 333-484 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Pentanone` | 86.1323 | (volatile) | 339-503 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `2Propoxyethanol` | 104.1490 | fit | 303-423 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `335Trimethylheptane` | 142.2817 | (volatile) | 374-539 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `33Diethylpentane` | 128.2551 | (volatile) | 374-532 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `33Dimethyl2Butanone` | 100.1589 | (volatile) | 344-510 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `33Dimethylhexane` | 114.2285 | (volatile) | 343-504 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `33Dimethylpentane` | 100.202 | (volatile) | 325-478 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `33Oxydipropanol` | 134.1750 | fit | 365-703 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `34Dimethylhexane` | 114.2285 | (volatile) | 272-569 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `34Dinitrotoluene` | 182.1335 | (volatile) | 520-740 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `35Dinitrotoluene` | 182.1335 | (volatile) | 484-720 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `3Ethylheptane` | 128.2551 | (volatile) | 363-522 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `3Ethylhexane` | 114.2285 | (volatile) | 272-566 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `3Ethylpentane` | 100.202 | (volatile) | 327-480 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `3Heptanone` | 114.1855 | (volatile) | 363-540 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `3Hexanone` | 100.1589 | (volatile) | 350-520 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `3Methyl1Butanol` | 88.1500 | fit | 336-446 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `3Methyl1Butene` | 70.1329 | (volatile) | 273-398 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `3Methyl2Butanol` | 88.1500 | fit | 324-384 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `3Methyl3Ethylpentane` | 114.2285 | (volatile) | 348-514 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `3Methylheptane` | 114.2285 | (volatile) | 343-506 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `3Methylhexane` | 100.202 | (volatile) | 326-475 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `3Methylnonane` | 142.2817 | (volatile) | 370-546 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `3Methyloctane` | 128.2551 | (volatile) | 355-523 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `3Methylpentane` | 86.17536 | (volatile) | 305-442 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `3Methylthiophene` | 98.1630 | fit | 333-388 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `3Pentanol` | 88.1500 | fit | 279-389 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `3Pentanone` | 86.1323 | (volatile) | 337-492 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `4Chlorotoluene` | 126.5830 | fit | 274-432 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `4EthylMXylene` | 134.2182 | (volatile) | 400-593 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `4EthylOXylene` | 134.2182 | (volatile) | 400-594 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `4Heptanone` | 114.1855 | (volatile) | 358-530 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `4MethylCis2Pentene` | 84.15948 | (volatile) | 300-442 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `4Methylheptane` | 114.2285 | (volatile) | 342-503 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `4Methylnonane` | 142.2817 | (volatile) | 374-541 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `4Methyloctane` | 128.2551 | (volatile) | 353-520 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `4MethylTrans2Pentene` | 84.15948 | (volatile) | 301-443 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `5Methyl2Hexanone` | 114.1855 | (volatile) | 367-538 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `5Methylnonane` | 142.2817 | (volatile) | 367-543 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `acenaphthene` | 154.2078 | (volatile) | 483-711 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `aceticAcid` | 60.052 | (volatile) | 290-392 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `aceticAnhydride` | 102.0886 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `acetone` | 58.080 | (volatile) | 259-508 | ✓ | ✓ | ✓ | — | — | — | ✓ | Σv_F, μ_L |
| `acetonitrile` | 41.05192 | (volatile) | 329-479 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `acetylChloride` | 78.49762 | (volatile) | 306-453 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `acetylene` | 26.038 | (volatile) | 192-308 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `acrylicAcid` | 72.06266 | (volatile) | 393-582 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `acrylonitrile` | 53.06262 | (volatile) | 323-480 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `adipicAcid` | 146.1412 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `air` | 28.96 | (volatile) | 80-119 | ✓ | ✓ | ✓ | — | — | — | — | Σv_F, μ_L |
| `allylAlcohol` | 58.0800 | fit | 311-546 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `aniline` | 93.12648 | (volatile) | 421-623 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `anisole` | 108.1378 | (volatile) | 385-568 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `Ar` | 39.948 | (volatile) | 83-94 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `benzene` | 78.114 | (volatile) | 288-354 | ✓ | ✓ | ✓ | — | — | — | ✓ | φ_WC, μ_L |
| `benzoBThiophene` | 134.1960 | fit | 434-494 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `benzoicAcid` | 122.1213 | (volatile) | 452-657 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `biphenyl` | 154.2078 | (volatile) | 474-707 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `bromine` | 159.808 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `bromobenzene` | 157.0079 | (volatile) | 403-603 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `butanal` | 72.10572 | (volatile) | 313-461 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `butylVinylEther` | 100.1589 | (volatile) | 331-480 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `carbonTetrachloride` | 153.8227 | (volatile) | 337-498 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `carbonylSulfide` | 60.0751 | (volatile) | 170-371 | ✓ | ✓ | — | — | — | — | ✓ |   |
| `chloroform` | 119.3776 | (volatile) | 322-481 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `chrysene` | 228.2879 | (volatile) | 598-867 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `cis12Dimethylcyclohexane` | 112.2126 | (volatile) | 364-526 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `cis12Dimethylcyclopentane` | 98.18607 | (volatile) | 344-492 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `cis13Dimethylcyclohexane` | 112.2126 | (volatile) | 356-529 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `cis13Dimethylcyclopentane` | 98.18607 | (volatile) | 332-486 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `cis14Dimethylcyclohexane` | 112.2126 | (volatile) | 359-533 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `cis2Butene` | 56.1063 | (volatile) | 196-427 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `cis2Hexene` | 84.15948 | (volatile) | 311-452 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `cis2Pentene` | 70.1329 | (volatile) | 286-419 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `cisDecahydronaphthalene` | 138.2499 | (volatile) | 425-628 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `CO` | 28.010 | (volatile) | 68-132 | ✓ | — | ✓ | — | — | — | ✓ | Σv_F |
| `compA` | 30.0 | (volatile) | 300-400 | ✓ | ✓ | — | — | — | — | ✓ |   |
| `compB` | 50.0 | (volatile) | 300-400 | ✓ | ✓ | — | — | — | — | ✓ |   |
| `compC` | 50.0 | (volatile) | 300-400 | ✓ | ✓ | — | — | — | — | ✓ |   |
| `cumene` | 120.1916 | (volatile) | 380-562 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `cumeneHydroperoxide` | 152.1904 | (volatile) | 368-494 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `cyclobutane` | 56.10632 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `cyclohexane` | 84.1595 | (volatile) | 280-543 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `cyclohexanol` | 100.1589 | (volatile) | 394-576 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `cyclohexanone` | 98.143 | (volatile) | 392-566 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `cyclohexene` | 82.1436 | (volatile) | 336-500 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `cyclopentane` | 70.1329 | (volatile) | 230-501 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `cyclopentanol` | 86.1340 | fit | 280-413 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `cyclopentanone` | 84.1180 | fit | 292-403 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `cyclopropane` | 42.0810 | (volatile) | 274-391 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `D2` | 4.0282 | (volatile) | 19-38 | ✓ | ✓ | ✓ | — | — | — | — |   |
| `diButylCarbonate` | 174.2374 | fit | 287-478 | ✓ | — | ✓ | — | — | — | — |   |
| `dichloroacetaldehyde` | 112.9427 | (volatile) | 339-489 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `dichloroacetylChloride` | 147.3877 | (volatile) | 361-515 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `Dichloroethane` | 98.9590 | (volatile) | 253-550 | ✓ | ✓ | — | — | — | — | ✓ | μ_L |
| `dichloromethane` | 84.9270 | fit | 286-311 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `dicyclopentadiene` | 132.2023 | (volatile) | 397-593 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `diethanolamine` | 105.1356 | fit | 428-452 | ✓ | — | ✓ | — | — | — | ✓ | μ_L |
| `diethylamine` | 73.13684 | (volatile) | 298-443 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `diEthylCarbonate` | 118.1311 | fit | 238-399 | ✓ | — | ✓ | — | — | — | ✓ | μ_L |
| `diethylDisulfide` | 122.2522 | (volatile) | 387-568 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `diethyleneGlycol` | 106.1204 | (volatile) | 447-669 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `diethyleneGlycolDibutylEther` | 218.3370 | fit | 403-473 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `diethyleneGlycolDiethylEther` | 162.2290 | fit | 363-453 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `diethyleneGlycolMonohexylEther` | 190.2830 | fit | 403-473 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `diethylenetriamine` | 103.1661 | (volatile) | 420-606 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `diethylethanolamine` | 117.1894 | fit | 274-450 | ✓ | — | ✓ | — | — | — | ✓ | μ_L |
| `diethylEther` | 74.1216 | (volatile) | 270-459 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `diethylSuccinate` | 174.1960 | fit | 290-468 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `diethylSulfide` | 90.18719 | (volatile) | 337-496 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `diIsobutylEther` | 130.2310 | fit | 331-395 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `diisobutylKetone` | 142.2386 | (volatile) | 373-554 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `diisopropanolamine` | 133.1888 | (volatile) | 407-601 | ✓ | — | ✓ | — | — | — | ✓ | μ_L |
| `diisopropylamine` | 101.19 | (volatile) | 314-468 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `diisopropylEther` | 102.1748 | (volatile) | 300-450 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `diisopropylKetone` | 114.1855 | (volatile) | 350-520 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `dimethylacetylene` | 54.09044 | (volatile) | 287-424 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `dimethylCarbonate` | 90.0779 | (volatile) | 278-546 | ✓ | ✓ | — | — | — | — | ✓ | μ_L |
| `dimethylDisulfide` | 94.19904 | (volatile) | 364-525 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `dimethylethanolamine` | 89.13624 | fit | 273-448 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `dimethylEther` | 46.0684 | (volatile) | 180-392 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `dimethylSulfide` | 62.13404 | (volatile) | 304-451 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `dimethylSulfoxide` | 78.13344 | fit | 293-463 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `dimethylTerephthalate` | 194.184 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `diNButylEther` | 130.2279 | fit | 263-508 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `diNPropylDisulfide` | 150.3054 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `diNPropylEther` | 102.1770 | fit | 303-363 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `diNPropylSulfide` | 118.2404 | (volatile) | 368-539 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `diPhenylCarbonate` | 214.2167 | (volatile) | 458-795 | ✓ | — | ✓ | — | — | — | — | μ_L |
| `diphenylDisulfide` | 218.3378 | (volatile) | 516-725 | ✓ | — | ✓ | — | — | — | ✓ | μ_L |
| `diphenylmethane` | 168.2390 | fit | 298-623 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `diSecButylEther` | 130.2279 | (volatile) | 350-500 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `diTertButylDisulfide` | 178.3585 | (volatile) | 423-601 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `ethane` | 30.070 | (volatile) | 168-305 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `ethanol` | 46.069 | (volatile) | 273-369 | ✓ | ✓ | ✓ | — | — | — | ✓ | φ_WC, μ_L |
| `ethylAcetate` | 88.106 | (volatile) | 266-373 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `ethylacetylene` | 54.09044 | (volatile) | 264-394 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `ethylamine` | 45.08368 | (volatile) | 275-404 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `ethylBenzene` | 106.1650 | (volatile) | 278-605 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `ethylButanoate` | 116.1600 | fit | 349-433 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `ethylChloride` | 64.5141 | (volatile) | 277-409 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `ethylcyclohexane` | 112.2126 | (volatile) | 367-539 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `ethylcyclopentane` | 98.18607 | (volatile) | 343-511 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `ethylDecanoate` | 200.3220 | fit | 294-462 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `ethylene` | 28.054 | (volatile) | 150-283 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `ethyleneCarbonate` | 88.06207 | (volatile) | 492-701 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `ethylenediamine` | 60.09832 | (volatile) | 356-528 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `ethyleneGlycol` | 62.06784 | (volatile) | 433-647 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `ethyleneOxide` | 44.0526 | (volatile) | 211-460 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `ethylFormate` | 74.07854 | (volatile) | 310-453 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `ethylHexanoate` | 144.2140 | fit | 253-462 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `ethylLactate` | 118.1320 | fit | 275-426 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `ethylMercaptan` | 62.13404 | (volatile) | 300-440 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `ethylMethylDisulfide` | 108.2256 | (volatile) | 394-559 | ✓ | — | ✓ | — | — | — | ✓ | μ_L |
| `ethylOctanoate` | 172.2680 | fit | 273-452 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `ethylPhenylCarbonate` | 166.1739 | (volatile) | 418-717 | ✓ | — | ✓ | — | — | — | — |   |
| `ethylPropionate` | 102.1330 | fit | 348-409 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `ethylPropylDisulfide` | 136.2788 | (volatile) | 399-582 | ✓ | — | ✓ | — | — | — | ✓ | μ_L |
| `ethylTertPentylEther` | 116.2013 | (volatile) | 327-471 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `fluoranthene` | 202.2506 | (volatile) | 543-795 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `fluorene` | 166.2185 | (volatile) | 503-734 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `fluorine` | 37.9968 | (volatile) | 65-142 | ✓ | ✓ | ✓ | — | — | — | — |   |
| `fluoroethane` | 48.0600 | fit | 231-372 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `furan` | 68.0750 | fit | 284-304 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `furfural` | 96.08406 | fit | 277-430 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `glycerol` | 92.09382 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `H2` | 2.016 | (volatile) | 14-25 | ✓ | — | ✓ | — | — | — | ✓ | Σv_F |
| `H2O2` | 34.0147 | (volatile) | 330-446 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `HCHO` | 30.026 | (volatile) | 230-300 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `HCN` | 27.026 | (volatile) | 260-330 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `He` | 4.0026 | (volatile) | 2-5 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `heavyWater` | 20.027508 | (volatile) | ✓ | ✓ | ✓ | — | — | — | — | ✓ |   |
| `heptanal` | 114.1855 | (volatile) | 364-535 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `hexafluorobenzene` | 186.0540 | fit | 288-333 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `hexamethyldisiloxane` | 162.3775 | (volatile) | 233-508 | ✓ | ✓ | — | — | — | — | ✓ |   |
| `hexanal` | 100.1589 | (volatile) | 352-512 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `hfe143m` | 100.0400 | (volatile) | 240-370 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `hydrogenIodide` | 127.9124 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `indane` | 118.1757 | (volatile) | 412-612 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `indene` | 116.1598 | (volatile) | 413-600 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `iodobenzene` | 204.0084 | (volatile) | 433-645 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `isoButane` | 58.1222 | (volatile) | 184-400 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `isoButene` | 56.1063 | (volatile) | 188-410 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `isobutylAcetate` | 116.1583 | (volatile) | 337-503 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `isobutylbenzene` | 134.2182 | (volatile) | 390-582 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `isobutylMercaptan` | 90.18719 | (volatile) | 338-500 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `isohexane` | 86.1754 | (volatile) | 224-488 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `isopentane` | 72.1488 | (volatile) | 207-451 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `isopentylAcetate` | 130.1870 | fit | 368-416 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `isoprene` | 68.11702 | (volatile) | 293-428 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `isopropanol` | 60.09502 | (volatile) | 305-457 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `isopropylAcetate` | 102.1317 | (volatile) | 312-462 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `isopropylButylEther` | 116.2013 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `isopropylcyclopentane` | 112.2126 | (volatile) | 363-530 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `isopropylMercaptan` | 76.16061 | (volatile) | 169-458 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `krypton` | 83.7980 | (volatile) | 116-205 | ✓ | ✓ | — | — | — | — | — |   |
| `maleicAcid` | 116.0722 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `maleicAnhydride` | 98.05688 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `mCresol` | 108.1378 | (volatile) | 425-635 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `mCymene` | 134.2182 | (volatile) | 400-580 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `MD3M` | 384.8390 | (volatile) | 283-615 | ✓ | ✓ | — | — | — | — | ✓ |   |
| `MD4M` | 458.9933 | (volatile) | 294-640 | ✓ | ✓ | — | — | — | — | ✓ |   |
| `mDichlorobenzene` | 147.002 | (volatile) | 414-615 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `mDiethylbenzene` | 134.2182 | (volatile) | 399-588 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `MDM` | 236.5315 | (volatile) | 254-554 | ✓ | ✓ | — | — | — | — | ✓ |   |
| `mesitylene` | 120.1916 | (volatile) | 383-573 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methacrylicAcid` | 86.08924 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methacrylonitrile` | 67.0892 | (volatile) | 337-487 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methanol` | 32.042 | (volatile) | 288-356 | ✓ | ✓ | ✓ | — | — | — | ✓ | φ_WC, μ_L |
| `methylAcetate` | 74.079 | (volatile) | 250-351 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `methylal` | 76.09442 | (volatile) | 293-431 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylamine` | 31.0571 | (volatile) | 259-379 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylButanoate` | 102.1330 | fit | 274-413 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `methylChloride` | 50.48752 | (volatile) | 250-373 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylcyclohexane` | 98.18607 | (volatile) | 344-511 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylcyclopentane` | 84.15948 | (volatile) | 320-478 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylDecanoate` | 186.2950 | fit | 273-433 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylDiEthanolAmine` | 119.1622 | fit | 410-738 | ✓ | — | ✓ | — | — | — | ✓ | μ_L |
| `methylethanolamine` | 75.10966 | fit | 275-451 | ✓ | — | ✓ | — | — | — | ✓ | μ_L |
| `methylEthylCarbonate` | 104.1045 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | — |   |
| `methylEthylEther` | 60.09502 | (volatile) | 265-394 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylEthylKetone` | 72.10572 | (volatile) | 326-480 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylEthylSulfide` | 76.16061 | (volatile) | 321-475 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylFormate` | 60.05196 | (volatile) | 293-438 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylHeptanoate` | 144.2140 | fit | 278-444 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylHexanoate` | 130.1870 | fit | 263-422 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `methylIodide` | 141.939 | (volatile) | 317-460 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylIsobutylEther` | 88.14818 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylIsobutylKetone` | 100.1589 | (volatile) | 348-514 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylIsopropylEther` | 74.1216 | (volatile) | 287-411 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylIsopropylKetone` | 86.1323 | (volatile) | 347-494 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylLactate` | 104.1050 | fit | 303-413 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylLevulinate` | 130.1430 | fit | 294-453 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylLinoleate` | 294.4721 | (volatile) | 360-783 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylLinolenate` | 292.4562 | (volatile) | 347-757 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylMercaptan` | 48.10746 | (volatile) | 283-419 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylMethacrylate` | 100.1158 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylNPropylEther` | 74.1216 | (volatile) | 284-422 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylNPropylSulfide` | 90.18719 | (volatile) | 332-480 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylOctanoate` | 158.2410 | fit | 283-433 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylOleate` | 296.4879 | (volatile) | 352-766 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `methylPalmitate` | 270.4507 | (volatile) | 340-740 | ✓ | ✓ | ✓ | — | — | — | — | μ_L |
| `methylPentanoate` | 116.1600 | fit | 275-417 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylPhenylCarbonate` | 152.1473 | (volatile) | 393-705 | ✓ | — | ✓ | — | — | — | — |   |
| `methylPropionate` | 88.10513 | (volatile) | 322-476 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylStearate` | 298.5038 | (volatile) | 349-760 | ✓ | ✓ | ✓ | — | — | — | — | μ_L |
| `methylTButylSulfide` | 104.2138 | (volatile) | 351-510 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylTertButylEther` | 88.14818 | (volatile) | 299-445 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylTertPentylEther` | 102.1748 | fit | 274-360 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `mEthyltoluene` | 120.1916 | (volatile) | 383-565 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `methylTPentylSulfide` | 118.2404 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `mNitrotoluene` | 137.136 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `monochlorobenzene` | 112.5569 | (volatile) | 383-568 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `monoethanolamine` | 61.08308 | fit | 274-442 | ✓ | — | ✓ | — | — | — | ✓ | μ_L |
| `morpholine` | 87.1220 | fit | 273-401 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `mXylene` | 106.1650 | (volatile) | 278-605 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `N2` | 28.013 | (volatile) | 61-84 | ✓ | ✓ | ✓ | — | — | — | ✓ | Σv_F |
| `N2O` | 44.013 | (volatile) | 181-197 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `nAminoethylEthanolamine` | 104.1509 | fit | 323-374 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nAminoethylPiperazine` | 129.2034 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `naphthalene` | 128.1705 | (volatile) | 453-673 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nButane` | 58.123 | (volatile) | 273-425 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nButanol` | 74.122 | (volatile) | 295-392 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nButylAcetate` | 116.1583 | (volatile) | 349-516 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nButylbenzene` | 134.2182 | (volatile) | 400-585 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nButylButanoate` | 144.2140 | fit | 406-457 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nButylcyclohexane` | 140.2658 | (volatile) | 406-593 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nButylcyclopentane` | 126.2392 | (volatile) | 376-549 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nButylFormate` | 102.1330 | fit | 313-395 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nButylPropionate` | 130.1870 | fit | 351-436 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nButyricAcid` | 88.10513 | (volatile) | 375-561 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nDecane` | 142.2817 | (volatile) | 278-605 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nDocosane` | 310.6006 | (volatile) | 490-713 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nDodecane` | 170.3348 | (volatile) | 296-645 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nEicosane` | 282.5475 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ | μ_L |
| `neon` | 20.1790 | (volatile) | 25-44 | ✓ | ✓ | ✓ | — | — | — | — |   |
| `neopentane` | 72.1488 | (volatile) | 257-425 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nHeneicosane` | 296.5741 | (volatile) | 485-705 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nHeptacosane` | 380.7336 | (volatile) | 514-727 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nHeptadecane` | 240.4677 | (volatile) | 448-650 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nHeptane` | 100.2020 | (volatile) | 244-530 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nHexacosane` | 366.707 | (volatile) | 510-742 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nHexadecane` | 226.4412 | (volatile) | 438-632 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nHexane` | 86.178 | (volatile) | 286-343 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nHexylAcetate` | 144.2114 | fit | 274-440 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nHexylMercaptan` | 118.2404 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nitrobenzene` | 123.1094 | (volatile) | 263-626 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nitroethane` | 75.0666 | (volatile) | 334-500 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nitrogenTetroxide` | 92.011 | (volatile) | 263-387 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nitrogenTrioxide` | 76.0116 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `nitromethane` | 61.04002 | (volatile) | 353-516 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `NMethyl13Diaminopropane` | 88.1540 | fit | 276-432 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nNDimethylacetamide` | 87.12036 | (volatile) | 402-573 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nNDimethylformamide` | 73.09378 | (volatile) | 397-581 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nNonacosane` | 408.7867 | (volatile) | 517-732 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nNonadecane` | 268.5209 | (volatile) | 457-663 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nNonane` | 128.2551 | (volatile) | 268-583 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `NO` | 30.006 | (volatile) | 107-128 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `NO2` | 46.006 | (volatile) | 250-294 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `nOctacosane` | 394.7601 | (volatile) | 508-753 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nOctadecane` | 254.4943 | (volatile) | 450-653 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nOctane` | 114.231 | (volatile) | 326-399 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `novec649` | 316.0438 | (volatile) | 199-433 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nPentacosane` | 352.6804 | (volatile) | 503-735 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nPentadecane` | 212.4146 | (volatile) | 434-633 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nPentane` | 72.1488 | (volatile) | 211-460 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nPentylAcetate` | 130.1849 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nPropylAcetate` | 102.1317 | (volatile) | 331-493 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nPropylbenzene` | 120.1916 | (volatile) | 383-565 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nPropylcyclohexane` | 126.2392 | (volatile) | 384-566 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nPropylcyclopentane` | 112.2126 | (volatile) | 358-526 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nPropylFormate` | 88.10513 | (volatile) | 323-483 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nPropylMercaptan` | 76.16061 | (volatile) | 322-477 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nPropylPropionate` | 116.1600 | fit | 362-413 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `nTetracosane` | 338.6538 | (volatile) | 487-728 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nTetradecane` | 198.388 | (volatile) | 420-606 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nTricosane` | 324.6272 | (volatile) | 493-721 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nTridecane` | 184.3614 | (volatile) | 411-606 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `nUndecane` | 156.3083 | (volatile) | 287-626 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `O2` | 31.999 | (volatile) | 54-154 | ✓ | — | ✓ | — | — | — | ✓ | Σv_F |
| `O3` | 47.9982 | (volatile) | 80-161 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `oCresol` | 108.1378 | (volatile) | 419-625 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `oCymene` | 134.2182 | (volatile) | 403-585 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `oDichlorobenzene` | 147.002 | (volatile) | 429-634 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `oDiethylbenzene` | 134.2182 | (volatile) | 405-601 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `oEthyltoluene` | 120.1916 | (volatile) | 394-578 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `oNitrotoluene` | 137.136 | (volatile) | 436-645 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `OrthoDeuterium` | 4.0282 | (volatile) | 19-38 | ✓ | ✓ | — | — | — | — | — |   |
| `OrthoHydrogen` | 2.0159 | (volatile) | 15-33 | ✓ | ✓ | — | — | — | — | — |   |
| `oToluicAcid` | 136.1479 | (volatile) | 456-674 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `oxalicAcid` | 90.03488 | (volatile) | 497-719 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `oXylene` | 106.1650 | (volatile) | 284-618 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `ParaDeuterium` | 4.0282 | (volatile) | 19-38 | ✓ | ✓ | — | — | — | — | — |   |
| `ParaHydrogen` | 2.0159 | (volatile) | 15-32 | ✓ | ✓ | — | — | — | — | — |   |
| `pCresol` | 108.1378 | (volatile) | 425-633 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `pCymene` | 134.2182 | (volatile) | 393-581 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `pDichlorobenzene` | 147.002 | (volatile) | 421-609 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `pDiethylbenzene` | 134.2182 | (volatile) | 395-590 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `pDiisopropylbenzene` | 162.2713 | (volatile) | 407-598 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `pentanal` | 86.1323 | (volatile) | 337-485 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `pentanenitrile` | 83.1340 | fit | 329-413 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `pentanoicAcid` | 102.1330 | fit | 403-452 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `perfluorooctane` | 438.0520 | fit | 278-353 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `pEthyltoluene` | 120.1916 | (volatile) | 386-573 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `phenanthrene` | 178.2292 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `phenol` | 94.11124 | (volatile) | 417-620 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `phosgene` | 98.9161 | (volatile) | 276-406 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `phthalicAcid` | 166.1308 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `piperazine` | 86.1356 | (volatile) | 392-573 | ✓ | — | ✓ | — | — | — | ✓ | μ_L |
| `pNitrotoluene` | 137.136 | (volatile) | 445-655 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `pPhenylenediamine` | 108.1411 | (volatile) | 490-715 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `propadiene` | 40.06386 | (volatile) | 237-353 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `propanal` | 58.07914 | (volatile) | 297-434 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `propane` | 44.096 | (volatile) | 231-321 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `propionicAcid` | 74.07854 | (volatile) | 362-527 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `propionitrile` | 55.0785 | (volatile) | 342-504 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `propylene` | 42.081 | (volatile) | 165-242 | ✓ | — | ✓ | — | — | — | ✓ |   |
| `propyleneCarbonate` | 102.0886 | (volatile) | 472-691 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `propyne` | 40.0600 | (volatile) | 274-395 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `pToluicAcid` | 136.1479 | (volatile) | 470-689 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `pXylene` | 106.1650 | (volatile) | 287-604 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `pyrene` | 202.2506 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `pyridine` | 79.0999 | (volatile) | 373-555 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `pyrrole` | 67.0910 | fit | 338-402 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
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
| `salicylicAcid` | 138.1207 | (volatile) | 445-662 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `secButylbenzene` | 134.2182 | (volatile) | 400-591 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `secButylMercaptan` | 90.18719 | (volatile) | 332-490 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `SF6` | 146.0554 | (volatile) | 224-312 | ✓ | ✓ | — | — | — | — | ✓ |   |
| `squalane` | 422.8133 | fit | 298-686 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `styrene` | 104.149 | (volatile) | 383-553 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `sulfolane` | 120.1701 | (volatile) | 522-766 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `terephthalicAcid` | 166.1308 | (volatile) | ✓ | ✓ | — | ✓ | — | — | — | ✓ |   |
| `tertButylAcetate` | 116.1600 | fit | 308-539 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `tertButylbenzene` | 134.2182 | (volatile) | 398-590 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `tertButylcyclohexane` | 140.2658 | (volatile) | 393-586 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `tertButylEthylEther` | 102.1748 | (volatile) | 310-454 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `tertButylMercaptan` | 90.18719 | (volatile) | 318-477 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `tetradecanoicAcid` | 228.3760 | fit | 298-585 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `tetraethyleneGlycol` | 194.2255 | (volatile) | 477-712 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `tetrahydrofuran` | 72.10572 | (volatile) | 328-483 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `tetrahydropyran` | 86.1340 | fit | 258-362 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `thiophene` | 84.13956 | (volatile) | 352-513 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `toluene` | 92.141 | (volatile) | 273-380 | ✓ | ✓ | ✓ | — | — | — | ✓ | φ_WC, Σv_F, μ_L |
| `trans12Dimethylcyclohexane` | 112.2126 | (volatile) | 358-531 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `trans12Dimethylcyclopentane` | 98.18607 | (volatile) | 333-490 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `trans13Dimethylcyclohexane` | 112.2126 | (volatile) | 361-532 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `trans13Dimethylcyclopentane` | 98.18607 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `trans14Dimethylcyclohexane` | 112.2126 | (volatile) | 355-530 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `trans2Butene` | 56.1063 | (volatile) | 193-420 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
| `trans2Hexene` | 84.15948 | (volatile) | 308-451 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `trans2Pentene` | 70.1329 | (volatile) | 285-420 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `transDecahydronaphthalene` | 138.2499 | (volatile) | 413-617 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `trichloroacetaldehyde` | 147.3877 | (volatile) | 345-495 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `trichloroacetylChloride` | 181.8328 | (volatile) | 379-543 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `trichloroethylene` | 131.3883 | (volatile) | 343-511 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `triethanolamine` | 149.1882 | (volatile) | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `triethylamine` | 101.19 | fit | 273-353 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `triethyleneGlycol` | 150.173 | (volatile) | 463-690 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `trimethylamine` | 59.11026 | (volatile) | 261-389 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `vinylAcetate` | 86.08924 | (volatile) | 302-448 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `vinylChloride` | 62.49822 | (volatile) | 259-389 | ✓ | ✓ | ✓ | — | — | — | ✓ | μ_L |
| `vinylPropionate` | 100.1170 | fit | 321-368 | ✓ | ✓ | ✓ | — | — | — | ✓ |   |
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
| `calciumNitrate` | 164.086 | nonvolatile | — | — | — | — | — | — | — | — |   |
| `CH` | 13.019 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `CH2` | 14.027 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
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
| `glucose` | 180.16 | nonvolatile | — | — | ✓ | ✓ | — | — | — | ✓ |   |
| `graphite` | 12.011 | nonvolatile | — | — | — | ✓ | — | — | — | — |   |
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
| `KBr` | 119.002 | nonvolatile | — | — | — | — | — | — | — | — |   |
| `KNO3` | 101.102 | nonvolatile | — | — | — | — | — | — | — | — |   |
| `LiCl` | 42.394 | nonvolatile | — | — | ✓ | — | — | — | — | — |   |
| `MgCl2` | 95.205 | nonvolatile | — | — | — | — | — | — | — | — |   |
| `MgSO4` | 120.37 | nonvolatile | — | — | — | — | — | — | — | — |   |
| `N` | 14.007 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `N2H2` | 30.03 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `N2H3` | 31.038 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `N2H4` | 32.046 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `NaBr` | 102.894 | nonvolatile | — | — | — | — | — | — | — | — |   |
| `NaCl` | 58.44 | nonvolatile | — | — | — | — | — | ✓ | — | — | ν=2 |
| `NaF` | 41.988 | nonvolatile | — | — | — | — | — | — | — | — |   |
| `NaNO3` | 84.994 | nonvolatile | — | — | — | — | — | — | — | — | μ_L |
| `NaOH` | 39.997 | nonvolatile | — | — | — | — | — | ✓ | — | — | ν=2 |
| `NCO` | 42.017 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `NH` | 15.0146 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
| `NH2` | 16.0226 | nonvolatile | — | ✓ | — | ✓ | — | — | — | — |   |
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
| `1122Tetrachloroethane-water` |
| `112Trichloroethane-water` |
| `11Dichloroethane-water` |
| `123Trimethylbenzene-water` |
| `124Trimethylbenzene-water` |
| `13Butadiene-1Pentanol` |
| `13Butadiene-1Propanol` |
| `13Butadiene-2Butanol` |
| `13Butadiene-2Methyl1Propanol` |
| `13Butadiene-2Methyl2Propanol` |
| `13Butadiene-2Pentanol` |
| `13Butadiene-allylAlcohol` |
| `13Butadiene-benzene` |
| `13Butadiene-isopropanol` |
| `13Butadiene-mCresol` |
| `13Butadiene-mXylene` |
| `13Butadiene-nButanol` |
| `13Butadiene-oCresol` |
| `13Butadiene-oXylene` |
| `13Butadiene-pCresol` |
| `13Butadiene-pXylene` |
| `13Butadiene-styrene` |
| `13Butadiene-tetrahydropyran` |
| `13Butadiene-toluene` |
| `14Dioxane-water` |
| `1Butene-1Pentanol` |
| `1Butene-1Propanol` |
| `1Butene-2Butanol` |
| `1Butene-2Methyl1Propanol` |
| `1Butene-2Methyl2Propanol` |
| `1Butene-2Pentanol` |
| `1Butene-allylAlcohol` |
| `1Butene-benzene` |
| `1Butene-isopropanol` |
| `1Butene-mCresol` |
| `1Butene-mXylene` |
| `1Butene-nButanol` |
| `1Butene-oCresol` |
| `1Butene-oXylene` |
| `1Butene-pCresol` |
| `1Butene-pXylene` |
| `1Butene-styrene` |
| `1Butene-tetrahydropyran` |
| `1Butene-toluene` |
| `1Hexanol-water` |
| `1Methylnaphthalene-water` |
| `1Nitropropane-water` |
| `1Pentanol-water` |
| `1Propanol-water` |
| `2Butanol-water` |
| `2Chlorotoluene-water` |
| `2Heptanone-water` |
| `2Methyl2Propanol-water` |
| `2Nitropropane-water` |
| `2Pentanone-water` |
| `4Chlorotoluene-water` |
| `Ar-NH3` |
| `Ar-methylChloride` |
| `Ar-water` |
| `C4H4-water` |
| `CH4-methylDiEthanolAmine` |
| `CH4-water` |
| `CO-water` |
| `CO2-cyclohexanol` |
| `CO2-methylChloride` |
| `CO2-water` |
| `CS2-water` |
| `Cl2-water` |
| `H2-NH3` |
| `H2-water` |
| `H2O2-water` |
| `H2S-water` |
| `HCHO-water` |
| `HCN-water` |
| `HCl-water` |
| `HO2-water` |
| `HOCl-water` |
| `HONO-water` |
| `He-methylChloride` |
| `He-water` |
| `N2-NH3` |
| `N2-methylChloride` |
| `N2-water` |
| `N2O-water` |
| `NH3-ethanol` |
| `NH3-water` |
| `NO-water` |
| `NO2-water` |
| `O2-acetonitrile` |
| `O2-cyclohexanol` |
| `O2-methylChloride` |
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
| `R32-1Propanol` |
| `R32-ethanol` |
| `R32-methanol` |
| `R32-nButanol` |
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
| `bromine-water` |
| `bromobenzene-water` |
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
| `cis2Butene-1Pentanol` |
| `cis2Butene-1Propanol` |
| `cis2Butene-2Butanol` |
| `cis2Butene-2Methyl1Butanol` |
| `cis2Butene-2Methyl1Propanol` |
| `cis2Butene-2Methyl2Butanol` |
| `cis2Butene-2Methyl2Propanol` |
| `cis2Butene-2Pentanol` |
| `cis2Butene-3Methyl1Butanol` |
| `cis2Butene-allylAlcohol` |
| `cis2Butene-benzene` |
| `cis2Butene-isopropanol` |
| `cis2Butene-mCresol` |
| `cis2Butene-mXylene` |
| `cis2Butene-methanol` |
| `cis2Butene-nButanol` |
| `cis2Butene-oCresol` |
| `cis2Butene-oXylene` |
| `cis2Butene-pCresol` |
| `cis2Butene-pXylene` |
| `cis2Butene-styrene` |
| `cis2Butene-tetrahydropyran` |
| `cis2Butene-toluene` |
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
| `dimethylEther-1Pentanol` |
| `dimethylEther-1Propanol` |
| `dimethylEther-2Butanol` |
| `dimethylEther-2Methyl1Butanol` |
| `dimethylEther-2Methyl1Propanol` |
| `dimethylEther-2Methyl2Butanol` |
| `dimethylEther-2Methyl2Propanol` |
| `dimethylEther-2Pentanol` |
| `dimethylEther-3Methyl1Butanol` |
| `dimethylEther-allylAlcohol` |
| `dimethylEther-benzene` |
| `dimethylEther-isopropanol` |
| `dimethylEther-mCresol` |
| `dimethylEther-mXylene` |
| `dimethylEther-methanol` |
| `dimethylEther-nButanol` |
| `dimethylEther-oCresol` |
| `dimethylEther-oXylene` |
| `dimethylEther-pCresol` |
| `dimethylEther-pXylene` |
| `dimethylEther-styrene` |
| `dimethylEther-tetrahydropyran` |
| `dimethylEther-toluene` |
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
| `ethylChloride-1Pentanol` |
| `ethylChloride-1Propanol` |
| `ethylChloride-2Butanol` |
| `ethylChloride-2Methyl1Butanol` |
| `ethylChloride-2Methyl1Propanol` |
| `ethylChloride-2Methyl2Butanol` |
| `ethylChloride-2Methyl2Propanol` |
| `ethylChloride-2Pentanol` |
| `ethylChloride-3Methyl1Butanol` |
| `ethylChloride-allylAlcohol` |
| `ethylChloride-benzene` |
| `ethylChloride-isopropanol` |
| `ethylChloride-mCresol` |
| `ethylChloride-mXylene` |
| `ethylChloride-methanol` |
| `ethylChloride-nButanol` |
| `ethylChloride-oCresol` |
| `ethylChloride-oXylene` |
| `ethylChloride-pCresol` |
| `ethylChloride-pXylene` |
| `ethylChloride-styrene` |
| `ethylChloride-tetrahydropyran` |
| `ethylChloride-toluene` |
| `ethylFormate-water` |
| `ethylMercaptan-water` |
| `ethylTertButylEther-water` |
| `ethylacetylene-water` |
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
| `isoButane-1Pentanol` |
| `isoButane-1Propanol` |
| `isoButane-2Butanol` |
| `isoButane-2Methyl1Propanol` |
| `isoButane-2Methyl2Propanol` |
| `isoButane-2Pentanol` |
| `isoButane-allylAlcohol` |
| `isoButane-benzene` |
| `isoButane-isopropanol` |
| `isoButane-mCresol` |
| `isoButane-mXylene` |
| `isoButane-nButanol` |
| `isoButane-oCresol` |
| `isoButane-oXylene` |
| `isoButane-pCresol` |
| `isoButane-pXylene` |
| `isoButane-styrene` |
| `isoButane-tetrahydropyran` |
| `isoButane-toluene` |
| `isoButane-water` |
| `isoButene-1Pentanol` |
| `isoButene-1Propanol` |
| `isoButene-2Butanol` |
| `isoButene-2Methyl1Propanol` |
| `isoButene-2Methyl2Propanol` |
| `isoButene-2Pentanol` |
| `isoButene-allylAlcohol` |
| `isoButene-benzene` |
| `isoButene-isopropanol` |
| `isoButene-mCresol` |
| `isoButene-mXylene` |
| `isoButene-nButanol` |
| `isoButene-oCresol` |
| `isoButene-oXylene` |
| `isoButene-pCresol` |
| `isoButene-pXylene` |
| `isoButene-styrene` |
| `isoButene-tetrahydropyran` |
| `isoButene-toluene` |
| `isoButene-water` |
| `isohexane-water` |
| `isoprene-water` |
| `isopropylAcetate-water` |
| `krypton-water` |
| `mCresol-water` |
| `mDichlorobenzene-water` |
| `mXylene-water` |
| `mesitylene-water` |
| `methanethiol-water` |
| `methanol-water` |
| `methylAcetate-water` |
| `methylBenzoate-water` |
| `methylEthylKetone-water` |
| `methylFormate-water` |
| `methylIodide-water` |
| `methylIsobutylKetone-water` |
| `methylMercaptan-water` |
| `methylMethacrylate-water` |
| `methylamine-water` |
| `methylcyclohexane-water` |
| `monochlorobenzene-water` |
| `morpholine-water` |
| `mtbe-water` |
| `nButane-1Pentanol` |
| `nButane-1Propanol` |
| `nButane-2Butanol` |
| `nButane-2Methyl1Propanol` |
| `nButane-2Methyl2Propanol` |
| `nButane-2Pentanol` |
| `nButane-allylAlcohol` |
| `nButane-benzene` |
| `nButane-isopropanol` |
| `nButane-mCresol` |
| `nButane-mXylene` |
| `nButane-nButanol` |
| `nButane-oCresol` |
| `nButane-oXylene` |
| `nButane-pCresol` |
| `nButane-pXylene` |
| `nButane-styrene` |
| `nButane-tetrahydropyran` |
| `nButane-toluene` |
| `nButane-water` |
| `nButanol-water` |
| `nButylAcetate-water` |
| `nHeptane-water` |
| `nHexane-water` |
| `nNonane-water` |
| `nOctane-water` |
| `nPentane-water` |
| `nPropylAcetate-water` |
| `nPropylFormate-water` |
| `nPropylMercaptan-water` |
| `naphthalene-water` |
| `neon-water` |
| `neopentane-water` |
| `nitrobenzene-water` |
| `nitroethane-water` |
| `nitrogenTetroxide-water` |
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
| `pCymene-water` |
| `pDichlorobenzene-water` |
| `pXylene-water` |
| `pentan3one-water` |
| `pentanal-water` |
| `pentanoicAcid-water` |
| `phenanthrene-water` |
| `phenol-water` |
| `phosgene-water` |
| `piperazine-water` |
| `piperidine-water` |
| `propanal-water` |
| `propane-1Pentanol` |
| `propane-1Propanol` |
| `propane-2Butanol` |
| `propane-2Methyl1Propanol` |
| `propane-2Methyl2Propanol` |
| `propane-2Pentanol` |
| `propane-allylAlcohol` |
| `propane-benzene` |
| `propane-isopropanol` |
| `propane-mCresol` |
| `propane-mXylene` |
| `propane-nButanol` |
| `propane-oCresol` |
| `propane-oXylene` |
| `propane-pCresol` |
| `propane-pXylene` |
| `propane-styrene` |
| `propane-tetrahydropyran` |
| `propane-toluene` |
| `propane-water` |
| `propionitrile-water` |
| `propylAcetate-water` |
| `propylbenzene-water` |
| `propylene-1Pentanol` |
| `propylene-1Propanol` |
| `propylene-2Butanol` |
| `propylene-2Methyl1Propanol` |
| `propylene-2Methyl2Propanol` |
| `propylene-2Pentanol` |
| `propylene-allylAlcohol` |
| `propylene-benzene` |
| `propylene-isopropanol` |
| `propylene-mCresol` |
| `propylene-mXylene` |
| `propylene-nButanol` |
| `propylene-oCresol` |
| `propylene-oXylene` |
| `propylene-pCresol` |
| `propylene-pXylene` |
| `propylene-styrene` |
| `propylene-tetrahydropyran` |
| `propylene-toluene` |
| `propylene-water` |
| `propyleneOxide-water` |
| `propyne-water` |
| `pyridine-water` |
| `pyrrolidine-water` |
| `quinoline-water` |
| `secButylbenzene-water` |
| `styrene-water` |
| `tertButanol-water` |
| `tertButylEthylEther-water` |
| `tertButylbenzene-water` |
| `tetrachloroethylene-water` |
| `tetrahydrofuran-water` |
| `tetrahydropyran-water` |
| `tetralin-water` |
| `thiophene-water` |
| `toluene-water` |
| `trans2Butene-1Pentanol` |
| `trans2Butene-1Propanol` |
| `trans2Butene-2Butanol` |
| `trans2Butene-2Methyl1Propanol` |
| `trans2Butene-2Methyl2Propanol` |
| `trans2Butene-2Pentanol` |
| `trans2Butene-allylAlcohol` |
| `trans2Butene-benzene` |
| `trans2Butene-isopropanol` |
| `trans2Butene-mCresol` |
| `trans2Butene-mXylene` |
| `trans2Butene-nButanol` |
| `trans2Butene-oCresol` |
| `trans2Butene-oXylene` |
| `trans2Butene-pCresol` |
| `trans2Butene-pXylene` |
| `trans2Butene-styrene` |
| `trans2Butene-tetrahydropyran` |
| `trans2Butene-toluene` |
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
| `carbon` | `graphite` |
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
| `solidCarbon` | `graphite` |

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
## Modules and stacks (the HARDWARE a membrane is deployed in)

A `spiralWoundModule` names one with `module <name>;` and an `electrodialysisStack` with `stack <name>;`, instead of typing the geometry inline -- and typing it beside the name REFUSES.  The record carries the active area, the channel and spacer, the manufacturer's limits (checked and announced, never refused) and, for a module, the sheet's rated test; a value the source does not state is marked `origin estimated; reviewStatus unverified;` and announced on every run that reads it.  The `Generic-*` modules are the four standard 40-inch sizes (every value an estimate, the membrane the case's).

| Name |
|---|
| `EUR2C-7P18` |
| `EurodiaED-100P-50` |
| `Generic-16040` |
| `Generic-2540` |
| `Generic-4040` |
| `Generic-8040` |
| `NF270-4040` |
| `SEPA_CF` |
| `SW30HR-380` |
## Functional membrane classes (a membrane chosen by what it does)

ILLUSTRATIVE teaching profiles, not products (`reviewStatus illustrative;`, announced on every run; no manufacturer).  Named where an element is: `module <class>;`, with `transport constantRejection;` and `rejection { <salt> fromRatedTest; }` -- each class states one OBSERVED rejection per salt at its own reference test (the middle of a stated band), an A_w and its generic element by reference; the intrinsic rejection is derived, never typed.  Any other transport law refuses.

| Name |
|---|
| `BWRO_HIGH_FLUX` |
| `BWRO_HIGH_REJECTION` |
| `NF_DIVALENT_SELECTIVE` |
| `NF_OPEN` |
| `NF_TIGHT` |
| `SWRO` |
## Feed spacers (the channel a spiral element is wound with)

Named by an element record (`feedSpacer <name>;`) or, with the explicit `area` + `length` form, by the case.  Thickness = channel height; porosity weighed or derived from the mesh; the hydraulic diameter is Schock & Miquel's Eq. 17 (derived from the filament); the record carries its Sherwood and friction correlations with their Reynolds window, announced when a run leaves it.

| Name |
|---|
| `SchockMiquel-DesalRO` |
| `SchockMiquel-DesalUF` |
| `SchockMiquel-FilmTecFT30` |
| `SchockMiquel-Naltex1228` |
| `SchockMiquel-TorayPEC1000` |
| `Spacer-28mil` |
## Adsorbents and resins

Isotherm and bed properties for the fixed-bed, TSA and softener units.

| Name |
|---|
| `SAC_Na` |
| `activatedCarbon` |
| `zeolite13X` |
| `zeolite5A` |
## Construction materials

Each carries ρ, F_M (Turton), σ_y, max T, max P.

| Name |
|---|
| `SS304` |
| `SS316` |
| `aluminium` |
| `carbonSteel` |

## Field glossary (what each block on a component means)

- `MW`, `Tc`, `Pc`, `omega`, `Tb`, `Hvap_Tb` — universal pure-compound (axiom 1).
- `Vliq` — liquid molar volume (apparent for solutes).
- `Antoine { ... }` — `log10(Psat [bar]) = A − B/(T + C)` for VLE (a
  coefficient checked or fitted on ln is off by ln 10; the engine is
  log10, src/thermo/vaporPressure/Antoine.cpp).
- `vaporPressure { model Wagner; reducing { T <K>; P <pressure>; }
  exponents ( ... ); coefficients ( ... ); Trange ( ... ); }` —
  `ln(Psat/Pr) = (Tr/T) Σ a_i τ^e_i`, τ = 1 − T/Tr.  The reducing constants
  are REQUIRED and are never taken from the component's Tc/Pc: a Wagner fit
  means something only with the constants it was fitted with.  Water's IAPWS
  saturation equation (SR1-86(1992), Eq. 1) is one instance; a case opts in
  with a `constant/components/water.dat` overlay (`overlayOf water;`) —
  see docs/design/what-water-dat-does-not-say.md §3.2.
- `idealGasHeatCapacity { coefficients (a1 a2 ... ); }` — for H_ig, S_ig.
- `liquidHeatCapacity { coefficients ( ... ); }` — for sensible H_liq.
- `standardThermochemistry { dHf_298; s_298; }` — for K_eq + adiabatic flames.
- `diffusionVolume <Sigma_v>;` — for Fuller diffusivity.
- `liquidViscosity { andrade { ... } vogel { ... } }` — model-specific.
- `liquidThermalConductivity { chemsepEq16 { A; B; C; D; E; Tmin; Tmax; } }`
  — `k = A + exp(B/T + C + D T + E T²)` W/(m K), read when the case selects
  `transport { liquid { thermalConductivity { model chemsepEq16; } } }`.
- `associationFactor <phi>;` — for Wilke-Chang liquid diffusivity.
- `solubility { coefficients ( a b c ); dHcryst; }` — c_sat(T), for crystalliser.
- `solid { rho_p; k_v; }` — for solids (cyclone / crystalliser / sprayDryer).
- `sorption { Xm; C; K; }` — GAB isotherm  **(typically case-local, axiom 4)**.
- `role <volatile|solute|nonvolatile|radical>;` — drives K-value choice.
- `dissociation <nu>;` — ions per formula (for osmotic pressure).

