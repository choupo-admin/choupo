# Organic acids in the catalogue (C372)

Status: record of a curation campaign, 2026-11-12.  Branch `c372-organic-acids`.
Requested by Vítor, who works with wine and food streams and found that citric,
malic, lactic and succinic acids existed in no form.

**What this note settles.**  (1) What the catalogue holds for each of eighteen
common organic acids and what each work IN HAND carries; (2) what was built, and
which quantity of each record comes from which work; (3) how the works agree where
they overlap; (4) which source the tartrate records should stand on; (5) the works
still missing, in the order that matters for wine and food streams.

**Rule that bounds it.**  A value enters a record only from a work that was READ,
cited with table and page; primary or evaluated sources only.  Nothing from
memory, the web, DECHEMA/DWSIM/ChemSep or any NonCommercial compilation.  An
aggregator (the CRC Handbook) is a SECOND READING that enters no value.  The
ThermoML mirror is a finding aid: no value enters from it unless the article it
points at is read (its README).

## 1. Works in hand, and what each carries

| work (in `Choupo-Literature`) | carries | for which acids |
|---|---|---|
| **Goldberg, Kishore & Lennen, J. Phys. Chem. Ref. Data 31 (2002) 231** (NIST reprint, `Handbooks-DataCompilations/goldberg2002-buffers-...pdf`) | EVALUATED pK, dH_ion and dCp of each ionisation step at 298.15 K, I = 0, with an evaluation grade per step and every literature value it weighed.  Sections 7.2 acetate (p. 238), 7.22 citrate (p. 265), 7.42 maleate (p. 305), 7.50 oxalate (p. 316), 7.57 succinate (p. 340), 7.63 L-tartaric (p. 347); the summary is Section 8 (pp. 359-360).  **No** malate, lactate, malonate, fumarate, glycolate (the TOC and a text search were read: there is a diglycolate section, not glycolate) and no formate | acetic, citric, maleic, oxalic, succinic, tartaric |
| Kochergina, Volkov, Krutov & Krutova, Russ. J. Phys. Chem. 80 (2006) 899-903 | dHf of the crystal (bomb calorimetry); heat of solution; dHf of the hypothetical non-dissociated acid and of the anions in water.  **No pKa** and no dissociation heat of its own (it takes those from an unpublished thesis, its ref. [8]).  No entropy, no heat capacity | citric (Table 4), tartaric (Table 5) |
| Patterson & Woolley, J. Chem. Thermodyn. 33 (2001) 1567-1585 | pK and dH_ion of the two steps, 278-393 K (Tables 9 and 10), Cp, V | tartaric only |
| **Eden & Bates, J. Res. Natl. Bur. Stand. 62 (1959) 161** (Research Paper 2947; US government work; scan, read from the page images) | thermodynamic pK1, pK2 of d,l-MALIC acid at 5-degree intervals 0-50 C, the fitted equations (24) and (25) (p. 168) and, in Tables 5 and 6 (p. 169), dG, dH, dS, dCp of both steps | malic |
| **Nims & Smith, J. Biol. Chem. 113 (1936) 145** (open access, CC BY; page images) | thermodynamic pK of LACTIC acid at 0.3-50 C, equation (2) pK = 3.862 + 5e-5 (t - 23.5)^2 (p. 149), and dF, dH, dS at five temperatures in Table II (p. 148) | lactic |
| **Miller & Smith-Magowan, J. Phys. Chem. Ref. Data 19 (1990) 1049** (NIST evaluated compilation; read from page images) | evaluated pK, dH_ion, dS_ion at 25 C for formic, acetic, succinic, FUMARIC, glycolic, lactic, malic, citric and others (Table 6, p. 1057); dHf of some crystals and aqueous acids (Table 5, p. 1056); evaluated Gibbs energies of formation of the aqueous ions (Table 10, p. 1067, with Table 9, p. 1066). Convention: H+(aq) = 0, zero ionic strength, aqueous ions at 1 mol/dm3 (Table 1 caption, p. 1052) | citric, malic, lactic, succinic, fumaric, glycolic |
| NBS tables, Wagman et al. 1982, J. Phys. Chem. Ref. Data 11 Suppl. 2, Table 23:C (scanned; read from the page images) | dHf, dGf, S, Cp of aqueous species.  **Only C1 and C2 compounds**: formic acid and formate (p. 2-83), acetic acid and acetate, hydrogenoxalate (p. 2-93) and oxalate (p. 2-92), glycolate (dHf only, p. 2-93), glycolic acid crystal (p. 2-94) | formic, acetic, oxalic (anions), glycolic (partial) |
| CODATA key values (Cox, Wagman & Medvedev 1989) | about 150 key substances, no organic acid beyond the carbon family | none |
| CRC Handbook of Chemistry and Physics, 82nd ed. (Lide) | pKa at 25 C of 1070 organic acids; dHf/dGf/S/Cp of crystals and liquids.  **Aggregator: second reading, enters no value.**  Its pKa rows name no source (the table cites Perrin 1965/72, Serjeant & Dempsey 1979, Albert 1963, Sober 1968 as a group) | all |
| Perry's Chemical Engineers' Handbook, 9th ed., Table 2-2 | density, melting point, solubility of the organic acids (used for citric density) | all |
| ThermoML mirror (`index.json`) | finding aid: citric 24 articles, malic 9, lactic 19, succinic 30, malonic 16, tartaric 4: solubility, density, osmotic coefficient, Cp, fusion, melting, eutectics, viscosity.  **No ionisation constant and no aqueous-species thermodynamics in any of them** (the property names in the files were listed) | component and later solution models |

## 2. The inventory

`C` component, `S` aqueous species, `I` ionisation chemistry, `H` heat-of-solution
pair.  "Goldberg" = the evaluated pK and dH of the work above.

| acid | in the catalogue today | built here | what a source in hand carries | missing |
|---|---|---|---|---|
| **citric** | nothing | **C, H, S x4, I x4**, case | Goldberg 7.22: pK 3.128 / 4.761 / 6.396, dH 4.07 / 2.23 / -3.38 kJ/mol, dCp -131 / -178 / -254 (grades AAB); Kochergina Table 4: dHf of the crystal and four aqueous forms | s_298 and Cp of the crystal and of the solution; entropies of the ions; solubility vs T |
| **malic** | nothing | **S x3, I x3** (speciation-complete) | Eden & Bates Tables 5-6 p. 169: pK1 3.459, pK2 5.097, dH +2,955 / -1,181 J/mol, dCp -155 / -221 (d,l acid) | dHf, S of the ions and the crystal; no component |
| **lactic** | nothing | **S x2, I x2** (speciation-complete) | Nims & Smith Table II p. 148: pK 3.862, dH -60 cal/mol (= -251 J/mol) at 25 C | dHf, S of lactate and of the acid (liquid / crystal); no component |
| **succinic** | nothing (diethyl succinate) | **S x3, I x3** (speciation-complete) | Goldberg 7.57: pK 4.207 / 5.636, dH 3.0 / -0.5, dCp -121 / -217 (AAB / AAA); CRC crystal dHf second reading | dHf and S of the aqueous species and of the crystal; no component |
| **tartaric** | C, S x3, I x3, H (earlier) | the three I records CORRECTED to Goldberg 7.63 (see section 4) | Goldberg 7.63, Patterson Tables 9-10, Eden & Bates Table 6 (the same tartaric values), Kochergina Table 5 | nothing for the ionisation |
| **malonic** | nothing | nothing | CRC pKa 2.85 / 5.70 | everything: not in Goldberg |
| **oxalic** | C (`oxalicAcid`) | **S x3, I x3** | Goldberg 7.50: pK 1.27 / 4.266, dH -3.9 / -7.00, dCp ~-231 (BBC / AAA); NBS hfAq and S of HC2O4- and C2O4-- | NBS prints no dGf of the aqueous neutral acid (so pK1 is not derivable from NBS; Goldberg supplies it); no solution pair |
| **fumaric** | nothing | **S x3, I x3** (speciation-complete) | Miller Table 6 p. 1057: pK1 3.095, pK2 4.602, dH +0.46 / -2.85 kJ/mol | dHf, S of the ions and the crystal; no component |
| **maleic** | C (`maleicAcid`) | **S x3, I x3** (speciation-complete) | Goldberg 7.42: pK 1.92 / 6.27, dH 1.1 / -3.6 (grades CBD / BBD: the weakest in this set) | dHf and S of the ions |
| **glycolic** | nothing | nothing | NBS glycolate dHf -652.3 (no dGf, no S); Goldberg has no glycolate | dGf / S, pK, dH |
| **gluconic** | nothing | nothing | nothing in hand (not in the CRC pKa table) | everything |
| **ascorbic** | nothing | nothing | CRC pKa 4.04 / 11.7 | everything |
| **gallic** | nothing | nothing | CRC pKa (3,4,5-trihydroxybenzoic) 4.41 | everything |
| **acetic** | C, S `Acetate`, I `HAc-formation`, gas-liquid | checked: complete | Goldberg 7.2: pK 4.756, dH -0.41, dCp -142 (grade AAA) = the record's own source; NBS rows give pKa 4.757 | nothing at 25 C |
| **formic** | S `Formate` (NBS) | **I `HFo-formation`** (derived from NBS) | NBS p. 2-83: formate -425.55 / -351.0 / 92., acid(ao) -425.43 / -372.3 / 163.; CRC 3.75; **not in Goldberg** | no component, no gas-liquid record |
| **propionic** | C | nothing | CRC pKa 4.87 | pK, dH, species: not in NBS (C2 limit) or Goldberg |
| **butyric** | C | nothing | CRC pKa 4.83 | same |
| **benzoic** | C | nothing | CRC pKa 4.204 | same |

## 3. What was built, and which work each quantity comes from

All on the tartrate pattern: a neutral master with no `hfAq` (the neutral datum
sits in the solution-pair record), the ions with their own file, one
`aqueousSpeciation` record per ion written from the master, plus the inverse
written from the fully dissociated ion so a case may declare either master.  The
enthalpy in each chemistry record is Goldberg's evaluated dH_ion, from the same
table as the pK, never a difference of formation enthalpies.

| family | files | logK25 and dH | hfAq / sAq of the ions | other |
|---|---|---|---|---|
| **citrate** | `species/{H3Cit,H2Cit,HCit,Cit}`; `chemistry/{H2Cit,HCit,Cit,H3Cit}-formation` | Goldberg Table 7.22, p. 265 | Kochergina Table 4: -1529.7 / -1526.2 / -1528.5 kJ/mol (no S) | `components/citricAcid` (Kochergina Table 4 dHf crystal -1551.7; Perry's density 1542); `parameters/solution/citricAcid-water` dHsoln +17.4 (Kochergina Table 4); navigation family `citrate` |
| **succinate** | `species/{H2Succ,HSucc,Succ}`; `chemistry/{HSucc,Succ,H2Succ}-formation` | Goldberg Table 7.57, p. 340 | none: nothing in hand | navigation `succinate` |
| **oxalate** | `species/{H2Ox,HOx,Ox}`; `chemistry/{HOx,Ox,H2Ox}-formation` | Goldberg Table 7.50, p. 316 | NBS Table 23:C: HC2O4- -818.4 kJ/mol, S 149.4 (p. 2-93); C2O4-- -825.1, 45.6 (p. 2-92) | navigation `oxalate` |
| **maleate** | `species/{H2Male,HMale,Male}`; `chemistry/{HMale,Male,H2Male}-formation` | Goldberg Table 7.42, p. 305 | none: nothing in hand | navigation `maleate` |
| **fumarate** | `species/{H2Fumar,HFumar,Fumar}`; `chemistry/{HFumar,Fumar,H2Fumar}-formation`; navigation `fumarate` | Miller & Smith-Magowan 1990, Table 6 p. 1057 (an evaluation; no primary of its own in hand) | none | |
| **malate** | `species/{H2Malic,HMalic,Malic}`; `chemistry/{HMalic,Malic,H2Malic}-formation`; navigation `malate` | Eden & Bates 1959, Table 6 p. 169 (eqs. 24-25 reproduce them: 3.4592 and 5.0966 at 298.15 K) | none: nothing in hand | keys are `Malic*`, not `Mal*`, so they cannot be confused with the maleate keys `Male*`; racemic acid |
| **lactate** | `species/{HLac,Lac}`; `chemistry/{Lac,HLac}-formation`; navigation `lactate` | Nims & Smith 1936, Table II p. 148 (pK 3.862; dH -60 cal/mol, the unit inferred from dF 5267 = 2.3026 R T pK; their eq. (4) gives -255 J/mol) | none: nothing in hand | |
| **formate** | `chemistry/HFo-formation` | DERIVED: dG_ion = dGf(HCO2-) - dGf(HCO2H,ao) = -351.0 + 372.3 = 21.3 kJ/mol -> pKa 3.732; dH_ion = -425.55 + 425.43 = -0.12 kJ/mol (NBS Table 23:C p. 2-83) | `Formate` (existing, NBS) | as acetic acid, HFo has no species file |

**The succinate and maleate species carry no `aqueousThermo`.**  This is a
deliberate departure from "complete to the standard of the existing records", so
it is stated here: their SPECIATION (pH, distribution, van't Hoff in T) is
complete, because pK, dH and dCp are evaluated; their formation enthalpy is not
in any work in hand.  The neutral tartrate master `H2Tart` already ships in
exactly that state, and the energy rung of the dissociated route refuses by name
rather than borrowing a value.  The headers of the records say so.  If you prefer
that no species ship without a formation datum, delete the six succinate/maleate
species files and their six chemistry records; nothing else depends on them.

**What was NOT built:** malonic, glycolic, gluconic,
ascorbic, gallic, propionic, butyric, benzoic (no ionisation work in hand; the CRC
pKa rows are second readings only).  Oxalic acid's neutral aqueous Gibbs energy
and glycolate's are not in NBS either, which is why Goldberg, not NBS, supplies
oxalic pK1.

**Where the malic reference was found.**  The IUPAC digitised pKa dataset
(github.com/IUPAC/Dissociation-Constants, licensed CC BY-NC 4.0) lists Eden & Bates in its reference
list.  It is a FINDING AID ONLY: no value from it entered any record, and none is quoted in
one.  For lactic acid its high-confidence table has one approximate entry and names no
usable primary; the lactic reference (Nims & Smith) was supplied separately.

Cases: `wineAcids01_tartaric_malic` (tartaric + malic + lactic, 0.03 mol/kg each, titrated with KOH;
illustrative round numbers, no sourced wine composition in hand), `volatileAcids01_acetic_formic` (acetic and formic, exercising
`HAc-formation` and the new `HFo-formation`) and `citricAcid01_speciation`
(0.1 mol/kg citric acid against 0 to 2.5 equivalents of NaOH).  Neither carries
`anchor` rows: no work in hand prints a pH for these solutions.

## 4. Where the works agree and disagree

Same-quantity comparisons, nothing tuned.  dH_ion in kJ/mol at 298.15 K.

**Citric acid: Goldberg's dH_ion against the differences of Kochergina's hfAq**
(Kochergina derived its ion hfAq from dH_ion values of an unpublished thesis,
so this is a consistency check of two evaluations, not two independent
measurements).

| step | Goldberg dH_ion | Kochergina hfAq(product) - hfAq(reactant) | Goldberg - Kochergina |
|---|---|---|---|
| H3Cit -> H2Cit- | +4.07 | -1529.7 + 1534.3 = +4.6 | -0.53 |
| H2Cit- -> HCit2- | +2.23 | -1526.2 + 1529.7 = +3.5 | -1.27 |
| HCit2- -> Cit3- | -3.38 | -1528.5 + 1526.2 = -2.3 | -1.08 |
| H3Cit -> Cit3- (sum) | +2.92 | +5.8 | -2.88 |

Kochergina states +/-1.1 to 1.6 kJ/mol on the formation enthalpies (Table 4 caption and
p. 902), so a difference of two carries about +/-1.6 to 2.3: the three step
differences are inside it; the sum (2.9) is at the edge of it.
The records use Goldberg's dH (one work for pK and dH, graded AAB); the species
carry Kochergina's hfAq.  The two will disagree by those amounts if a case ever
derives a reaction enthalpy from the species: that is the evidence-sized
uncertainty, not an error.  (Kochergina's text on p. 902 quotes -1526.5, -1530.0,
-1534.6; its Table 4, used here, is the weighted mean of two procedures.)

**Oxalic acid: NBS against Goldberg.**  pK2: NBS dG_ion = -673.9 + 698.34 = 24.44
kJ/mol (pKa 4.281) against Goldberg 24.351 (4.266): +0.09 kJ/mol.  dH2: NBS
-825.1 + 818.4 = -6.7 against Goldberg -7.00: +0.3.  **Acetic acid:** NBS pKa 4.757
against Goldberg 4.756; dH -0.25 against -0.41.  The agreements are the reason to
trust a derived formate (NBS only: Goldberg has no formate).

**Tartaric acid: three sources side by side.**

| | pK1 | pK2 | dH1 (kJ/mol) | dH2 | cited in the record? |
|---|---|---|---|---|---|
| records `H2Tart`/`HTart`/`Tart-formation` | 2.98 | 4.34 | +3.8 | +1.1 | pK: "literature, 25 C", **no citation**; dH: Kochergina Table 5, which they match |
| Patterson & Woolley 2001, Tables 9 / 10 | 3.0360 | 4.366 | +3.10 | +0.99 | -- |
| Goldberg et al. 2002, Table 7.63 (p. 347) | 3.036 | 4.366 | +3.19 | +0.93 | -- |

Patterson (a new measurement) and Goldberg (an evaluation graded ABA that weighs
the literature values it lists; its selected pK 3.036 / 4.366 equal the values tabulated there from Bates & Canham, ref. 51BAT/CAN) agree to 0.000 in
pK and 0.1 in dH.  The records' 2.98 and 4.34 are the CRC's second-reading values,
0.056 and 0.026 below.  In K1 K2 the records are 21 % high (7.32 against 7.402).
**Decision: the records stand on Goldberg Table 7.63** (and Eden & Bates 1959 Table 6 prints
the same tartaric values, 3.036 / 4.366, dH 3,100 / 990 J/mol, from Bates & Canham): it is the
work the catalogue already uses for acetic acid; it is an evaluation that reports its grade and
its rejected values, so a re-reading is possible; and it agrees with the independent Patterson
measurement.  **DONE 2026-11-12 (the architect's authorisation: "the tartrate ionisation constants are
corrected from uncited handbook values (K1 K2 21 % off) to the evaluated ones").**  The three
records now carry logK 7.402 / -3.036 / -7.402 and dH -4.12 / +3.19 / +4.12 kJ/mol and cite Goldberg
Table 7.63 p. 347 with Patterson & Woolley as the agreeing measurement.

| | before | after | change |
|---|---|---|---|
| pK1 | 2.98 | 3.036 | +0.056 |
| pK2 | 4.34 | 4.366 | +0.026 |
| sum, logK(H2Tart-formation) | 7.32 | 7.402 | +0.082 (K1 K2 +21 %) |
| dH1, first ionisation | +3.8 kJ/mol (Kochergina hfAq difference) | +3.19 (Goldberg) | -0.61 |
| dH1 + dH2 | +4.9 | +4.12 | -0.78 |

The species' hfAq stay Kochergina's; the ionisation enthalpies now come from Goldberg and
differ from the hfAq differences by the amounts above, inside Kochergina's +/-1.5 per species.

Consequence, and what was done:

* `tartaricAcid_acidulation` is the ONLY case whose sealed `constant/chemistry` carried the three
  records.  A full `bin/choupo-import` re-seal was tried first and REFUSED to be a re-seal of
  three records: with the golden set aside it rewrote 57 records (catalogue drift since
  2026-08-02: the release label Choupo-2607 -> 2608, provenance blocks added to species and
  Pitzer pairs, the Na-Cl pair "learned" from the ledger).  It was therefore restored, and the three
  records were copied into `constant/chemistry/` with exactly their three manifest entries
  (sha256, computationalSha256, originSha256) recomputed by the importer's own functions
  (`sha_file`, `canonical_sha_file`); nothing else in the seal moved.  The golden was re-recorded
  on that seal; every moved row is listed in the commit message of the re-record.
* The case's two `pKa2_*` operations fixed `pH 4.34` ("the thermodynamic pKa2"); they now fix
  `pH 4.366`, so they keep their meaning.  Rows moved by that input change alone are listed
  separately from rows moved by the constants alone.
* `ed08_wine_kht_model_solution`, `ed09_wine_multiionic` and the plant `tartaricAcid` use the
  tartrate SPECIES' hfAq and D0 and molecular reactors, not the ionisation constants.  No other
  shipped case, sealed manifest, GUI file or guide text carried 2.98 / 4.34 / 7.32 for tartaric
  acid (grep of `gui/src`, `gui/tests`, `docs/*.tex`, `docs/ai`, `tutorials/`, `data/`).

**Miller & Smith-Magowan 1990 (Table 6, p. 1057) against the sources the records use.**  No record
was changed by this comparison; the ionisation records keep the primary measurement or the graded
evaluation named in each header.

| acid | quantity | record's source | Miller Table 6 | difference |
|---|---|---|---|---|
| citric | pK1 / pK2 / pK3 | 3.128 / 4.761 / 6.396 (Goldberg) | 3.128 / 4.761 / 6.396 | 0 |
| citric | dH1 / dH2 / dH3 (kJ/mol) | +4.07 / +2.23 / -3.38 (Goldberg) | +4.17 / +2.44 / -3.36 | +0.10 / +0.21 / +0.02 |
| succinic | pK1 / pK2 | 4.207 / 5.636 (Goldberg) | 4.207 / 5.636 | 0 |
| succinic | dH1 / dH2 | +3.0 / -0.5 (Goldberg) | +3.18 / -0.45 | +0.18 / +0.05 |
| malic | pK1 / pK2 | 3.459 / 5.097 (Eden & Bates) | 3.458 / 5.097 | -0.001 / 0 |
| malic | dH1 / dH2 | +2.955 / -1.181 (Eden & Bates) | +2.95 / -1.18 | 0 |
| lactic | pK | 3.862 (Nims & Smith) | 3.858 | -0.004 |
| lactic | dH | -0.251 (Nims & Smith, -60 cal) | -0.43 | -0.18 |

All agree inside the sources' own uncertainty: Miller cites the same measurements for the pK's (the
citric, succinic and lactic constants of its table are Goldberg's and Nims & Smith's families).

**Formation data of the ions, pointed to and NOT entered.**  Miller Table 10 (p. 1067) prints the
evaluated Gibbs energies of formation of succinate, fumarate, glycolate, L-lactate, L-malate and citrate,
in two columns ("succinate + acetate" and "all third law"), on the convention H+(aq) = 0, I = 0 (Table 1,
p. 1052), which is the catalogue's; Table 5 (p. 1056) prints the enthalpies of formation of the crystals
and of some aqueous acids (DL-malic acid -1105.66 crystal and -1083.81 aqueous; L-lactic -694.0 liquid and
-686.2 aqueous, kJ/mol).  Turning these into hfAq and sAq of the ions needs the enthalpies of the ions
(aqueous acid plus the Table 6 ionisation enthalpies) and third-law entropies read from Tables 2-4, and a
choice between Miller's two columns; that is a reading of its own and it was not done in this pass.
Consequence: the succinate, maleate, malate, lactate and fumarate species stay without `aqueousThermo`, and
the energy route through them refuses by name.  Domalski 1972 (JPCRD 1, 221, a scan, sections 6.10-6.14)
would supply crystal and liquid heats of formation from combustion for malic, succinic, lactic and
fumaric acids; not read either.

## 5. The works still missing, in the order that matters for wine and food

1. **Formation data of the aqueous species and the crystals of malic, lactic, succinic, fumaric and
   citric acids**: Miller & Smith-Magowan 1990 Tables 2-6, 9, 10 and Domalski 1972 are IN HAND and not yet
   read into records (see above).  Malic and lactic acids now have their ionisation (Eden & Bates 1959; Nims &
   Smith 1936), succinic and citric theirs (Goldberg 2002); none of the C3+ acids has an
   evaluated formation datum in the works read above.  See the continuation of this note.
2. **Lactic and malic liquid / crystal data** (component records): see the continuation.
3. **Malonic and fumaric acid, then glycolic acid**: not in Goldberg; Serjeant &
   Dempsey for the pK; glycolate's dGf and S (NBS prints only dHf) from a
   Wagman-class page on C2 organics beyond the one read.
4. **Formation enthalpies and entropies of the aqueous succinate and maleate
   species**, and of the ions of citrate (entropy): the aqueous-species
   thermodynamics are absent for every C3+ acid except citrate's dHf and tartaric.
   Articles that measured the crystals' Cp, fusion or solubility are named by the
   ThermoML mirror (succinic: 10.1016/j.jct.2017.09.007, 10.1016/j.jct.2004.12.011;
   citric Cp: 10.1021/acs.jced.5b00989, 10.1021/acs.jced.8b00064; malic:
   10.1021/acs.jced.7b01037; lactic: 10.1021/acs.jced.7b00102) and must each be
   read and cited, not imported.
5. **Gluconic, ascorbic, gallic, propionic, butyric, benzoic acids**: pK, dH and
   species data; no work in hand beyond the CRC second reading.
