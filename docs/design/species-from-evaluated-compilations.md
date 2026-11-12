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
