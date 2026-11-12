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
nothing from memory, the web, DECHEMA / DWSIM / ChemSep or a NonCommercial compilation; the CRC Handbook is a second
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
| **hydrazine** | component `N2H4` only | `N2H6`, `N2H5`, `Hydrazine` (not `N2H4aq`: the identity gate pins the `aq` class as closed, so the neutral base takes a word key) and three records | 7.40, p. 300: pK -0.99 / 8.02, dH 38.1 / 41.7; no dCp | formation data; the gas-liquid link of `Hydrazine` to the component |

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
(phosphate, pyrophosphate x3, arsenate, sulfite, hydrazinium chloride), Davies, `pH solve`.  A structural illustration; no
`anchor` rows (no pH printed in a work in hand).  For two neighbouring species at equal molality the Davies pH equals
pK + log(gamma_B/gamma_A) to the printed digits (arsenate 6.728 = 7.05 - 0.322), which the header shows; sealed and
recorded the way C372's cases were.

## 3. What phases 1 and 2 left undone

Malonic acid (not in Goldberg, Miller or NBS), gluconic, ascorbic, gallic, propionic, butyric, benzoic: no evaluated
ionisation work in hand.  Entropies of malate, lactate and the crystals.  The aqueous heat capacities.  Formation data
of the new inorganic ions (the NBS tables in hand carry several of them and were not searched in phase 2).  The `dCp` of
every ionisation (see the proposal below).

### 3.1 Where a `dCp` would go

  The printed ionisation heat capacity change is not carried by any record: the grammar reads
`logK25`, `dH` and an `analytic` block.  A constant dCp is exactly the `A1`, `A3`, `A4` terms of the `analytic` form
(log K(T) = logK25 + [ana(T) - ana(298.15)]); a `dCp` key on the record, resolved to those terms at load time and
announced, would carry every printed value without a new model.  Proposed, not built.
