# `components/` phase-3 cleanup -- PHARMA set (13 files, 2026-07-24)

Scope: `caffeine, carbamazepine, ibuprofen, diclofenac, naproxen, ketoprofen,
sulfamethoxazole, trimethoprim, metformin, gemfibrozil, primidone, atenolol,
iopromide`.  No other component, no `_sources/`, no `data/standards/`, no
engine code, no tutorial, no promotion, no commit.

**What phase 3 does.** Phase 2 moved every system / state-dependent value out of
these component files into arity-correct homes.  Phase 3 makes the *component*
agree: it holds **arity-1 intrinsic data only**, every retained numeric carries
UNIT + PHASE/state + `origin` + citation, and each migrated family is replaced
by a **one-line pointer comment** naming home + `recordId`.  Nothing is restated
in two places; nothing usable is left in prose.

## Rules applied (uniform across the 13)

1. **Identity kept** (`name`, `formula`, `CAS`, InChIKey skeleton, `MW`,
   `role nonvolatile`) with an `identityProvenance {}` block.
2. **Melting point kept where one was staged**, converted to K, with the verbatim
   original statement, the phase transition (`solid -> liquid`), the assumed
   ambient pressure marked as assumed, `polymorph unspecified` when the source is
   silent, and `status flagged` (all sources are public *compilations*; no
   measuring primary is pinned for any of them).
3. **Crystal density: none exists** in any of the 13.  Therefore the
   pure-component molar volume `V_m = MW/rho_c` is **not derivable** and none is
   declared.  Each file says so in a `solidStateStatus {}` block instead of
   leaving a silent gap.
4. **McGowan V_x / Le Bas Vb are computed descriptors, not V_m.**  Retention
   rule, stated in every header: keep the number in the component **only if no
   phase-2 record already carries it**; when a diffusion record restates it as
   its `derivation {}` input, the component **drops** it and points there.  One
   number, one home.
   * kept (with `origin estimated` + Abraham & McGowan, *Chromatographia* 23
     (1987) 243): caffeine, carbamazepine, ibuprofen, ketoprofen -- their D
     records are measured or radius-derived, so nothing else holds the V_x.
   * dropped (already the derivation input elsewhere): diclofenac, naproxen
     (McGowan V_x) and all seven Le Bas Vb (sulfamethoxazole, trimethoprim,
     metformin, gemfibrozil, primidone, atenolol, iopromide).
5. **`standardThermochemistry {}` is absent in all 13** and is declared absent
   with a reason (`thermochemistryStatus {}`), noting that a block would have to
   declare `phase solid` -- a nonvolatile solid must never route through the
   ideal-gas rung.
6. **COSMO / PC-SAFT**: named sets only, none deployable here; each file carries
   a `cosmoStatus {}` / `pcSaftStatus {}` block with the reason (below).

## Per-file

### caffeine
* **Removed:** pKa (both steps) -> `caffeine-pKa1`, `caffeine-pKa2`;
  `chargeAtPH7` -> deleted (derived); logKow -> `caffeine-octanol-water`;
  water solubility -> `caffeine-water`; COSMO cavity -> `lvpp-caffeine`.
* **Kept:** identity; McGowan V_x 136.3 cm3/mol (`origin estimated`, Abraham &
  McGowan 1987) -- no other record holds it, caffeine has **no** diffusion record.
* **Fixed:** the component had recorded **only** the weak-acid pKa (N-H) and was
  therefore **missing an entire dissociation step** -- the conjugate-acid (cation)
  equilibrium (Svorc 2013).  Both steps now live in the speciation home; the
  component asserts **neither**, only the two pointers.
* **Unresolved:** no melting point, no crystal density, no thermochemistry; no
  D_aq anywhere (only an order-of-magnitude *range* was ever held, and phase 2
  correctly refused to emit a range midpoint -- Niesner & Heintz, *JCED* 45
  (2000) 1121 remains the un-transcribed primary).

### carbamazepine
* **Removed:** pKa -> `carbamazepine-pKa1`; `chargeAtPH7` -> deleted;
  logKow -> `carbamazepine-octanol-water`; solubility -> `carbamazepine-water`;
  D_aq -> `diffusion-carbamazepine-water`; measured Stokes radius ->
  `hydrodynamicRadius-carbamazepine-water`; COSMO cavity -> `lvpp-carbamazepine`.
* **Kept:** identity; McGowan V_x 181.1 cm3/mol (the diffusion record derives D
  from the measured radius, so nothing else holds the V_x).
* **Fixed:** the file quoted **one** aqueous solubility as if settled while a
  second open source disagrees by ~8x (a polymorph/hydrate difference, neither
  value stating its solid).  The component now asserts **no** solubility; the
  disagreement is carried and explained inside `carbamazepine-water`.
* **Unresolved:** no melting point / density / thermochemistry -- and for this
  compound any of them would have to be **per polymorph** (forms I-IV + dihydrate).

### ibuprofen
* **Removed:** pKa -> `ibuprofen-pKa1`; `chargeAtPH7` -> deleted; logKow ->
  `ibuprofen-octanol-water`; solubility -> `ibuprofen-water`; **measured** D_aq
  (Mendes et al., *J. Chem. Thermodyn.* 178 (2023) 106955) and the Stokes radius
  derived from it -> `diffusion-ibuprofen-water`; COSMO cavity -> `lvpp-ibuprofen`.
* **Kept:** identity; McGowan V_x 177.7 cm3/mol.
* **Fixed:** PC-SAFT is now an explicit `rightsPending` **pointer** (Ruether &
  Sadowski; Ferreira et al., *J. Supercrit. Fluids* 2022) -- paywalled, digits
  never transcribed.
* **Unresolved:** no melting point / density / thermochemistry.  Added an identity
  warning: CAS 15687-27-1 is the **racemate**, so future solid-state data must
  state the stereochemical form.

### ketoprofen
* **Removed:** as ibuprofen (`ketoprofen-pKa1`, `ketoprofen-octanol-water`,
  `ketoprofen-water`, **measured** `diffusion-ketoprofen-water`, `lvpp-ketoprofen`).
* **Kept:** identity; McGowan V_x 197.8 cm3/mol.
* **Fixed:** PC-SAFT now a `rightsPending` pointer (Ferreira et al. 2022) only.
* **Unresolved:** no melting point / density / thermochemistry; racemate caveat.

### diclofenac
* **Removed:** pKa -> `diclofenac-pKa1`; `chargeAtPH7` -> deleted; logKow ->
  `diclofenac-octanol-water`; solubility -> `diclofenac-water`; estimated D_aq
  **and its McGowan V_x input** -> `diffusion-diclofenac-water`; COSMO cavity ->
  `lvpp-diclofenac`.
* **Kept:** identity only (V_x dropped per the retention rule).
* **Fixed:** the method mismatch is stated in the file: the estimated D applies
  **Wilke-Chang** to a **McGowan** V_x, while Wilke-Chang is defined on a **Le
  Bas** volume.  The component asserts no D at all.  Added a free-acid vs
  sodium-salt identity warning.
* **Unresolved:** no melting point / density / thermochemistry; the mismatched D
  estimate is the only transport number that exists for this solute.

### naproxen
* **Removed / fixed:** identical to diclofenac (`naproxen-pKa1`,
  `naproxen-octanol-water`, `naproxen-water`, `diffusion-naproxen-water`
  carrying the V_x, `lvpp-naproxen`); same Wilke-Chang/McGowan mismatch noted.
* **Kept:** identity only.
* **Unresolved:** no melting point / density / thermochemistry.  Added the
  identity note that CAS 22204-53-1 is the **(S)-enantiomer**, not the racemate.

### sulfamethoxazole
* **Removed:** pKa1, pKa2 -> `sulfamethoxazole-pKa1/-pKa2`; `chargeAtPH7` ->
  deleted; **logKow (neutral)** -> `sulfamethoxazole-octanol-water`;
  **logD at pH 8 (anion)** -> `sulfamethoxazole-octanol-water-pH8`; solubility ->
  `sulfamethoxazole-water`; D_aq + Le Bas Vb + Stokes radius ->
  `diffusion-sulfamethoxazole-water`.
* **Kept:** identity; **melting point 440.15 K** (= 167 C, HSDB, phase-declared,
  flagged); **molecular dimensions** 0.526 x 0.587 x 1.031 nm (Bizi & El Bachra,
  *Molecules* 26 (2021) 7318, CC-BY) as a properly enveloped `origin estimated`
  molecular-geometry descriptor -- **no phase-2 record carries these**, and they
  were the last piece of usable science still living in a comment.
* **Fixed:** logKow and logD(pH 8) were listed side by side under one
  "hydrophobicity" heading as if two readings of one quantity.  They are
  different quantities on different species; two records, component keeps neither.
* **Unresolved:** no crystal density / thermochemistry; the geometry primary does
  not restate its geometry-optimisation protocol.

### trimethoprim
* **Removed:** pKa -> `trimethoprim-pKa1`; `chargeAtPH7` -> deleted (it was a
  **fractional** charge quoted at pH ~ pKa -- the clearest case of a speciation
  *result* stored as a datum); logKow -> `trimethoprim-octanol-water`;
  solubility -> `trimethoprim-water`; D_aq + Le Bas Vb + radius ->
  `diffusion-trimethoprim-water`.
* **Kept:** identity; **melting range 472.15-476.15 K** (= 199-203 C), kept as a
  RANGE with a note that a 4 K span is a purity/decomposition indicator, not an
  uncertainty, and must not be collapsed to a midpoint.
* **Unresolved:** no crystal density / thermochemistry; no COSMO set.

### metformin
* **Removed:** both pKa steps -> `metformin-pKa1` (~2.8) and `metformin-pKa2`
  (12.4); `chargeAtPH7` -> deleted; logKow -> `metformin-octanol-water`;
  D_aq + Le Bas Vb + radius -> `diffusion-metformin-water`.  Aqueous solubility
  produced **no record** (a qualitative lower bound with no temperature).
* **Kept:** identity only.
* **Fixed:** the source labelled 12.4 "the pKa" and ~2.8 "the second".  By order
  of deprotonation ~2.8 **is step 1**; the speciation home numbers by ascending
  pKa and the component now keeps **no pKa at all**.
* **NEW CONTRADICTION FOUND -- melting point withheld:** the staged
  223-226 C is the figure commonly tabulated for metformin **hydrochloride**
  (CAS 1115-70-4), while this record is the **free base** (CAS 657-24-9).
  Declaring it would attach a salt's melting point to a different substance, so
  it is **not declared**; the number is quoted only inside
  `meltingPointStatus { withheldStatement }` so the withholding is auditable.
  Needs a primary that names the form.
* **Unresolved:** the withheld melting point; no density / thermochemistry; plain
  PC-SAFT is the wrong model (permanent cation -> ePC-SAFT with a counter-ion);
  a neutral-molecule COSMO profile would misrepresent the species at process pH.

### gemfibrozil
* **Removed:** pKa -> `gemfibrozil-pKa1`; `chargeAtPH7` -> deleted; logKow ->
  `gemfibrozil-octanol-water`; solubility -> `gemfibrozil-water`; D_aq + Le Bas
  Vb + radius -> `diffusion-gemfibrozil-water`.
* **Kept:** identity; **melting range 334.15-336.15 K** (= 61-63 C, HMDB), with a
  `crossCheck {}` quoting DrugBank 58-61 C and HSDB 62 C -- quoted, never merged.
* **Unresolved:** the three compilations span ~5 K on a low-melting solid
  (probably purity); no crystal density / thermochemistry; no COSMO / PC-SAFT set.

### primidone
* **Removed:** pKa -> `primidone-pKa1`; `chargeAtPH7` -> deleted; logKow ->
  `primidone-octanol-water`; solubility -> `primidone-water`; D_aq + Le Bas Vb +
  radius -> `diffusion-primidone-water`.
* **Kept:** identity; **melting point 554.65 K** (= 281.5 C, HSDB + HMDB).
* **Unresolved:** at 281.5 C this ureide may melt **with decomposition**; the
  sources do not say, so the `solid -> liquid` label is recorded as the source's
  claim, not a verified clean fusion.  No density / thermochemistry.

### atenolol
* **Removed:** pKa -> `atenolol-pKa1`; `chargeAtPH7` -> deleted; logKow ->
  `atenolol-octanol-water`; solubility -> `atenolol-water`; D_aq + Le Bas Vb +
  radius -> `diffusion-atenolol-water`; COSMO cavity -> `lvpp-atenolol`.
* **Kept:** identity; **melting range 419.15-421.15 K** (= 146-148 C, HSDB) with
  a `crossCheck {}` block.
* **NEW CONTRADICTION FOUND:** DrugBank gives **158-160 C** (431.15-433.15 K) --
  **10-14 K above** the HSDB range that HMDB (147 C) supports.  Candidate causes:
  racemate vs (S)-enantiomer, or a polymorph; neither source states its form.
  Recorded in the `crossCheck` block, value left `flagged`, not usable until a
  form-naming primary is found.
* **Unresolved:** the melting-point contradiction; no density / thermochemistry.

### iopromide
* **Removed:** logKow -> `iopromide-octanol-water`; `chargeAtPH7` -> deleted;
  D_aq + Le Bas Vb + radius -> `diffusion-iopromide-water`.  No pKa record (the
  staged statement was an **absence** of ionisation in pH 2-12, and an absence is
  not a datum); no solubility record (qualitative, no temperature).
* **Kept:** identity only.  **This file now holds no measured property value at
  all** -- stated explicitly in its header rather than left implicit.
* **Fixed:** its logKow is an **HMDB-computed** value that sat under a
  "Hydrophobicity" heading beside experimental values on neighbouring components
  -- computed data wearing a measured face.  It is now a single partition record
  whose `origin` reads `estimated`; the component asserts none.
* **Unresolved:** melting point does not exist as a clean datum (decomposes;
  amorphous solid), so density and V_m may not be definable for the relevant form.

## COSMO -- none deployable in this set (13/13 flagged)

* 7 of the 13 have LVPP evidence (`caffeine, carbamazepine, diclofenac,
  ibuprofen, ketoprofen, naproxen, atenolol`); each component points at
  `evidence/lvpp-<name>/metadata.dat` and declares **`deployable no`**.
  Reason recorded verbatim in every file: **LVPP's QM protocol is incompatible
  with Choupo's VT-2005 profiles used by the `cosmoSAC2002` variant -- on the
  ethylene cross-check the LVPP cavity is +6.1 % in area and +10.3 % in volume**.
  Mixing a profile with another variant's constants is a LOUD error by contract.
* The other 6 (`sulfamethoxazole, trimethoprim, metformin, gemfibrozil,
  primidone, iopromide`) have **no** profile at all: not in the VT-2005 77-set,
  no LVPP match; the VT pharmaceutical set (Mullins, *IECR* 46 (2007) ie0711022)
  is paywalled and a CHAOS (CC-BY) join is pending.
* Extra physical caveat recorded for `metformin` and `atenolol`: the LVPP/VT
  geometries are **neutral gas-phase** molecules, while both are protonated at
  process pH.

## PC-SAFT -- none deployed (13/13)

* `ibuprofen`, `ketoprofen`: **`rightsPending`** -- a specific paywalled source is
  pinned (Ruether & Sadowski; Ferreira et al., *J. Supercrit. Fluids* 2022);
  **pointer only, digits never transcribed** (EU sui generis database right).
* the other 11: `flagged`, no published set identified (`carbamazepine` has a
  genre-level lead only, which is not a citation).  `metformin` would need
  **ePC-SAFT**, not PC-SAFT.

## Cross-cutting findings (new)

1. **All 13 carry only the 14-character InChIKey skeleton**, not the full 27-char
   key.  Renamed the field to `InChIKeySkeleton` in every file so it can never be
   mistaken for a complete key (a skeleton cannot distinguish stereoisomers or
   protonation states -- which matters for at least ibuprofen, ketoprofen,
   naproxen and atenolol here).
2. **Zero crystal densities across the whole set** -- so no pure-component molar
   volume is derivable for any of the 13.  Every `V_x` / `Vb` number in this
   corpus is a computed descriptor; none of them is `V_m`, and the previous files
   invited exactly that confusion by printing them under `molarVolume`.
3. **Every melting point in the set is compilation-sourced** (HSDB / DrugBank /
   HMDB); not one has a measuring primary pinned.  All are `flagged`.
4. **Two form-mismatch risks surfaced** that the staging had not separated:
   metformin free base vs hydrochloride (melting point withheld), atenolol
   racemate vs enantiomer / polymorph (10-14 K contradiction).
5. **Duplication risk noted, not created:** for the 9 components whose descriptor
   was dropped, the number now lives only inside another record's `derivation {}`
   block.  That is one home, as required -- but it means the descriptor is stored
   as an *input to an estimate*, so if that estimate is ever replaced by a
   measurement the descriptor disappears with it.  Flagged for whoever owns the
   `parameters/` tier; not fixed here (out of scope).

*Nothing in this phase was promoted, and nothing was committed.  Private
`data/tmp/` tier only.*
