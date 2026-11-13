# Aqueous species from the evaluated compilations in hand (C373)

Status: record of a curation campaign, begun 2026-11-12.  Branch `c373-species-campaign`.  Requested by Vítor
("tira de lá o máximo de iões que puderes ... quero mesmo todos").  It continues
[`organic-acids-in-the-catalogue.md`](organic-acids-in-the-catalogue.md) (C372), whose inventory, source table and
consistency tables it does not repeat.

**What this note settles.**  (1) How the formation data of an ion are DERIVED from an evaluated compilation and put on
one scale per family (section 1); (2) what each phase built, per family: what the catalogue held, what was built,
the table and page, what is still missing (sections 2 to 5); (3) every number read from a page image, and every
refusal.

**Rule that bounds it.**  A value enters a record only from a table that was READ, cited with table and page;
nothing from memory, the web, a third-party databank or a NonCommercial compilation; the CRC Handbook is a second
reading that enters no value.  Where a table is a scan, the number was read from the page image and the evidence table
says so (`image yes`), for a later human check.

**How the records are made.**  `data/curation/batches/species_c373/*.tsv` holds every reading (`sources`, `families`,
`species`, `steps`, `formation`); `bin/curate/species_c373.py write` renders from them the species records, the
chemistry records of the families it owns and the generated block of `metadata/aqueous-navigation.dat`;
`bin/curate/check_species_c373.py` (a gate in every `runTests` mode) re-renders in memory and fails on any byte of
difference, holds the hand-written C372 chemistry to the same pK and dH, and checks each family's one-scale tolerance.
Regeneration is byte-identical: `write` after `write` writes nothing, and `check` passes.  The components and
solution pairs of phase 1 are hand-written (four records of the citric-acid pattern).

## 1. Phase 1: the wine and food acids, on one scale per family

### 1.1 How each ion's value is derived (Miller & Smith-Magowan 1990)

Convention: H+(aq) = 0, zero ionic strength, aqueous species at 1 mol/dm3 (Table 1 caption, p. 1052), the
catalogue's.  The aqueous acid's enthalpy is the crystal's plus the heat of solution; the ion is the acid plus the
printed step enthalpies (Table 6) -- `eq:ladder-formation` of the Theory Guide.

| family | acid, aqueous (kJ/mol) | where | ions (kJ/mol) | entropy |
|---|---|---|---|---|
| succinate | -940.81 (cr, Table 2) + 28.70 (dsol, Table 2) = **-912.11** | Table 2, p. 1059 | HSucc -912.11 + 3.18 = **-908.93**; Succ **-909.37** (printed; = -912.11 + 3.18 - 0.45 to the rounding) | S(aq acid) 260.62; HSucc 260.62 - 69.9 = **190.72**; Succ **81.5** (printed; 81.52 by the steps) |
| fumarate | -810.98 + 35.8 = **-775.18** | Table 2, p. 1059 | HFumar -775.18 + 0.46 = **-774.72**; Fumar **-777.57** (printed) | HFumar 260.45 - 57.7 = **202.75**; Fumar **105.25** (see 1.2) |
| malate (d,l) | -1105.66 (cr) + 21.85 = **-1083.81** | Table 5, p. 1056 | HMalic -1083.81 + 2.95 = **-1080.86**; Malic -1080.86 - 1.18 = **-1082.04** | none printed |
| lactate (L) | -694.0 (cr) + 7.82 = **-686.2** | Table 5, p. 1056 | Lac -686.2 - 0.43 = **-686.63** | none printed |
| citrate | not printed | -- | unchanged: Kochergina Table 4 (-1529.7, -1526.2, -1528.5) | none |
| glycolate | -664.0 + 15.94 = -648.06 **but printed -651.0** | Table 5, p. 1056 | **not entered** (see 1.3) | none |

The Table 6 step enthalpies and entropies are read from the page image (p. 1057) and agree with the OCR text layer.
Table 2 and Table 5 values are read from page images (`image yes` in `formation.tsv`).

**Table 10 (p. 1067) is at I = 0.1 mol/dm3, not I = 0.**  The C372 note says Table 10's Gibbs energies of the ions are
on the I = 0 convention; they are not: succinate -690.08 there is Table 2's `Delta_f G (ion2-, I = 0.1)` row (-690.03
+/- 0.44), against -687.77 at I = 0.  No Gibbs energy is entered anywhere in this campaign (the records take hfAq
and sAq; Gf follows), so nothing changes; the correction is recorded so that nobody enters a Table 10 value as I = 0.
Check on the entered ion data, succinate: Delta_f G = -909.37 + 298.15 (0.7438) = -687.6 kJ/mol against the printed
-687.77 (I = 0), using the CODATA element entropies.

### 1.2 The fumarate entropy: Table 2 against Table 6

Table 2 prints `Delta_ion S = -152.2` and `S(aq ion 2-) = 108.3` for fumaric acid; Table 6 prints the two step
entropies -57.7 and -97.5, which sum to -155.2.  Table 2's own `Delta_ion G = +43.93` and `Delta_ion H = -2.39` give
(DeltaH - DeltaG)/T = -155.4 J/mol/K, which agrees with Table 6.  So Table 2's -152.2 (and the 108.3 built on it) does
not close with the rows beside it, and the Table 6 route (260.45 - 155.2 = **105.25**) is entered; 108.3 is recorded in
the evidence table.  For succinic acid all three agree (-179.1).

### 1.3 Glycolic acid: three readings that do not agree, so no formation data

Miller Table 5 prints, for glycolic acid, `Delta_f H` -664.0 +/- 4.0 (their ref. a, NBS 1968, error estimated),
`Delta H soln` +15.94 and `Delta_f H(aq acid)` -651.0 +/- 4.5.  -664.0 + 15.94 = -648.06, 2.9 kJ/mol from the printed
aqueous value; the NBS 1982 tables print glycolate -652.3 (dHf only; read in C372); Domalski 1972 (Section 6.11,
p. 235, read from the page image) prints glycolic acid (c) -158.6 kcal/mol = -663.6 kJ/mol, supporting the crystal.
Starting from the acid, the Table 6 dH_ion (+0.46) puts glycolate at -650.5 (Miller route), -652.3 (NBS) or -647.6
(crystal route): a spread of 4.7 kJ/mol that no work in hand resolves.  The family is therefore built for its
SPECIATION (pK 3.831, dH +0.46 kJ/mol, Table 6 p. 1057; not in Goldberg) and carries no formation data, and no
component: the energy route through `Glyc` refuses by name.

*Resolved in C376 (section 6.3): Shock (1995, Tables 8 and 10) corrects Miller's aqueous value to -648.06, the crystal route, and the family now carries formation data.*

### 1.4 One-scale consistency, per family

Difference of the neighbouring species' formation enthalpies (the neutral one being the component's dHf plus the pair's
dHsoln) against the dH of the step the chemistry record carries.  `species_c373.py scale` prints this table.

| family | step | hf difference | record's dH (source) | difference | tolerance |
|---|---|---|---|---|---|
| succinate | 1 | +3.18 | +3.0 (Goldberg 7.57) | +0.18 | 0.5 |
| succinate | 2 | -0.44 | -0.5 (Goldberg 7.57) | +0.06 | 0.5 |
| fumarate | 1 | +0.46 | +0.46 (Miller Table 6) | 0.00 | 0.3 |
| fumarate | 2 | -2.85 | -2.85 (Miller Table 6) | 0.00 | 0.3 |
| malate | 1 | +2.95 | +2.955 (Eden & Bates Table 6) | -0.005 | 0.3 |
| malate | 2 | -1.18 | -1.181 (Eden & Bates Table 6) | +0.001 | 0.3 |
| lactate | 1 | -0.45 | -0.251 (Nims & Smith Table II) | -0.20 | 0.5 |
| citrate | 1 | +4.6 | +4.07 (Goldberg 7.22) | +0.53 | 1.6 |
| citrate | 2 | +3.5 | +2.23 | +1.27 | 1.6 |
| citrate | 3 | -2.3 | -3.38 | +1.08 | 1.6 |

**Scale chosen.**  Succinate, fumarate, malate and lactate: the ions are Miller's (acid enthalpy and step enthalpies from
one work); the records keep their pK and dH from the sources C372 chose (Goldberg for succinate, Eden & Bates for
malate, Nims & Smith for lactate), which agree inside 0.2 kJ/mol.  Citrate: the WHOLE family stays on Kochergina
(hypothetical non-dissociated acid -1534.3 = -1551.7 + 17.4, the pair's value; ions -1529.7 / -1526.2 / -1528.5),
because Miller prints no formation enthalpy for citrate and Goldberg none at all; Goldberg's step enthalpies differ
from Kochergina's differences by 0.5 to 1.3 kJ/mol, inside Kochergina's stated +/-1.1 to 1.6.  Miller's own dH_ion for
citric acid (+4.17, +2.44, -3.36) is within 0.2 of Goldberg's.  No mixing of Kochergina and Miller occurs in any family.

### 1.5 Crystal components

`succinicAcid`, `fumaricAcid`, `malicAcid` (d,l) and `lacticAcid` (crystal), each a nonvolatile solid on the
`citricAcid` pattern, with `parameters/solution/<acid>-water.dat`.  dHf from Miller (Table 2 or 5), with Domalski 1972
(Sections 6.13, 6.15, 6.14, 6.11; kcal x 4.184, Section 5.5 p. 225) as the second reading, read from the page images:

| acid | Miller (kJ/mol) | Domalski (kcal/mol; kJ/mol) | difference |
|---|---|---|---|
| succinic (cr) | -940.81 | -224.79; -940.53 | 0.28 |
| fumaric (cr) | -810.98 | -193.84; -811.02 | 0.04 |
| malic, d,l (cr) | -1105.66 | -264.27; -1105.72 | 0.06 |
| lactic, D (cr) | -694.0 | -165.88; -694.04 | 0.04 |

Density and melting point only where Perry's 9th ed. Table 2-2 prints them for the same phase: succinic 1.572 g/cm3 at
25/4 C (p. 2-43), fumaric 1.635 (temperature not printed, p. 2-36), d,l-malic 1.601 at 20/4 C (p. 2-38).  Lactic acid:
the only row is the liquid d,l acid (1.249 at 15/4 C, mp 16.8 C), a different phase from the crystal the heat of formation
belongs to, so `lacticAcid` carries no density.  No component carries an entropy or a Cp: Miller prints the crystal
entropy of succinic (167.3) and fumaric (166.1) acids, but as an intermediate of the third-law route to the ions, and
no heat capacity is in hand.  Domalski's row for DL-lactic acid (liquid) is too blurred in the scan to read a digit and
is not used.

## 2. Phase 2: the inorganic and process-relevant ionisations (Goldberg, Kishore & Lennen 2002)

Source: Section 8 (summary table, pp. 359-360, text layer checked against the page images) and the Section 7 tables named
below.  Standard state: hypothetical ideal solution of unit molality, 298.15 K, 0.1 MPa.  Evaluation grades are in the Section
7 tables and were not read for this phase; they are not carried.

### 2.1 What the catalogue held, what was built

| family | held before | built (phase 2) | source | still missing |
|---|---|---|---|---|
| carbonate | species `CO2aq`, `HCO3`, `CO3`; records `CO2aq-formation`, `CO3-formation` (PHREEQC) | nothing: compared (2.2) | 7.20, p. 264 | -- |
| phosphate | neutral `H3PO4aq` (inline identity), species `H2PO4`, `HPO4`, `PO4`; three records (PHREEQC) | nothing: compared | 7.51, p. 321 | -- |
| sulfate | `HSO4`, `SO4`; `HSO4-formation` (PHREEQC, with an `analytic`) | nothing: compared | 7.58, p. 344 | -- |
| ammonia | `NH4`, `NH3aq`; `NH3aq-formation` (PHREEQC) | nothing: compared | 7.7, p. 245 | -- |
| borate | `H3BO3`, `BOH4`; `BOH4-formation` (PHREEQC) | nothing: compared | 7.15, p. 259 | -- |
| **arsenate** | species `H2AsO4`, `HAsO4` (NBS, C320), **no record** | `H3AsO4`, `AsO4` and four records: `H2AsO4-formation`, `HAsO4-formation`, `AsO4-formation`, `H3AsO4-formation` | 7.9, p. 248: pK 2.31 / 7.05 / 11.9, dH -7.8 / 1.7 / 15.9; no dCp printed | formation data of `H3AsO4`, `AsO4` (the NBS tables in hand were not searched in this pass) |
| **pyrophosphate** | nothing | five species `H4P2O7` ... `P2O7` and five records; navigation family `phosphate` | 7.56, p. 333: pK 0.83 / 2.26 / 6.72 / 9.46, dH -9.2 / -5.0 / 0.5 / 1.4, dCp ~-90 / ~-130 / -136 / -141 | formation data (none in Goldberg) |
| **sulfite** | species `Bisulfite`, `Sulfite` (NBS, C320), **no record** | `H2SO3` and three records | 7.59, p. 344: pK 1.857 / 7.172, dH -17.80 / -3.65, dCp -272 / -262 | `H2SO3` formation data; the sulfurous acid is formally aqueous SO2 and no gas-liquid record links `H2SO3` to the component `SO2` |
| **hydrazine** | component `N2H4` only | `N2H6`, `N2H5`, `Hydrazine` (not `N2H4aq`: the identity gate pins the `aq` class as closed, so the neutral base takes a word key; the master is `Hydrazine`, as weighed) and three records | 7.40, p. 300: pK -0.99 / 8.02, dH 38.1 / 41.7; no dCp | formation data; the gas-liquid link of `Hydrazine` to the component |

Not in Goldberg and so not touched: nitrite, nitrate, hydrofluoric, hydrogen sulfide, silicic, hypochlorous (several exist in the catalogue from
other works); cacodylate (arsenic, an organoarsenic acid) and the other organic buffers are phase 4.
(The `H3PO4aq` row of the phosphate line: the species is the neutral phosphoric acid of the catalogue, not a file in
`species/` -- its identity lives inline in `H3PO4aq-formation`, as it did before.)

### 2.2 The records already in the catalogue against Goldberg (nothing changed)

`bin/curate/species_c373.py compare` renders this.  Each record is read as the pK and the ionisation enthalpy it implies:
a formation record (acid formed from the base) gives pK = +logK25, dH_ion = -dH; an ionisation record the opposite.  Where
the record carries an `analytic` block the enthalpy the engine USES is the analytic derivative at 298.15 K (the
priority is analytic > dH > flat), which is printed in the second dH column.

| record | steps | pK record | pK Goldberg | diff | dH_ion record `dH` | dH_ion analytic | dH_ion Goldberg | diff (analytic, else `dH`) |
|---|---|---|---|---|---|---|---|---|
| `CO2aq-formation` | carbonate 1 | 6.352 | 6.351 | +0.001 | 9.109 | 9.109 | 9.150 | -0.04 |
| `CO3-formation` | carbonate 2 | 10.329 | 10.329 | 0.000 | 14.899 | 14.901 | 14.700 | +0.20 |
| `H3PO4aq-formation` | phosphate 1+2+3 | 21.721 | 21.696 | +0.025 | 10.100 | -- | 11.600 | -1.50 |
| `H2PO4-formation` | phosphate 2+3 | 19.553 | 19.548 | +0.005 | 18.912 | -- | 19.600 | -0.69 |
| `HPO4-formation` | phosphate 3 | 12.346 | 12.350 | -0.004 | 14.770 | -- | 16.000 | -1.23 |
| `HSO4-formation` | sulfate 1 | 1.988 | 1.987 | +0.001 | -16.108 | -16.128 | -22.400 | **+6.27** |
| `NH3aq-formation` | ammonia 1 | 9.252 | 9.245 | +0.007 | 52.090 | -- | 51.950 | +0.14 |
| `BOH4-formation` | borate 1 | 9.240 | 9.237 | +0.003 | 13.489 | -- | 13.800 | -0.31 |

The pK's agree to 0.007 except the first two phosphoric steps (0.025 in the sum: the records carry 2.168 / 7.207, Goldberg
2.148 / 7.198).  The enthalpies agree to 0.3 kJ/mol except phosphate (up to 1.5) and **hydrogensulfate: the catalogue's
ionisation enthalpy is -16.1 kJ/mol, Goldberg's evaluated -22.4, a difference of 6.3 kJ/mol** (at 50 C this moves
log K by about 0.09).  Every existing record cites a source (USGS PHREEQC), so none is changed here.  What a correction of
`HSO4-formation` would reach, WITHOUT doing it: 14 sealed cases carry a copy of it
(`pitzer_vs_davies_ro_concentrate`, `precipitation_ro_brackish`, `ksp_temperature`, `pitzer_calcite_brine`,
`tartaricAcid_acidulation`, `softener_brackish`, `scaling_ro_brackish`, `model4_speciation_scaling`,
`optim04_membrane_recovery_scaling`, `membrane24_fit_then_simulate`, `membrane07_scaling_si`,
`flash15_refused_salt_basis_rank`, `membrane09_index_vs_rigorous`, `membrane08_softened_scaling`); only a change to the
`analytic` block moves a number at a temperature other than 25 C (the `dH` field is not read while `analytic` exists), and
the goldens of the cases that run off 25 C would move.  The three phosphate records have no sealed copy, `BOH4-formation` one,
`NH3aq-formation` 40, `CO2aq-formation` and `CO3-formation` 73 each.  The decision is the architect's.

### 2.3 Case

`tutorials/props/electrolyte/inorganicLadders01_goldberg`: seven `speciate` beakers at half-neutralisation points
(phosphate, pyrophosphate x3, arsenate, sulfite, hydrazine with HCl), Davies, `pH solve`.  A structural illustration; no
`anchor` rows (no pH printed in a work in hand).  For two neighbouring species at equal molality the Davies pH equals
pK + log(gamma_B/gamma_A) to the printed digits (arsenate 6.728 = 7.05 - 0.322), which the header shows; sealed and
recorded the way C372's cases were.

## 3. Phase 3: amines and amino acids

Sources: Goldberg, Kishore & Lennen 2002, Section 8 (pp. 359-360) and Sections 7.4, 7.5, 7.23, 7.24, 7.28, 7.29, 7.31 to
7.34, 7.39, 7.41, 7.45, 7.46, 7.53, 7.66 to 7.68; Miller & Smith-Magowan 1990, Tables 3 and 6 for alanine, aspartic and
glutamic acids and for the formation data of glycine.  Read as in phases 1 and 2; Miller's tables from page images.

### 3.1 What was built

**Master of a family = the compound AS WEIGHED** (the form a case declares as the analytical total): the zwitterion of an
amino acid or Good buffer, the neutral base of an amine, the neutral acid of a carboxylic or inorganic acid.  The other
species are derived from it, one record each (the carbonate pattern, where `HCO3` is the master); a ladder whose master is
the most protonated form also carries the inverse record from its fully dissociated form (the C372 pattern).  This
REVISES the first build of phase 3 (cation master, a case had to feed the hydrochloride): the `master` column of
`families.tsv`, the tool's interior-master record and a stale-file sweep were added, the 30 affected families regenerated and
the two cases re-sealed and re-recorded.  `Piz` = piperazine, `Imz` = imidazole.

| family | species (master first) | source | what is entered |
|---|---|---|---|
| Tris | `HTris`, `Tris` | 7.68 p. 357 | pK 8.072, dH 47.45 |
| triethanolamine | `HTEOA`, `TEOA` | 7.66 p. 353 | 7.762, 33.6 |
| triethylamine | `HTEA`, `TEA` | 7.67 p. 355 | 10.72, 43.13 |
| 2-amino-2-methyl-1-propanol | `HAMP`, `AMP` | 7.5 p. 244 | 9.694, 54.05 |
| 2-amino-2-methyl-1,3-propanediol | `HAMPD`, `AMPD` | 7.4 p. 243 | 8.801, 49.85 |
| diethanolamine | `HDEA`, `DEA` | 7.24 p. 270 | 8.883, 42.08 |
| ethanolamine | `HMEA`, `MEA` | 7.28 p. 277 | 9.498, 50.52 |
| methylamine | `HMeNH2`, `MeNH2` | 7.45 p. 310 | 10.645, 55.34 |
| piperazine | `H2Piz`, `HPiz`, `Piz` | 7.53 p. 329 | 5.333 / 9.731, 31.11 / 42.89 |
| imidazole, 2-methylimidazole | `HImz`/`Imz`, `HMImz`/`MImz` | 7.41 p. 302, 7.46 p. 312 | 6.993, 36.64; 8.01, 36.8 |
| N-ethylmorpholine | `HNEM`, `NEM` | 7.29 p. 279 | 7.77, 27.4 |
| glycine amide | `HGlyAmd`, `GlyAmd` | 7.32 p. 286 | 8.04, 42.9 |
| glycylglycine, glycylglycylglycine | `H2GlyGly`/`HGlyGly`/`GlyGly`, `H2Gly3`/`HGly3`/`Gly3` | 7.33 p. 287, 7.34 p. 289 | two steps each |
| L-histidine | `H3His`, `H2His`, `HHis`, `His` | 7.39 p. 296 | 1.54 / 6.07 / 9.34, dH 3.6 / 29.5 / 43.8 (pK1 1.54 is printed 1.5 with a subscript 4) |
| L-cysteine | `H3Cys`, `H2Cys`, `HCys`, `Cys` | 7.23 p. 268 | 1.71 / 8.36 / 10.75, dH ~-0.6 / 36.1 / 34.1 (the first approximate) |
| glycine | `H2Gly`, `HGly`, `Gly` | 7.31 p. 281 + Miller Table 3 | pK 2.351 / 9.780, dH 4.00 / 44.2 (Goldberg); hfAq, sAq (Miller) |
| L-alanine | `H2Ala`, `HAla`, `Ala` | Miller Table 6 p. 1057 + Table 3 | pK 2.340 / 9.870, dH 3.01 / 45.23; hfAq, sAq |
| L-aspartic acid | `H3Aspt`, `H2Aspt`, `HAspt`, `Aspt` | Miller Tables 6, 3 | pK 1.990 / 3.900 / 10.002; hfAq, sAq |
| L-glutamic acid | `H3Glu`, `H2Glu`, `HGlu`, `Glu` | Miller Tables 6, 3 | pK 2.162 / 4.272 / 9.93; hfAq, sAq |

Crystal components `glycine`, `alanine` (L), `asparticAcid`, `glutamicAcid` with heat-of-solution pairs, from Miller
Table 3 (dHf(cr) -528.52, -561.24, -973.32, -1005.25 kJ/mol; dH(soln) +14.16, +7.49, +25.82, +24.53); the zwitterion
`hfAq` is the printed dHf(aq) (-514.36, -553.75, -947.50, -980.72), i.e. crystal plus heat of solution.  No density is in a
work read, and no component carries an entropy or a Cp.

### 3.2 Naming and the links to components

The identity gate pins a key ending in a lowercase `p` or `m` (or `aq`) as an opaque class that may not grow, so the
natural keys `Pip`, `Im`, `Asp`, `GlyAm` were refused and replaced (`Piz`, `Imz`, `Aspt`, `GlyAmd`); `N2H4aq` was
refused in phase 2 for the same reason.  The conjugate-acid keys are `H<base>` (`HTris`); the bases are the
acronyms `TEOA`, `TEA`, `DEA`, `MEA`, `AMP`, `AMPD`.  Components of the same substances exist for monoethanolamine,
diethanolamine, triethanolamine, triethylamine, methylamine and piperazine, with no species and no aqueous chemistry in
the catalogue before this pass (searched: `data/standards/chemistry` and `species` hold no amine other than NH3).  A
derived species named like a component must carry `aq`, which the identity gate forbids to grow, so the species keys
are distinct words and the substance has two identities -- the volatile component (gas phase, liquid mixtures) and the
dissolved species of the speciation network -- until a gas-liquid record (`dissolvedSpecies`) links them, as
`aceticAcid-dissolution` does for acetic acid.  That record needs a Henry constant from a source and was not written.
The amine acid-gas chemistry the catalogue does not hold (carbamate formation) is not touched.  "Pyridine-type entries"
of the brief: pyridine is not in Goldberg; imidazole, 2-methylimidazole and N-ethylmorpholine are.

### 3.3 The formation data of the four amino acids (Miller Tables 3 and 6)

Same rule as phase 1: the aqueous zwitterion's enthalpy and entropy are printed (Table 3); the cation and anion follow by
the Table 6 step enthalpies and entropies (`eq:ladder-formation`).  Ladder-step check, `species_c373.py scale`:

| family | step | hf difference | record dH | difference | tolerance |
|---|---|---|---|---|---|
| glycine | 1 | +4.01 | +4.00 (Goldberg) | +0.01 | 0.2 |
| glycine | 2 | +44.10 | +44.2 (Goldberg) | -0.10 | 0.2 |
| alanine | 1, 2 | +3.01, +45.23 | same (Miller) | 0 | 0.05 |
| aspartic | 1, 2, 3 | +7.46, +4.64, +37.76 | +7.46, +4.60, +37.76 (Miller Table 6) | 0, +0.04, 0 | 0.1 |
| glutamic | 1, 2, 3 | -0.27, +1.56, +40.07 | same | 0 | 0.05 |

**Two findings in Miller's tables.**  (1) Table 3 prints the second ionisation enthalpy of aspartic acid as +4.64 and
builds the monoanion's formation enthalpy (-942.86) on it, Table 6 prints +4.60; the printed formation enthalpy is
entered (a 0.04 kJ/mol difference).  (2) **Glutamic acid, third step.**  Table 6 prints pK3 = 9.93 and dS_ion = -44.8
J/mol/K with dH_ion = +40.07 kJ/mol.  These three do not close: the Gibbs identity gives pK3 = 9.36 from the
enthalpy and entropy, and 9.93 from the pK (footnote h: Miller replaced the literature 9.37 by 9.93, calculated at I = 0
from 9.67 at 0.1 mol/dm3 KCl, and kept the entropy of the old constant).  `check_logk_crosscheck` found the
disagreement (0.567 log units, a factor 3.7 in K) on the first build, which is what that gate is for.  The record keeps
pK3 = 9.93 (the one Miller uses) and the entropy of the glutamate ion is DERIVED from the pK and dH so the identity
closes (114.59 J/mol/K; the printed route would give 125.50); both are in the evidence table.  The other steps of
the four amino acids close inside the gate's tolerance (it compares each ladder from its master to its last species; step 2 of
aspartic acid, by hand: 22.31 kJ/mol from dH and dS against 22.26 from the pK).

### 3.4 What the catalogue held and what is still missing

Held before: nothing of these families (ammonia, borate and carbonate are in phase 2).  Missing: gas-liquid links to the
components (above); formation data of every amine, imidazole and peptide (Goldberg prints none; NBS has no C3+ rows);
the heat capacity of ionisation (the printed dCp is not carried: see section 5.1); the amino acids other than the four of
Miller (serine, proline, threonine, ...), which no evaluated ionisation work in hand covers; acid-gas chemistry of the
alkanolamines.

### 3.5 Case

`tutorials/props/electrolyte/aminoBuffers01_tris_glycine`: Tris and triethanolamine half-neutralised with HCl, and
glycine alone and with HCl and NaOH (six beakers, Davies, `pH solve`; the masters are Tris, TEOA and the zwitterion
`HGly`).  A structural illustration; no `anchor` rows.  The Davies pH of the half-neutralised bases is pK + log(1/gamma+)
(Tris 8.138 = 8.072 + 0.066); the isoelectric glycine solution is at pH 6.075 against (pK1 + pK2)/2 = 6.066.

## 4. Phase 4: the laboratory buffers (Goldberg, Kishore & Lennen 2002)

Every remaining section of Goldberg that phases 1 to 3 did not take.  Species: the acid form and the conjugate base(s),
charges as the section states them, the formula and molar mass from the section's own header (`Empirical formula`,
`Molecular weight`).  **No formation data**: Goldberg prints none, so the species carry no `aqueousThermo` and the header
says so.  Master = the zwitterion or neutral acid as weighed.  Keys: `H<acronym>` for the acid or zwitterion, `<acronym>` for
the anion (`HMES`/`MES`), `H2<acronym>` for a cationic acid (`H2HEPES`); the acronym is the natural key and none collides with
an existing key or an element symbol.  Evaluation grades are those of the Section 7 tables (carried in the records' headers
for every Goldberg step of the campaign since this phase).

| family (keys) | section, p. | pK | dH (kJ/mol) | grade |
|---|---|---|---|---|
| ACES (`HACES`, `ACES`) | 7.1, 237 | 6.847 | 30.43 | AAA |
| ADA (`H3ADA`, `H2ADA`, `HADA`, `ADA`; master `H2ADA`) | 7.3, 241 | 1.59 / 2.48 / 6.844 | -- / 16.7 / 12.23 | C / CC / ABB |
| AMPSO | 7.8, 247 | 9.138 | 43.19 | AAB |
| 3-amino-1-propanesulfonic acid (`HAPSA`, `APSA`) | 7.6, 245 | 10.2 | -- | D |
| barbital (`H2Barb`, `HBarb`, `Barb`) | 7.10, 251 | 7.980 / 12.8 | 24.27 / -- | AAA / C |
| BES | 7.11, 253 | 7.187 | 24.25 | AAA |
| Bicine (`H2Bicine`, `HBicine`, `Bicine`) | 7.12, 255 | 2.0 / 8.334 | -- / 26.34 | DD / AAA |
| Bis-tris (`HBisTris`, `BisTris`) | 7.13, 257 | 6.484 | 28.4 | AAA |
| Bis-tris propane (`H2BTP`, `HBTP`, `BTP`) | 7.14, 258 | 6.65 / 9.10 | -- | D / D |
| cacodylate (`H2Cac`, `HCac`, `Cac`) | 7.17, 261 | 1.78 / 6.28 | -3.5 / -3.0 | CBB / BBB |
| CAPS, CAPSO, CHES | 7.18, 7.19, 7.21 | 10.499, 9.825, 9.394 | 48.1, 46.67, 39.55 | AAC, AAB, AAB |
| diglycolate (`H2Dglyc`, `HDglyc`, `Dglyc`) | 7.25, 272 | 3.05 / 4.37 | -0.1 / -7.2 | BCD |
| 3,3-dimethylglutarate (`H2DMG`, ...) | 7.26, 275 | 3.70 / 6.34 | -- | B / B |
| DIPSO | 7.27, 276 | 7.576 | 30.18 | AAB |
| glycerol 2-phosphate (`H2G2P`, `HG2P`, `G2P`) | 7.30, 280 | 1.329 / 6.650 | -12.2 / -1.85 | ABB / AAA |
| HEPES (`H2HEPES`, `HHEPES`, `HEPES`) | 7.36, 292 | ~3.0 / 7.564 | -- / 20.4 | U / ABB |
| HEPPS, HEPPSO | 7.37, 7.38 | 7.957, 8.042 | 21.3, 23.70 | AAA, AAB |
| 2-mercaptoethanol (`HMerEtOH`, `MerEtOH`) | 7.43, 308 | 9.75 | 26.2 | CB |
| MES, MOPS | 7.44, 7.48 | 6.270, 7.184 | 14.8, 21.1 | AAA, AAA |
| MOPSO (`H2MOPSO`, `HMOPSO`, `MOPSO`) | 7.49, 315 | 0.060 / 6.90 | -- / 25.0 | A / BCB |
| phthalate (`H2Phth`, `HPhth`, `Phth`) | 7.52, 326 | 2.950 / 5.408 | -2.70 / -2.17 | AAA |
| PIPES, POPSO | 7.54, 7.55 | 7.141, ~8.0 | 11.2, -- | ABA, U |
| TAPS, TAPSO, TES | 7.61, 7.62, 7.64 | 8.44, 7.635, 7.550 | 40.4, 39.09, 32.13 | BBB, AAB, AAB |
| Tricine (`H2Tricine`, `HTricine`, `Tricine`) | 7.65, 351 | 2.023 / 8.135 | 5.85 / 31.37 | AAB / AAA |

Not built: **CABS, HEPBS, MOBS and TABS**, whose sections state that no thermodynamic data for the ionisation exist in the
literature (the summary table prints a dash).  Entries printed as approximate (HEPES pK1 about 3.0, POPSO about 8.0, the
first dH of cysteine and several dCp values) are entered at the printed digit and flagged in the evidence table and in the
record header; a `U` grade is Goldberg's for an unevaluated value.  Where an ionisation step has no printed dH, the records
that sum it carry no dH and their K is flat in T, which the engine announces; the dH of a later step is used by the record
of that step alone when the master sits beside it (HEPES: `H2HEPES` has no dH, `HEPES` carries 20.4).

**Misprints in the source, found while taking the formulas from the section headers.**  The line `where HL = ...` of three
sections disagrees with the section's own empirical formula and molar mass: HEPPS prints `C6H20N2O4S` (the header and the
molar mass 252.33 give C9H20N2O4S), glycerol 2-phosphate `C3H9NO6P` (header C3H9O6P, 172.07), cacodylate `HL = C2H6AsO2` (the
anion; header C2H7AsO2, 138.00).  The header formulas are used; the records' MW is the sum of the engine's atomic weights.

**Case.**  `tutorials/props/electrolyte/goodsBuffers01_hepes_mes`: HEPES and MES, 0.05 mol/kg half-neutralised with NaOH, at 25
and 37 C (four beakers).  HEPES 7.498 -> 7.359 and MES 6.204 -> 6.103: the van't Hoff shift of the pK from the record's dH
(0.138 and 0.100) plus the Davies coefficient; the printed dCp would add 0.002 and 0.0002 and is not carried.  A structural
illustration, no `anchor` rows.

## 5. What the four phases left undone

Malonic acid (not in Goldberg, Miller or NBS), gluconic, ascorbic, gallic, propionic, butyric, benzoic: no evaluated
ionisation work in hand.  Entropies of malate, lactate and the crystals.  The aqueous heat capacities.  Formation data
of the new inorganic ions (the NBS tables in hand carry several of them and were not searched in phase 2).  The `dCp` of
every ionisation (see the proposal below).

### 5.1 Where a `dCp` would go

  The printed ionisation heat capacity change is not carried by any record: the grammar reads
`logK25`, `dH` and an `analytic` block.  A constant dCp is exactly the `A1`, `A3`, `A4` terms of the `analytic` form
(log K(T) = logK25 + [ana(T) - ana(298.15)]); a `dCp` key on the record, resolved to those terms at load time and
announced, would carry every printed value without a new model.  Proposed, not built.

## 6. Phase 5 (C376): formation data for the species entered for pH only

Phases 1 to 4 entered most of the new species as speciation ladders without `aqueousThermo`: a balance that needs the
enthalpy of such a species refuses by name.  C376 supplies the formation data (`hfAq`, `sAq`) route by route, on the same
machinery: the readings are rows of `data/curation/batches/species_c373/formation.tsv`, the records are written by
`bin/curate/species_c373.py` (a species hand-written in an earlier campaign that lacks the datum, such as `H2PO4` and
`HPO4`, gets the generated block INSIDE its `aqueousThermo` between two marker lines and every other byte is kept; a
value an existing record already carries is never overwritten, it is compared in `formation_compare.tsv`, printed by
`species_c373.py fcompare`).  Units are those of the sources (kJ/mol and J/mol/K), H+ = 0, 298.15 K.

### 6.1 Route 1: the NBS tables (Wagman et al. 1982, J. Phys. Chem. Ref. Data 11, Suppl. 2)

The file is a scan without a text layer (407 pages; the PDF page is the printed page plus 8): the rows were read from page
images (every row of `formation.tsv` carries `image yes`), the tables located by a first OCR pass and every number taken
from the image, not from the OCR.  The state `ao` is the hypothetical ideal solution of unit molality (the catalogue's
standard state); `ai` is the ionised form of an acid, `aq` an undefined state and is not used.

| species | NBS row | DfH (kJ/mol) | S (J/mol/K) | table, page (PDF page) |
|---|---|---|---|---|
| H3PO4 | H3PO4 ao | -1288.34 | 158.2 | 19:P, 2-74 (82) |
| H2PO4- | H2PO4- ao | -1296.29 | 90.4 | 19:P, 2-73 (81) |
| HPO4 2- | HPO4 2- ao | -1292.14 | -33.5 | 19:P, 2-73 (81) |
| PO4 3- | PO4 3- ao | -1277.4 | -222. | 19:P, 2-73 (81) |
| H4P2O7 | H4P2O7 ao | -2268.6 | 268. | 19:P, 2-75 (83) |
| H3P2O7- | H3P2O7- ao | -2276.5 | 213. | 19:P, 2-75 (83) |
| H2P2O7 2- | H2P2O7 2- ao | -2278.6 | 163. | 19:P, 2-75 (83) |
| HP2O7 3- | HP2O7 3- ao | -2274.8 | 46. | 19:P, 2-74 (82) |
| P2O7 4- | P2O7 4- ao | -2271.1 | -117. | 19:P, 2-73 (81) |
| H2SO3 (SO2(ao) + H2O) | H2SO3 ao | -608.81 | 232.2 | 14:S, 2-57 (65) |
| HSO3- | HSO3- ao | -626.22 | 139.7 | 14:S, 2-57 (65) |
| SO3 2- | SO3 2- ao | -635.5 | -29. | 14:S, 2-57 (65) |
| H3AsO4 | H3AsO4 ao | -902.5 | 184. | 20:As, 2-77 (85) |
| H2AsO4- | H2AsO4- ao | -909.56 | 117. | 20:As, 2-77 (85) |
| HAsO4 2- | HAsO4 2- ao | -906.34 | -1.7 | 20:As, 2-77 (85) |
| AsO4 3- | AsO4 3- ao | -888.14 | -162.8 | 20:As, 2-77 (85) |
| N2H4 | N2H4 ao | 34.31 | 138. | 18:N, 2-65 (73) |
| N2H5+ | N2H5+ ao | -7.5 | 151. | 18:N, 2-65 (73) |
| CH3NH2 | CH3NH2 methylamine ao | -70.17 | 123.4 | 23:C, 2-89 (97) |
| CH3NH3+ | CH3NH3+ ao | -124.93 | 142.7 | 23:C, 2-89 (97) |
| glycolate | CH2OHCO2- ao | -652.3 | (none) | 23:C, 2-93 (101) |
| glycine, glycinium, glycinate | NH2CH2COOH ao4, NH3CH2COOH+ ao, ai4 | -513.988, -517.912, -469.780 | 158.32, 190.20, 119.41 | 23:C, 2-104 and 2-105 (112, 113) |

Not in the tables: N2H6 2+ (hydrazinium(2+)), ethanolamine and its cation (the table prints ethanolammonium nitrate only),
and the entropy of glycolate.  Oxalate (`HOx`, `Ox`) was entered from this table in C320.

**Comparison with what the catalogue already carried** (`species_c373.py fcompare`).  PO4 (-1277.4, -222.), H2AsO4,
HAsO4, HSO3- and SO3 2- are the NBS values themselves (entered in C320): difference 0.000, nothing changed.  The glycine
species carry Miller & Smith-Magowan's values; NBS differs by +0.46, +0.37 and +0.48 kJ/mol (cation, zwitterion, anion)
and +0.25, -0.13, +0.16 J/mol/K, inside the sources' stated uncertainty; Miller's are kept because they carry the
steps of the same evaluation (one scale for the glycine family).  Phosphoric acid has no species file (the neutral acid is
the ion `H3PO4` of the PHREEQC-derived record `H3PO4aq-formation`), so its NBS row is held in `formation_compare.tsv`
for the one-scale check only.

**One scale per family** (the `scale` table; hf difference against the Goldberg step enthalpy, kJ/mol):

| family | steps (hf difference / printed dH) | tolerance |
|---|---|---|
| phosphate | -7.95/-8.0, +4.15/+3.6, +14.74/+16.0 | 1.5 |
| sulfite | -17.41/-17.80, -9.28/-3.65 | 6.0 |
| hydrazine | +41.81/+41.7 | 0.5 |
| methylamine | +54.76/+55.34 | 1.0 |
| arsenate (NBS printed; see below) | -7.06/-7.8, +3.22/+1.7, +18.20/+15.9 | n.a. |
| pyrophosphate (NBS printed; see below) | -7.9/-9.2, -2.1/-5.0, +3.8/+0.5, +3.7/+1.4 | n.a. |

**Where two sources disagree beyond tolerance: the choice.**  The gate `check_logk_crosscheck` holds every ladder to the
Gibbs identity, dG = sum(nu (hf - T S)), against the curated logK at 0.30 log units.  The NBS pyrophosphate and arsenic
acid rows violate it against Goldberg's evaluated pK and dH (pyrophosphate sums 0.40 to 0.70, arsenic acid 0.33 to 0.63
log units; the NBS pK1 of pyrophosphoric acid read from its own Gibbs energies is 1.54 against Goldberg's 0.83, and its
integer entropies are estimates), and the sulfite step 2 enthalpy of NBS (-9.28) is 5.6 kJ/mol from Goldberg's (-3.65) while
the pK agrees (7.22 against 7.17).  One family on one scale is the rule, so:

* **Pyrophosphate**: the fully dissociated anion as printed (-2271.1, -117.), and every protonated form from it by
  the evaluated steps (Eq. `ladder-formation` of the Theory Guide, grade CDD to DCC for the steps): HP2O7 -2272.5 / 59.4,
  H2P2O7 -2273.0 / 186.4, H3P2O7 -2268.0 / 246.4, H4P2O7 -2258.8 / 293.2.  The NBS printed values differ by 2.3 to 9.8 kJ/mol
  in the enthalpy and 13 to 33 J/mol/K in the entropy (both are `formation_compare.tsv` rows); neither work grades these steps
  better than C/D, and the one whose steps Choupo's speciation uses is the one that fixes the scale.
* **Arsenic acid**: the two ions the catalogue already carries (H2AsO4, HAsO4, NBS) are fixed, and H3AsO4 and AsO4 follow
  from the evaluated steps 1 and 3 (-901.76 / 187.4 and -890.44 / -176.2; NBS prints -902.5 / 184. and -888.14 / -162.8).
  Step 2 stays NBS minus NBS (pK 6.76 against 7.05: 0.29 log units, the largest remaining, inside the 0.30 tolerance).
* **Sulfite**: NBS printed throughout (the existing HSO3- and SO3 2- are NBS and fixed, and H2SO3 agrees with step 1 to
  0.39 kJ/mol); the family tolerance is 6.0 kJ/mol *for the step 2 enthalpy alone*, a disagreement of the two works that is
  recorded here and not hidden: a heat of the second ionisation computed from the formation enthalpies is -9.3 kJ/mol, while
  the speciation's van't Hoff law uses -3.65.  The Gibbs identity holds (the entropies absorb it).
* **Phosphate, hydrazine, methylamine**: NBS printed throughout; the steps agree to 1.3, 0.1 and 0.6 kJ/mol.

Species that gained formation data in this route: H2PO4, HPO4, H4P2O7, H3P2O7, H2P2O7, HP2O7, P2O7, H2SO3, H3AsO4, AsO4,
Hydrazine, N2H5, MeNH2, HMeNH2 (14 species, each with both DfH and S).  Glycolate: see the later sections of this note; ethanolamine has no value in any work of this route.

## 7. Route 3 (C376, NOT BUILT): an estimated aqueous enthalpy for the laboratory buffers, worked for Tris and HEPES

Decision of C376: the neutral form's aqueous DfH of a buffer with no measured formation datum may be ESTIMATED by group
additivity (Domalski & Hearing, condensed phase, plus a solution step), origin `estimated`, announced on every use; the ions
then follow from the measured ionisation enthalpies of Goldberg et al. (2002), so a balance in which the buffer's total amount
is conserved depends on measured quantities only and the estimate cancels.  This section writes the estimate in full for two
buffers BEFORE anything is built, so the decision is taken on numbers.  Source: Domalski & Hearing, J. Phys. Chem. Ref.
Data 22 (1993) 805-1159 (text layer; the OCR of the group table is noisy, so every group value below was read against the
table's own neighbouring rows and the worked examples of Tables 15 and 26; they are to be read once from the page images
before any record is written).  Values are DfH in kJ/mol, solid-phase columns, 298.15 K.

### 7.1 Tris (C4H11NO3, tris(hydroxymethyl)aminomethane)

Groups (Table 2, `Listing of groups and group values`): 3 x C-(H)2(O)(C) = 3 x (-33.00) [p. 819]; 3 x O-(H)(C) =
3 x (-199.66) [p. 818]; 1 x C-(C)3(N) = +1.00 [p. 820]; 1 x N-(H)2(C) = -6.30 [p. 820; the table prints only the two
rows labelled "amino acids" for this group, -6.30 solid and -46.00 for the second; the definition list says the first is
the only NH2 on a carbon of an amino acid, so its use for a plain primary amine is an extension the paper does not
make: no solid-phase amine of the fitting set carries it].  Sum, crystal: -99.00 - 598.98 + 1.00 - 6.30 = **-703.28
kJ/mol**.  Entropy of the crystal from the same groups (3 x 24.73 + 3 x 28.62 - 84.14 + 39.00) = 114.9 J/mol/K (the same caveat
for the amine group).  Tris is not among the 1512 compounds of the paper, so there is no measured value to hold the estimate
to; the closest cases in the paper are:

* pentaerythritol, C(CH2OH)4 (Table 15, p. 919): the same quaternary carbon with four CH2OH groups.  Solid: literature
  -920.60 (54MED/THO), calculated -918.17, residual -2.43 kJ/mol; gas: literature -776.70, calculated -749.72, residual
  -26.98 (the gas-phase group is not the fitted one).  The polyol skeleton is therefore reproduced to 2.4 kJ/mol in the solid;
* tert-butylamine, (CH3)3C-NH2 (Table 26, pp. 984-985): the pair C-(C)3(N) + N-(H)2(C) with three CH3.  Liquid: literature
  -150.60 (67SMI/GOO), calculated -150.57, residual -0.03; gas: literature 121.00 and calculated 120.92 as printed (OCR; both
  are enthalpies of formation, so negative), residual -0.08.  No solid phase is printed;
* the paper's own fit statistics (Table 55, p. 1102 ff.): alcohols, DfH residuals below 4 kJ/mol for 94 of 143 compounds, 4 to 8
  for 30, above 8 for 19; all CHN compounds (amines, nitriles, hydrazines and the heterocycles), 167 of 199 below 4, 19
  between 4 and 8, 13 above 8; the text states average deviations of 2.7 kJ/mol and 4.7 J/mol/K between the literature
  differences solid-liquid and the estimated ones.

The estimate's expected error is therefore 3 to 8 kJ/mol (not 0.01), larger for the amine group in the solid, whose only
fitting compounds are amino acids.

What the solution step needs: the enthalpy of solution of crystalline Tris at infinite dilution, DsolH(cr -> aq, infinite
dilution, 298.15 K), measured calorimetrically.  **No work in hand prints it**: the Tris section of Goldberg et al. (Table
7.68, pp. 357-358) lists calorimetric ionisation enthalpies only (47.45 kJ/mol selected, grade AAA, 23 determinations), the NBS
tables have no Tris row.  Whether Domalski's 1972 compilation (in hand) lists it was not searched.  A measurement is likely to
exist (Tris is a calorimetric reference compound) but its bibliographic data are not
in any work in hand and none is named here.  The entropy of the aqueous neutral would need a solubility and an activity
model as well: the estimate covers DfH only, which is what an energy balance of a conserved buffer needs.  Then
DfH(aq, HTris+) = DfH(aq, Tris) - 47.45 (Goldberg, p. 357); the record `Tris` would carry the estimate, `HTris` the difference.

### 7.2 HEPES (C8H18N2O4S, 4-(2-hydroxyethyl)-1-piperazineethanesulfonic acid)

The method cannot be applied.  Table 2 has groups for N-(C)3 (+101.00 solid, p. 820), C-(H)2(C)(N), C-(H)2(O)(C), O-(H)(C)
and C-(H)2(C)(S) (liquid -26.77; no solid value), and the heterocyclic families of Table 32 (piperidine and others) carry a ring
correction; but the sulfur families of the paper are thiols, sulfides, disulfides, sulfoxides, sulfones, sulfites, sulfates and
heterocyclic sulfur (Tables 42 to 49) and **no sulfonic acid group exists** (searched: no `sulfonic`, no S-(O)... group with a
hydroxyl).  The sulfonic acid group dominates the molecule's enthalpy and is not obtainable from the sulfone group (the
nearest, SO2-(C)2, -356.62 solid) without an unfitted OH increment.  Piperazine itself does not occur in the paper (searched), so the
diaza ring has no ring correction to borrow.  HEPES therefore has no estimate from this work; the only route for
the sulfonic buffers (HEPES, MES, MOPS, PIPES, TAPS, TES, ACES, BES, CAPS, ...) would be a measured enthalpy of formation or of
combustion of one of them, none of which is in hand.

### 7.3 Do the vocabulary and the grammar already support an estimated hfAq announced on use?

* The word: yes.  `estimated` is in `check_origin_census.KNOWN`, `core/Origin.H` and the doctrine (`docs/ai/data-doctrine.md`
  section 5: group contribution; "no estimated value without a provenance{ origin; method }").
* The record: partly.  A species record's `aqueousThermo` block carries `hfAq`, `sAq` and a `source` string; the generic dictionary
  parser accepts a `provenance { hfAq { origin estimated; method "..."; } }` block beside them (the census counts it), and
  `check_origin_census` / `check_record_form` would then hold it.  No species record carries such a block today; the C373 records
  record the derivation in the `source` line only.
* The announcement on use: NO.  The announcements exist for COMPONENTS: `Component::provenanceFor`, the "property origins (this
  run)" block, `PackageAudit` (`requireVerifiedOrThrow` refuses a required `estimated` or `placeholder` value unless the case
  declares `acceptUnverified true;`) and the `[local] UNVERIFIED` line for `data/local`.  An ion's `hfAq` is read by
  `SaltFromCatalogue.H` (and the speciation energy route) as a bare number; nothing reads a species' provenance, so an estimated
  `hfAq` would be used silently.  A small engine slice is needed first: read `aqueousThermo.provenance.hfAq.origin`, list it in
  the property-origins block, and let `PackageAudit` treat an `estimated` species datum the way it treats a component's.
  Until then an estimated record must not be written.

### 6.2 Route 2a: Amend & Helgeson (1997) and Dick, LaRowe & Helgeson (2006): the amino acids

Amend & Helgeson (J. Chem. Soc., Faraday Trans. 93 (1997) 1927-1941, text layer, Table 1 p. 1929) print DfG, DfH (kcal/mol)
and S (cal/mol/K) of 20 neutral amino acids and their charged forms at 25 C, 1 bar, H+ = 0, converted here at 4.184 exactly.
The table's footnotes say how each number was made: the neutral DfG from the crystal's DfG and the solubility, the neutral
DfH from the crystal's DfH and the heat of solution, the charged forms from the neutral and the printed ionisation Gibbs
energy and enthalpy (ref. 69 of the paper), and S from DfG and DfH with the elements' entropies (so every value is a
cited table value, origin `literature`; none is a group-additivity estimate in this table).  The values are in the text
layer; the sign (a bracket in the layer) was read against the paper's own relation DfG = DfH - T(DfS) for three rows.
Dick, LaRowe & Helgeson (Biogeosciences 3 (2006) 311-336) Table 2 reproduces the same amino-acid values ("taken from Amend and
Helgeson", e.g. Ala -88.81 / -132.50 / 38.83 identical) and adds the sidechain and backbone GROUP contributions (Tables 1,
6, 7) and the Gly-X-Gly tripeptides in Table 5, which print only HKF parameters, Cp and V: **neither work prints a formation
datum of glycylglycine or triglycine**, so those two ladders stay without formation data (a group-additivity estimate from
Dick's backbone groups would be origin `estimated`, subject to the announcement slice of section 7.3).

**Entered** (rows `AMEND97` of `formation.tsv`; kJ/mol and J/mol/K after conversion; the ladder as the catalogue names it):

| species | Amend label | DfH (kJ/mol) | S (J/mol/K) |
|---|---|---|---|
| H3His (2+) | His2+ | -484.93 | 315.06 |
| H2His (+) | His+ | -482.00 | 292.29 |
| HHis (0) | His | -452.71 | 276.14 |
| His (-) | His- | -408.78 | 245.85 |
| H3Cys (+) | Cys+ | -521.37 | 218.91 |
| H2Cys (0) | Cys | -519.11 | 193.80 |
| HCys (-) | Cys- | -489.86 | 132.47 |
| Cys (2-) | Cys2- | -452.04 | 52.93 |

**One scale, per family.**  Histidine: the hf differences along the ladder (+2.93, +29.29, +43.93 kJ/mol) reproduce Goldberg's
step enthalpies (3.6, 29.5, 43.8) to 0.67, 0.21 and 0.13: one scale, family tolerance 0.8.  Cysteine: Amend's differences
(+2.26, +29.25, +37.82) differ from Goldberg's (-0.6 printed as approximate, 36.1, 34.1; grades CD, BBD, BBD) by 2.9,
6.9 and 3.7 kJ/mol.  Amend's set is internally consistent (the Gibbs identity of `check_logk_crosscheck` holds on it: no
record fails) and Goldberg's cysteine enthalpies are low grade, so Amend's printed values are kept as one scale and the
family tolerance is 7.0 kJ/mol, stated here: a heat of ionisation computed from the formation enthalpies of cysteine's second
step is 29.3 kJ/mol while the speciation record carries 36.1.

**Amend against Miller & Smith-Magowan, where both print values** (`species_c373.py fcompare`; the catalogue keeps Miller's,
which carry the steps of the evaluation the ladders were written from):

| family | species | Miller | Amend | difference (Amend - Miller) kJ/mol, J/mol/K |
|---|---|---|---|---|
| glycine | H2Gly, HGly, Gly | -518.37, -514.36, -470.26 | -526.01, -522.08, -477.77 | -7.6, -7.7, -7.5 (S +6.3, +5.9, +6.6) |
| alanine | H2Ala, HAla, Ala | -556.76, -553.75, -508.52 | -556.81, -554.38, -508.23 | -0.05, -0.63, +0.29 (S +4.7, +2.7, +5.9) |
| aspartic | H3Aspt, H2Aspt, HAspt, Aspt | -954.96, -947.50, -942.86, -905.10 | -950.35, -947.01, -939.48, -874.87 | +4.6, +0.5, +3.4, +30.2 |
| glutamic | H3Glu, H2Glu, HGlu, Glu | -980.45, -980.72, -979.16, -939.09 | -983.20, -982.49, -979.68, -909.10 | -2.8, -1.8, -0.5, +30.0 |

Glycine's enthalpy sits 7.6 kJ/mol lower in Amend (and in Alberty's Table 3.2, section 6.5) than in Miller and the NBS tables
(which agree with each other to 0.4); alanine agrees to 0.6.  The dianions of aspartic and glutamic acids differ by 30 kJ/mol and
100 to 126 J/mol/K: Amend's dianion is the amino-deprotonated form reached by an ionisation enthalpy of +64.6 (Asp) and
+70.6 (Glu) from the monoanion where Miller's third step is +37.8 and +40.1.  No resolution is in hand; Miller's are kept for these
four families, as the C373 ladders and their step enthalpies are Miller's (the one-scale rule), and nothing was overwritten.

Species that gained formation data in this route: H3His, H2His, HHis, His, H3Cys, H2Cys, HCys, Cys (8, each with DfH and S).

### 6.3 Route 2b: Shock (1995), carboxylic acids and hydroxyacids; Shock & Helgeson (1990)

Shock, Am. J. Sci. 295 (1995) 496-580, is a scan without a text layer: the contents were located by a first OCR pass and every
number below read from the page image at 170 to 300 dpi (rotated landscape tables: Table 4 p. 518-519 = PDF pp. 23-24, Table 7
p. 534 = PDF p. 39, Tables 8-10 pp. 538-544 = PDF pp. 43-49).  The paper's tables are in cal/mol and cal/mol/K (converted at
4.184 exactly), 25 C, 1 bar, H+ = 0 (Appendix 1).  Shock's Table 4 lists DfG, DfH and S of the acids and anions "adopted in
this study", and a superscript on each value says how it was obtained; the estimates are not experimental: the entropy of an
aqueous n-alkanoic acid or diacid is an estimate from the author's correlations (footnotes i, p: eq 13, 16), every anion entropy
inherits it (footnote s), and the enthalpies of the diprotic anions are computed from DfG and the estimated S (footnote ab).
Every such value is recorded with `origin estimated;` and its method in a per-value `provenance {}` block of the species
record (the first species records to carry one; `check_origin_census` recounted, section 6.3 of this note and
`provenance-semantics-five-axes.md`); the experimental values (acid enthalpies from heats of solution, benzoic acid's S) carry
none (the source line says `literature`).  Since C376 (2026-11-13) a non-measured species value is ANNOUNCED on use: where the aqueous ion reference of a salt (hfAq) or the
constant ion-Cp tier (cpAq) consumes it, the run prints `[estimate] species '<name>'` once per species and datum and records the
sentence in the result advisories; an entropy has no consumer yet.  No catalogue case consumes these records; the witness
`estimatedSpecies01_announced` and the gate `check_estimated_species_announced` hold the mechanism.

**Checks before entering anything.**  Convention: the same H+ = 0 aqueous scale as the catalogue (Shock states it, and his
anion values for oxalate, hydrogenoxalate and succinate are NBS and Miller's: H-oxalate -195600 cal = -818.4 kJ/mol and oxalate
-197200 cal = -825.1 equal the NBS entries `HOx` and `Ox` of the catalogue exactly; succinate -217350 cal = -909.37 equals
Miller's).  The Gibbs identity: pK from the printed Gibbs energies of dissociation 6670 cal (propanoic) / 6560 (butanoic) / 5730
(benzoic) = 4.889 / 4.809 / 4.200 against Table 7's 4.89, 4.81, 4.20; malonic 3890 and 7770 cal = 2.85 and 5.70 against 2.85,
5.70; glutaric 5920 and 7390 cal = 4.34 and 5.42 against 4.34, 5.42.  Every one agrees to 0.01.  The tool's one-scale check
(hf difference against the step enthalpy, both taken from Table 4) holds to 0.01 kJ/mol; `check_logk_crosscheck` holds on the new
records.

**New families** (neutral master with its own aqueous datum, since the catalogue holds no solution pair for these acids; pK =
Table 7 at 25 C; dH_ion = the printed DfH of the anion minus that of the acid):

| family | species | pK | dH_ion (kJ/mol) | acid DfH, S (kJ/mol, J/mol/K) | origin of S |
|---|---|---|---|---|---|
| propionic | HPropn, Propn | 4.89 | -0.669 | -512.41, 206.69 | estimated (eq 13) |
| n-butyric | HBut, But | 4.81 | -2.845 | -535.34, 234.72 | estimated (eq 13) |
| benzoic | HBenz, Benz | 4.20 | +0.335 | -355.93, 230.54 | experimental (Table 2) |
| malonic | H2Maln, HMaln, Maln | 2.85, 5.70 | +0.084, -4.812 | -869.73, 233.05 | estimated (eq 16); anions DfH estimated |
| glutaric | H2Glut, HGlut, Glut | 4.34, 5.42 | -0.544, -2.385 | -934.87, 306.27 | estimated (eq 16); anions DfH estimated |

**Not entered.**  Adipic acid: Shock's H-adipate DfH (-227130 cal) is calculated from an estimated S and implies a first
ionisation enthalpy of +10.96 kJ/mol (acid -229750 cal), which no measurement supports; the other diacids of the table (pimelic,
suberic, azelaic, sebacic) and the monocarboxylic acids beyond butanoic are likewise estimates throughout and have no ionisation
record in the catalogue: none was built.  Oxalate and succinate need nothing (NBS and Miller already carry them).  Malic acid: Shock
adopts no malic or citric acid in Tables 4 and 10 (Table 9 lists only dissociation properties; Table 8 prints DL-malic acid
DfH -259040 cal = -1083.8 kJ/mol, Miller's value, and citric acid DfH -364650 cal = -1525.7 kJ/mol), so **no malate or citrate
entropy comes from this work**.

**Hydroxyacids** (Tables 8 and 10, pp. 538 and 544).
* Glycolic acid: DfH(aq) -154890 cal = **-648.06 kJ/mol** (Table 8 footnote a: Miller & Smith-Magowan's value "corrected in
  present study"; it equals Miller's own crystal -664.0 plus the heat of solution +15.94, so the three-way disagreement of
  section 1.3 resolves on the crystal route; the value Miller printed, -651.0, is the one the paper corrected).  S 43.1 cal =
  180.33 J/mol/K, estimated (footnote g, eq 39).  Glycolate DfH = -647.60 (acid plus Miller's dH_ion +0.46) on one scale with the
  evaluated step; the paper's own -154700 cal = -647.28 is derived by it from an estimated DfG and S (footnote r), 0.32 away; S =
  180.33 - 72.0 = 108.33 (the paper's estimate 26.2 cal = 109.62).  NBS' -652.3 (the glycolate row, no entropy) is 4.7 away and not
  used.  Records `HGlyc` and `Glyc` now carry them; tolerance of the one-scale check 0.05.
* Lactic acid and lactate: S only (the enthalpies were already Miller's): 49.8 cal = 208.36 and 31.9 cal = 133.47 J/mol/K, both
  estimated (footnotes g, h); with Nims & Smith's pK 3.862 and dH_ion -0.251 they imply a dissociation entropy of -74.9 against
  -74.7 J/mol/K from the pK.  The neutral master `HLac` carries `sAq` and no `hfAq` (its datum is the component and pair).

**Shock & Helgeson (1990), Geochim. Cosmochim. Acta 54, 915-945** (text layer with a heavily corrupted OCR; the rows read from
page images where used).  Table 6 lists aqueous alkylamines (methanamine, ethanamine, 1-propanamine ...), amino acids and
alcohols but **no ethanolamine**.  Methanamine row (p. 21 of the file, image): DfG 5040, DfH -16320 cal, S 30.5 cal/mol/K =
21.09 and -68.28 kJ/mol, 127.6 J/mol/K, marked by the paper as calculated from a cited source ("q"); the NBS tables (route 1)
print -70.17 and 123.4 for the same species, measured, 1.9 kJ/mol and 4.2 J/mol/K away.  NBS is kept (measured, and the cation
CH3NH3+ is on the same table); where 1990 and 1995 both print a value the 1995 value supersedes.  The OCR rows of the 1990 Table 6 give propanoic acid
DfG -93430 and butanoic acid -91190 cal/mol (DfH -122470 and -127950, equal to 1995) against the 1995 -93450 and -91210: the Gibbs
energies differ by 20 cal/mol (0.08 kJ/mol) and the 1995 numbers are the ones entered; formic and acetic acid agree.  Ethanolamine and its cation: no value
in any work in hand; the ethanolamine ladder stays without formation data.

Species that gained formation data in this route: HGlyc, Glyc (DfH, S), HLac, Lac (S only), HPropn, Propn, HBut, But, HBenz,
Benz, H2Maln, HMaln, Maln, H2Glut, HGlut, Glut (DfH, S): 16 species.

### 6.4 Route 4: Alberty (2003), Table 3.2

Alberty, Thermodynamics of Biochemical Reactions (Wiley-Interscience 2003; text layer with OCR errors, so every number was read from
the page images, PDF pp. 58-61 = book pp. 52-55) prints, for 131 reactants, DfG and DfH (kJ/mol) of each species at 298.15 K and zero
ionic strength, with the charge and the number of hydrogens.  Convention (the table's note, p. 55): DfG = DfH = 0 for the elements in
their reference states and for H+ (a = 1), the catalogue's H+ = 0.  The note does not restate the concentration scale; a
1 mol/L against 1 mol/kg difference would be 0.01 kJ/mol in DfG, below the digits compared here.  The table has **no entropy**
column, and the DfH column is **blank** for many species (cis-aconitate, malate, glycolate, pyruvate's relatives, most phosphates
of sugars, cysteine, butyrate ...): a blank is never filled from another work.  An entropy-equivalent follows only where both are
printed: S = (DfH - DfG)/T + sum of the elements' S (CODATA, COD89) - z S(H2)/2 (the last term takes the table's S(H+) = S(H2)/2 to the
catalogue's S(H+) = 0).  It reproduces acetate (86.58 against 86.6), oxalate (45.34 against 45.6), hydrogenphosphate (-33.1 against
-33.5) and fumarate (105.9 against Miller's 105.25), and misses succinate by 12 J/mol/K (93.3 against 81.5, Alberty's succinate DfG
differing from the Miller route), so an entropy derived this way carries about +-12 J/mol/K.

**Where Alberty and the NBS tables coincide**: acetate, formate, oxalate, ammonium, carbonate, hydrogencarbonate and
methylammonium (identical to the digit; Alberty took them from NBS).  **Where they do not**: inorganic phosphate (H2PO4-: -1302.6 / -1137.30
against NBS -1296.29 / -1130.28; HPO4 2-: -1299.00 / -1096.10 against -1292.14 / -1089.15: both DfH and DfG are 6.3 to 7.1 kJ/mol lower,
the entropy equal) and pyrophosphate (P2O7 4-: DfH -2293.47 against -2271.1, DfG -1919.86 against -1919.0).  Alberty's pyrophosphate
step enthalpies (+1.40, +0.50, -5.00, -9.20) are exactly Goldberg's.

**One scale per family, and the reason.**

| family | Alberty against the catalogue (DfH, kJ/mol) | kept | why |
|---|---|---|---|
| succinate | Succ -908.68, HSucc -908.84, H2Succ -912.20 against Miller -909.37, -908.93, -912.11 | Miller | within 0.7; same evaluation as the steps |
| fumarate | -777.39, -774.46, -774.88 against -777.57, -774.72, -775.18 | Miller | within 0.3 |
| lactate | -686.64 against -686.63 | Miller | identical |
| citrate | Cit -1515.11, HCit -1518.46, H2Cit -1520.88 against Kochergina -1528.5, -1526.2, -1529.7 (offsets +13.4, +7.7, +8.8) | Kochergina | see below |
| malate | DfG only (-842.66 z=-2, -872.68 z=-1), DfH blank | Miller | no entropy derivable |
| phosphate | -1302.6 and -1299.00 against NBS -1296.29, -1292.14 | NBS | see below |
| pyrophosphate | -2294.87 ... -2281.17 against -2272.5 ... -2258.8 (22 to 23 lower) | NBS-anchored (route 1) | see below |
| glycine | -523.00 against Miller -514.36 | Miller | Alberty agrees with Amend (-522.08); Miller with NBS |
| alanine, aspartate, glutamate | -554.80, -943.41, -979.89 against -553.75, -942.86, -979.16 | Miller | within 1.1 |
| glycylglycine | z = 0: -734.25 (DfG -520.20) | **Alberty (new)** | no other work in hand |

* **Citrate**: Alberty prints G and H for all three ions, so an entropy could be derived (Cit 93.2, HCit 204.3, H2Cit 287.3 J/mol/K), but
  his enthalpies are 8 to 13 kJ/mol from Kochergina's and his third step (+3.35) has the opposite sign to Goldberg's (-3.38), while the
  neutral master's datum (crystal plus heat of solution) ties the family to Kochergina's scale with the one-scale check at 1.6.  Entering
  Alberty's entropies with Kochergina's enthalpies would mix two scales, and replacing the enthalpies is not warranted by a 8 to 13
  kJ/mol disagreement between two evaluations.  **No citrate entropy is entered**; the derived values are in the table above and in
  `formation_compare.tsv` (enthalpies).
* **Phosphate and pyrophosphate**: the hydrolysis P2O7 4- + H2O -> 2 HPO4 2- has DfH = -27.35 kJ/mol on the NBS rows, -18.70 on Alberty's, and
  -4.98 if Alberty's pyrophosphate is combined with the catalogue's NBS phosphate (which also carries PO4 3-, absent from Alberty).
  The catalogue keeps the NBS phosphates, so pyrophosphate stays on the NBS-anchored scale of route 1; moving both to Alberty would be one
  decision (and would change the existing `PO4` value, which this campaign does not do).  The Alberty-derived pyrophosphate entropies,
  for the day that decision is taken: P2O7 -191.5, HP2O7 -15.1, H2P2O7 111.9, H3P2O7 171.9, H4P2O7 218.6 J/mol/K (75 below the route-1
  values for the same enthalpy offset).
* **Lactate entropy**: Alberty-derived 147.1 J/mol/K against Shock's estimate 133.5 (route 2b): Shock's is kept because it is paired with the
  estimated acid entropy and the printed dissociation entropy; the 14 J/mol/K difference is the scatter of the two derivations.
* **Glycylglycine (entered)**: the table lists one species, so HGlyGly carries DfH -734.25 kJ/mol and S = 327.1 J/mol/K (the entropy-
  equivalent, elements C 4, H 4 H2, N 1 N2, O 1.5 O2) and the ions follow from Goldberg's steps (pK 3.140, dH +0.11; pK 8.265, dH +43.4): H2GlyGly
  -734.36 / 386.8, GlyGly -690.85 / 314.4.  Not entered from this table: pyruvate (no family in the catalogue), glycolate (DfG only), L-cysteine
  and butyrate (DfG only).

Species that gained formation data in this route: H2GlyGly, HGlyGly, GlyGly (3).
