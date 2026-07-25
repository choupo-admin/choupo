# Component cleanup -- sugars + polyols (phase 3, 2026-07-24)

Private staging tier (`data/tmp/`, gitignored). Envelope + ARITY rule:
[`../RECORD_SPEC.md`](../RECORD_SPEC.md). Curator: `agent:components-sugars`.

**Scope (exclusive):** `fructose, galactose, xylose, arabinose, lactose,
trehalose, sorbitol, mannitol, xylitol, erythritol`. No other component, no
`_sources/`, no `data/standards/`, no C++, no tutorial was touched. Nothing was
promoted, nothing was committed.

**What phase 3 is.** Phase 2 *emitted* the system properties into arity-correct
homes but left the component files untouched, so every moved value existed
**twice**. Phase 3 makes the component agree: the component keeps only arity-1
intrinsic data, and each departed value is replaced by **one line of pointer
comment** naming the new home and its `recordId`. A pointer is a cross-reference,
never a second copy of a number.

**The second rule applied throughout:** *zero usable science may live only in a
prose comment*. Several real, primary-cited numbers were sitting in `//` comment
blocks (polyol heat capacities, fusion enthalpies, erythritol's two Cp points).
They are now structured blocks carrying unit, phase, `origin` and citation.
Where a number genuinely does not exist, the absence itself is a **structured
flag** (`entropyStatus{}`, `solidHeatCapacityStatus{}`, `cosmoStatus{}`,
`pcSaftStatus{}`) rather than a sentence.

---

## Conventions used in the cleaned files

| block | purpose |
|---|---|
| `identity {}` | CID, InChIKey **with its completeness status**, stereochemical form, source |
| `standardThermochemistry {}` | the engine block; phase stated on every value |
| `entropyStatus {}` / `solidHeatCapacityStatus {}` | a MISSING value, structured: `value none`, `pendingPrimary`, consequence, `status flagged` |
| `pureComponentProperties {}` | arity-1 measurables: solid density, pure-solid molar volume (derived, equation shown), melting point |
| `identityDescriptors {}` | optical rotation -- an identity/purity marker, conditions declared in full, arity caveat stated |
| `supersededHistory {}` | a rejected number, labelled `status superseded`; never a datum |
| `hydrateAmbiguity {}` | which solid the file actually describes vs which solid water sees |
| `cosmoStatus {}` / `pcSaftStatus {}` | no deployable set: reason, evidence pointer, `status` |

Statuses follow `RECORD_SPEC.md`: `candidate | verified | flagged | rightsPending`
(+ `superseded` inside `supersededHistory{}`, which is history, not a record).

---

## Per file

### fructose
* **Removed** (pointer only): `D_aq` + Stokes radius -> `diffusion-fructose-water`;
  pKa 12.03 -> `fructose-pKa1`; aqueous solubility -> `fructose-water`;
  `Vliq` 1.106e-4 m3/mol -> `volume-fructose-water` (see *New home* below).
* **Kept, structured:** dHf(cr) -1265.6 kJ/mol (Clarke & Stegeman 1939, solid);
  solid density 1.60 g/cm3; **new derived** pure-solid molar volume 112.60 cm3/mol;
  melting point 376.15-378.15 K (decomposition); specific rotation -92 deg with
  solvent/concentration/T/wavelength declared; UNIFAC groups.
* **Structured flags:** S(298) and solid Cp absent (2012 J. Chem. Thermodyn.
  primary paywalled); COSMO -- **identity unresolved**, no block added;
  PC-SAFT `rightsPending` (Held & Sadowski 2013 Table 2).
* **Fixed:** the file no longer implies `Vliq` is a pure-component volume.

### galactose
* **Removed:** `D_aq` -> `diffusion-galactose-water` (an **estimate** anchored on
  glucose, now labelled as such at the pointer); pKa ~12.35 -> `galactose-pKa1`;
  solubility -> `galactose-water`; `Vliq` 1.102e-4 -> `volume-galactose-water`.
* **Kept, structured:** dHf(cr) -1286.3 (Clarke & Stegeman 1939); S(298) 205.4
  (Jack & Stegeman 1941); solid Cp 216.3 J/(mol K) at 300 K (Kawaizumi 1981) --
  the one file in the set whose thermochemistry is complete; density 1.5 g/cm3;
  derived solid molar volume 120.1 cm3/mol; mp 440.15-443.15 K (decomp);
  rotation +80.2 deg.
* **Structured flags:** COSMO -- no LVPP record staged; PC-SAFT `rightsPending`.

### xylose
* **Removed:** `D_aq` 7.50e-10 + radius -> `diffusion-xylose-water`; pKa 12.14
  (**at 18 C**, flagged at the pointer) -> `xylose-pKa1`; solubility
  ("1 g in 0.8 mL water") -> `xylose-water`; `Vliq` 0.954e-4 -> `volume-xylose-water`.
* **Kept, structured:** dHf(cr) -1054.5, S(298) **175.3**, solid Cp 178.1 -- all
  three from the single primary Ribeiro da Silva et al., *J. Chem. Thermodyn.* 58
  (2013) 20-28; density 1.525; derived solid molar volume 98.45 cm3/mol;
  mp 426.15-427.15 K; rotation +18.6 deg.
* **DEFECT FIXED:** the stale S(298) = 143.5 J/(mol K) (Miller 1935) previously
  appeared as a bare parenthetical beside the datum. It now exists **once**, inside
  `supersededHistory{}` with `status superseded` and the reason. The only entropy
  in the thermochemistry block is the curated 175.3 with its citation.
* **Structured flags:** COSMO -- **identity unresolved** (LVPP `XYLOSE.cosmo` is
  the open-chain tautomer; the pyranose is a different file, `DXYLOSE.cosmo`);
  PC-SAFT `rightsPending`.

### arabinose
* **Removed:** `D_aq` -> `diffusion-arabinose-water` (estimate anchored on xylose);
  pKa ~12.34 -> `arabinose-pKa1`; solubility -> `arabinose-water`; `Vliq` 0.934e-4
  -> `volume-arabinose-water`.
* **DEFECT FIXED (identity) -- with a correction to the diagnosis.** The full
  stereo-resolved key of L-arabinose, PubChem CID 439195, is
  **`SRBFZHDQGSBBOR-HWQSCIPKSA-N`**, and it is now recorded as
  `inchiKeyStatus full`. **But the previous diagnosis was half wrong:** the ledgers
  said the stored `SRBFZHDQGSBBOR` was "copied from xylose and WRONG". Block 1 of
  an InChIKey hashes *constitution only*, so **all aldopentoses of this
  connectivity -- arabinose, xylose, ribose, lyxose -- legitimately share
  `SRBFZHDQGSBBOR`**. The block was not wrong; it was **truncated**, i.e. incapable
  of distinguishing arabinose from xylose, which is precisely why the copy went
  unnoticed. Verified and stated in-file: the correct key still *begins* with the
  same 14 characters as xylose's; only block 2 (`HWQSCIPKSA`) separates them.
  Any join must use the full 27-character key.
* **Kept, structured:** dHf(cr) -1058 kJ/mol as **provisional** with a
  `thermochemistryStatus{}` recording that the citation is a series title, not a
  resolved reference, and that the enantiomer/polymorph is unstated; density
  1.585; derived solid molar volume 94.72 cm3/mol; mp 431.15-438.15 K (a 7 K span,
  noted); rotation +104.5 deg (the practical L-enantiomer check).
* **Structured flags:** S(298) and Cp absent (analogy to xylose stated but **not**
  shipped as a value); COSMO none, with an explicit caution that a key-based match
  must use the full key or it will silently return xylose; PC-SAFT `flagged` --
  arabinose is **not** among the 13 sugars of Held & Sadowski 2013, and the
  "use xylose as surrogate" idea is recorded as a modelling choice that must never
  be filed as arabinose's own set.

### lactose
* **Removed:** `D_aq` 5.66e-10 + radius -> `diffusion-lactose-water`; pKa ~11.98
  -> `lactose-pKa1`; solubility ~195 g/L -> `lactose-water`; `Vliq` 2.091e-4
  -> `volume-lactose-water`.
* **Kept, structured:** solid Cp 417.6 J/(mol K) at 300 K (Kawaizumi 1981);
  density 1.525; derived solid molar volume 224.46 cm3/mol (anhydrous basis);
  mp 495.15 K (anhydrous, decomp); rotation +55.4 deg.
* **DEFECT FIXED (hydrate ambiguity):** a dedicated `hydrateAmbiguity{}` block now
  states that the declared solid is **anhydrous** lactose (CAS 63-42-3, mp ~222 C)
  while the phase in equilibrium with water at 25 C is **alpha-lactose
  monohydrate** (mp ~202 C); that the solubility record therefore most likely
  belongs to the monohydrate; and that a dissolution enthalpy built from the two
  would be wrong by the hydration enthalpy of one water. The MW comment states the
  anhydrous vs monohydrate molar masses (342.297 / 360.31 g/mol). The Cp block
  carries the same caveat (the source does not say which solid it measured).
* **Structured flags:** dHf and S(298) absent -- `value none` with the primary
  (Clarke & Stegeman 1939) and the order of magnitude quoted *outside* the datum
  block; COSMO -> `evidence/lvpp-lactose` (cavity descriptors only, anomer
  unlabelled, no sigma profile); PC-SAFT `rightsPending`.

### trehalose
* **Removed:** `D_aq` -> `diffusion-trehalose-water` (estimate anchored on
  sucrose); pKa ~12.5 -> `trehalose-pKa1`; solubility ~690 g/L ->
  `trehalose-water`; `Vliq` 2.076e-4 -> `volume-trehalose-water`.
* **Kept, structured:** dHf(cr, anhydrous) -2241.0 kJ/mol, `origin derived`, with
  the whole Hess derivation as a structured `formationEnthalpyDerivation{}` block
  (massic energy -16434.05 J/g from Lopes Jesus et al. 2005, MW, dcH, the two
  CODATA formation enthalpies, the result, and the instruction to reconcile
  against the paper's own Washburn-corrected number). Arithmetic re-checked:
  -16434.05 J/g x 0.342297 kg/mol = -5625.3 kJ/mol; 12(-393.51) + 11(-285.83) +
  5625.3 = **-2240.9 kJ/mol**. Also kept: density 1.58, derived solid molar volume
  216.64 cm3/mol, mp 476.15 K, rotation +178 deg.
* **DEFECT FIXED (hydrate ambiguity):** `hydrateAmbiguity{}` states that the
  declared solid is the **anhydrous polymorph beta** (mp ~203 C) while the ambient
  aqueous solid is the **dihydrate** (mp ~97 C), so the solubility record and the
  formation enthalpy describe **different solids**; MW comment gives both molar
  masses (342.297 / 378.33 g/mol).
* **Structured flags:** S(298) and Cp absent; density citation unresolved
  ("crystallographic", no structure report pinned) -> `status flagged`; COSMO none;
  PC-SAFT `rightsPending`.

### sorbitol
* **Removed:** `D_aq` estimate + equivalent-sphere radius ->
  `diffusion-sorbitol-water`; aqueous solubility -> `sorbitol-water`;
  XLogP3 -3.1 -> `sorbitol-octanol-water`.
* **DEFECT FIXED (solubility):** **no solubility number of any kind remains in this
  file** -- not in a field, not in a comment, not in the header. The header states
  only that the previous statement was internally inconsistent by a factor ~3.4 and
  points at the arity-2 record where both figures and the contradiction live.
* **Kept, structured:** dHf(cr) -1353.7 (Gerasimov, Blokh & Gubareva 1985);
  **Cp,solid 241.43 J/(mol K) at 298.15 K lifted out of a comment** into a real
  `solidHeatCapacity{}` block (Lian, Chen, Suurkuusk & Wadsoe 1982); density 1.489;
  solid molar volume 122.34 cm3/mol (derived, equation shown); mp 372.15-374.15 K
  with a polymorphism note; full InChIKey retained.
* **Structured flags:** S(298) absent; Cp(T) *curve* absent (only one point);
  COSMO none (no LVPP sorbitol record staged) + a conformer caution; PC-SAFT
  `rightsPending` (Carneiro et al. 2013) with the transportability requirements
  listed.

### mannitol
* **Removed:** `D_aq` estimate + radius -> `diffusion-mannitol-water`; solubility
  -> `mannitol-water`; XLogP3 -> `mannitol-octanol-water` (pointer notes the
  descriptor is *identical* to sorbitol's, which is the argument against using it
  as data).
* **Kept, structured:** dHf(cr) -1337.5 with the JACS 68 (1946) 2524 cross-check
  quoted; S(298) 238.5 (Parks, Kelley & Huffman 1929); **Cp,solid 239.00 lifted out
  of a comment** into `solidHeatCapacity{}` with the two older independent points
  kept as unmerged cross-checks; **fusion lifted out of a comment** into a
  structured `fusion{}` block (54.69 kJ/mol at 437.25 K, dSfus 125.08 J/(mol K),
  DSC, doi 10.1021/je900285w); density 1.514; solid molar volume 120.32 cm3/mol;
  mp 438.15-442.15 K cross-checked against the DSC Tfus; full InChIKey.
* **New flag raised:** `thermochemistryStatus{}` -- the dHf primary of record is an
  unpublished **PhD thesis** (McClaine 1947) while a peer-reviewed value agreeing
  to 0.3 kJ/mol exists (Parks et al., JACS 68 (1946) 2524). Recommendation: cite
  the JACS paper as primary on promotion.
* **Structured flags:** fusion polymorph unstated; COSMO -> `evidence/lvpp-mannitol`
  (cavity descriptors only); PC-SAFT `rightsPending`.

### xylitol
* **Removed:** `D_aq` estimate + radius -> `diffusion-xylitol-water`; solubility
  -> `xylitol-water`; XLogP3 -> `xylitol-octanol-water`.
* **DEFECT FIXED (phase of the formation enthalpy):** the datum is the
  **CRYSTALLINE** -1219.3 +/- 0.3 kJ/mol (Tong et al., *Thermochim. Acta* 457
  (2007) 20-26, O2 bomb). The older **LIQUID** -1118.6 kJ/mol (Oberemok-Yakubova &
  Balandin 1963) now appears **only** inside `supersededHistory{}`, labelled
  `phase liquid`, `status superseded`, with the explanation that the ~100 kJ/mol
  gap *is* the phase difference. It cannot be mistaken for the datum.
* **Kept, structured:** density 1.52; solid molar volume 100.10 cm3/mol;
  mp 365.15-369.15 K with the metastable-form note; **fusion lifted out of a
  comment** (37.4 kJ/mol at 365.7 K, Barone & Della Gatta 1990 / Domalski &
  Hearing 1996) with Tong's 33.26 kJ/mol at 369 K kept as an **unmerged** 11 %
  cross-check; full InChIKey.
* **Structured flags:** S(298) absent (derived in Tong 2007, paywalled table);
  Cp absent although the **curve exists and was measured 80-390 K** -- recorded as
  `measuredRange ( 80 390 ) K` with `value none`; COSMO none; PC-SAFT
  `rightsPending`.

### erythritol
* **Removed:** `D_aq` estimate -> `diffusion-erythritol-water`; **measured
  hydrodynamic radius 0.34 nm** -> `hydrodynamicRadius-erythritol-water` (its own
  arity-2 record; the pointer states it was measured on erythritol-water
  *droplets*, not bulk infinite dilution); solubility -> `erythritol-water`;
  XLogP3 -> `erythritol-octanol-water`.
* **Kept, structured:** dHf(cr) -885.21 (Parks & Manchester 1952); S(298) 166.5
  (Parks, Kelley & Huffman 1929); **the two measured Cp points lifted out of a
  comment** into `solidHeatCapacityData{}` (161.9 at 291.7 K, Parks & Anderson
  1926; 170.7 at 303 K, Spaght et al. 1932), each with its own citation;
  density 1.45; solid molar volume 84.22 cm3/mol, with a note that the
  equivalent-sphere radius built from it (0.322 nm) is an *input* to the diffusion
  estimate and lives there; mp 391.15-394.15 K; full InChIKey.
* **Deliberate non-value:** no engine `solidHeatCapacity{}` is shipped, because
  Cp(298.15) would be an interpolation nobody has made. The implied linear
  interpolation (~166.8 J/(mol K)) is *written down and explicitly not shipped*.
* **New flag raised:** `thermochemistryStatus{}` -- the cited Parks & Manchester
  1952 paper is about combustion values for **liquid** polyhydroxy alcohols, yet
  the value is carried as the **crystalline** datum. If the paper's number is the
  liquid, the solid datum needs the enthalpy of fusion subtracted -- the same trap
  that produced the xylitol defect. Must be verified before promotion.
* **Structured flags:** COSMO -> `evidence/lvpp-erythritol` (cavity descriptors
  only); PC-SAFT `flagged` -- no source pinned (the ledger's "confirm erythritol is
  fitted" was never confirmed).

---

## New home created: `parameters/volume/` (6 records)

The six sugars' `Vliq` was documented in-file as the **apparent (partial) molar
volume in aqueous solution** -- a solute+solvent quantity, arity 2, wrongly stored
as if it were a pure-component volume. Phase 2 created no home for it. Rather than
delete six primary-cited numbers, phase 3 emitted
`parameters/volume/<solute>-water.candidate.dat` (+ `_LEDGER.md`) and left only a
pointer in each component. Values moved verbatim: fructose 110.6, galactose 110.2,
xylose 95.4, arabinose 93.4, lactose 209.1, trehalose 207.6 cm3/mol.

Each component instead gained the **pure-solid** molar volume `MW/rho`, derived
with the equation shown, and each derivation states explicitly that it is *not*
the partial molar volume.

---

## Still contradictory or unresolved (nothing here was "fixed by decision")

1. **Truncated InChIKeys on all six sugars.** `fructose`, `galactose`, `xylose`,
   `lactose`, `trehalose` (and, before this pass, `arabinose`) carry only the
   14-character block 1. For stereoisomer families that block is **shared by
   construction** -- `WQZGKKKJIJFFOK` is glucose *and* galactose *and* mannose;
   `SRBFZHDQGSBBOR` is every aldopentose; `GUBGYTABKSRVRQ` covers lactose/maltose/
   cellobiose. **These keys cannot identify the compounds they are filed under**,
   and any key-based join (LVPP, CHAOS, PubChem) on them is unsafe. The four
   polyols carry full 27-character keys -- and sorbitol/mannitol sharing
   `FBPFZTCFMRRESA` is the standing proof of the point. *Fetch the full keys.*
2. **arabinose dHf -1058 kJ/mol** rests on a combustion-series *title*, with no
   author/journal/volume/pages and no statement of which enantiomer was burnt,
   while the component declares the L-form. Provisional only.
3. **erythritol dHf phase attribution** (see above) -- possible liquid/solid
   confusion in the citation, unverified.
4. **mannitol dHf primary is a PhD thesis**, with a peer-reviewed value available.
5. **trehalose dHf** is a Choupo-derived Hess number (-2240.9 kJ/mol) that has
   never been reconciled with the source paper's own Washburn-corrected value.
6. **trehalose solid density 1.58 g/cm3** has no resolvable citation
   ("crystallographic"); the derived molar volume inherits that weakness.
7. **lactose / trehalose hydrate mismatch** is *stated*, not resolved: the
   thermochemistry describes the anhydrous crystal, the solubility record almost
   certainly describes the hydrate. Any dissolution enthalpy across the two is
   wrong until one side is re-based.
8. **xylitol fusion enthalpy spread** 37.4 vs 33.26 kJ/mol (11 %) with neither
   source stating the crystal form; xylitol has a known metastable form melting
   near 61 C.
9. **galactose, arabinose, trehalose D_aq are analogue ESTIMATES**, not the
   measurements their old headers implied; the pointers now say so, but the
   underlying digits are still un-transcribed.
10. **The retained non-thermochemical numbers are almost all compilation-sourced.**
    After cleanup, every solid density, melting point and optical rotation in this
    family traces to CRC / Merck / ChemicalBook / HMDB -- hence `rightsPending` or
    `flagged`, never `candidate`. The thermochemistry is the only part of these
    files resting on primary calorimetry.
11. **No COSMO or PC-SAFT set is deployable for any of the ten.** COSMO: LVPP's QM
    protocol (NWChem B3LYP/def2-SVPD, SES cavity) is incompatible with the
    VT-2005 surfaces the `cosmoSAC2002` constants were regressed against (Mullins
    et al., IECR 45 (2006) 4389) -- measured on ethylene, **+6.1 % cavity area,
    +10.3 % cavity volume** -- and no LVPP record carries a sigma profile at all.
    Three of the ten have evidence records (erythritol, lactose, mannitol); two are
    **identity-unverified** (fructose: furanose vs pyranose vs open-chain; xylose:
    open-chain vs pyranose); five have no record. PC-SAFT: 8 `rightsPending`
    (paywalled tables pinned, digits not in hand), 2 `flagged` (arabinose and
    erythritol have no published set at all).
