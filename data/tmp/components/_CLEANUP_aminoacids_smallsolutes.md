# `components/` cleanup note -- amino acids + small solutes (phase 3, 2026-07-24)

PRIVATE tier (`data/tmp/`, gitignored). Scope: **16 files**, exclusive ownership --
`glycine, alanine, serine, valine, glutamicAcid, lysine, arginine, phenylalanine,
taurine, urea, acrylamide, NDMA, glyphosate, atrazine, simazine, diuron`.
No other component, no `_sources/`, no `data/standards/`, no code, no tutorials,
no promotion, no commits.

**What phase 3 did.** Phase 2 *emitted* the arity-correct records but left the
component files untouched, so every migrated value existed **twice** (once as a
record, once as a comment line). This pass makes the component agree with the
ARITY rule of [`../RECORD_SPEC.md`](../RECORD_SPEC.md):

* every arity >= 2 / state-dependent value is **removed** from the component and
  replaced by a **pointer** in a structured `references {}` block naming the new
  file and its `recordId` -- a cross-reference, never a second copy;
* every value that **stays** is arity-1 intrinsic and now declares
  **unit + phase/state + `origin` + primary citation + `status`** inside a
  `provenance {}` sub-block. No retained number lives in a bare comment;
* every **absence** is structural (`available none; status flagged; blockedBy ...;
  action ...;`) instead of prose;
* COSMO and PC-SAFT are **named sets** with `variant`, provenance and `status` --
  none is deployable, all are `flagged` / `rightsPending`, and **no cavity area,
  volume or sigma-profile number was copied** into a component.

The COSMO refusal reason, recorded identically in all 16 files: the LVPP QM
protocol (`NWChem B3LYP def2-SVPD`, release v25 -- **not** the HF/TZVP the old
component comments claimed) is incompatible with Choupo's VT-2005
`cosmoSAC2002` constants; the ethylene cross-check, the one compound in both
databases, gives **+6.1 % cavity area, +10.3 % cavity volume**.

---

## Per file

### glycine
* **Removed:** pKa1 2.34 / pKa2 9.60 -> `glycine-pKa1`, `glycine-pKa2`; pI 5.97 ->
  `glycine-pI`; net charge @ pH 7 -> **deleted as derived**; D_aq 10.55e-10 m2/s +
  r_stokes 0.233 nm -> `diffusion-glycine-water`; V2 43.2 cm3/mol (Millero 1978) ->
  pointer, see GAP below; loose COSMO/PC-SAFT prose -> named sets;
  duplicate `Cp = 95.0` comment line (the block already carried it).
* **Kept:** identity (+InChIKey, CID), `role nonvolatile`, dHf -527500 J/mol and
  S 103.51 J/(mol K) (solid, `pureSolid`, Vasil'ev 1991 / Hutchens 1960),
  Cp 95.0 J/(mol K) solid (Badelin 1990, Hutchens 99.2 quoted as `crossCheck`,
  not merged), Joback structure record.
* **Fixed:** the header `NEEDS:` line (pKa/pI leads) deleted; Cp stated once.
* **Unresolved:** V2 has no arity-2 home (below).

### alanine -- **the self-contradicting file**
* **Defect resolved:** the file asserted **three** speciation sets --
  description line `pI~6.0`, header `NEEDS: pKa1~2.35, pKa2~9.87, pI~6.11`, and
  body `pKa1 2.34 / pKa2 9.69 / pI 6.00`. `aminoacids_SOURCES.md` section 2 supports
  **2.34 / 9.69 / 6.00**, which is what `alanine-pKa1|pKa2|pI` carry. **All three
  statements are deleted from the component** (the values had moved out anyway);
  only the pointer remains, and the resolution is recorded here and in the file
  header. The stale 2.35 / 9.87 / 6.11 set is **not** propagated anywhere.
* **Removed:** the three speciation statements; charge @ pH 7 (derived);
  D_aq 9.10e-10 + r_stokes 0.270 nm -> `diffusion-alanine-water`;
  V2 60.4 cm3/mol -> pointer; COSMO/PC-SAFT prose -> named sets; duplicate Cp comment.
* **Kept:** identity, dHf -560000 J/mol (Contineanu & Marchidan 1984),
  S 129.21 and Cp 122.26 J/(mol K) (Hutchens 1960, Cp measured 11-305 K), Joback record.

### serine
* **Removed:** pKa1 2.21 / pKa2 9.15 / pKaR ~13 / pI 5.68 -> `serine-pKa1|pKa2|pKaR|pI`;
  charge @ pH 7 (derived); D_aq ~8.5e-10 (estimate) + r 0.288 nm + V2 60.6 cm3/mol ->
  `diffusion-serine-water`; COSMO/PC-SAFT prose -> named sets.
* **Kept:** dHf -732730 J/mol (Sabbah & Laffitte 1978), S 149.16 (Hutchens 1964,
  with Pokorny 2023's 149.1 quoted as `crossCheck`), Cp 134.7 (Pokorny 2023, open).
* **Fixed (new contradiction found):** the file carried **two Cp(298) claims** --
  a comment `138.9 [Sabbah & Laffitte]` against the block value `134.7 [Pokorny]`.
  `aminoacids_SOURCES.md` section 1 lists 134.7; the 138.9 comment is deleted and the
  supersession is recorded in the block's `provenance.supersedes`.

### valine
* **Removed:** pKa1 2.32 / pKa2 9.62 / pI 5.96 -> `valine-*`; charge (derived);
  D_aq ~7.4e-10 + r 0.330 nm + V2 90.8 cm3/mol -> `diffusion-valine-water`;
  COSMO/PC-SAFT prose; duplicate Cp comment.
* **Kept:** dHf -628900 (Vasil'ev 1991, Iris confirmation as `crossCheck`),
  S 178.87 (Hutchens 1963), Cp 168.5 (Spink & Wadso 1975).

### glutamicAcid
* **Removed:** pKa1 2.19 / pKa2 9.67 / pKaR 4.25 / pI 3.22 -> `glutamicAcid-*`;
  net -1 @ pH 7 (derived); D_aq ~7.6e-10 + r 0.324 nm + V2 85.9 cm3/mol ->
  `diffusion-glutamicAcid-water`; COSMO/PC-SAFT prose; duplicate Cp comment.
* **Kept:** dHf -1003300 (Sakiyama & Seki 1975; Contineanu 2005 -1002.6 quoted,
  not merged), S 188.2 (Hutchens 1963), Cp 175.08 (Sakiyama & Seki 1975).

### lysine
* **Removed:** pKa1 2.18 / pKa2 8.95 / pKaR 10.53 / pI 9.74 -> `lysine-*`;
  net +1 (derived); D_aq ~7.0e-10 + r 0.351 nm + V2 ~108.5 cm3/mol (flagged
  approximate) -> `diffusion-lysine-water`; COSMO/PC-SAFT prose.
* **Kept:** dHf -678700 (Vasil'ev 1991, NIST WebBook used only as a finding aid),
  S 240.7 and Cp 289.2 (Pokorny 2023, open).
* **New contradiction found (not silently fixed):** **Cp = 289.2 J/(mol K) is an
  outlier** -- 1.98 J/(g K) against 1.19 (glutamicAcid, near-identical MW),
  1.44 (valine), 1.23 (phenylalanine). The value is transcribed as found and left
  **unchanged**, but the block now carries `status flagged` + `flagReason`
  demanding a digit-exact re-read of the open Pokorny 2023 paper before promotion.

### arginine -- the paywall absence made explicit
* **Removed:** pKa1 2.17 / pKa2 9.04 / pKaR 12.48 / pI 10.76 -> `arginine-*`;
  net +1 (derived); D_aq ~6.6e-10 + r 0.369 nm + V2 ~127.3 cm3/mol (flagged
  approximate) -> `diffusion-arginine-water`; COSMO/PC-SAFT prose.
* **Kept:** dHf -637700 J/mol (Yang et al. 1999 via the **open** Iris compilation;
  the alternative -635.5 and Lukyanova 2011 are quoted as `crossCheck`, never averaged).
* **Fixed:** S(298) and Cp(298) were previously two prose `FLAG` comments. They
  are now **structured absences** -- `s_298 { available none; status flagged;
  blockedBy "Pokorny et al., Int. J. Thermophys. 42 (2021) 156 -- PAYWALLED"; }`
  and the same for `solidHeatCapacity`, each with an `action`. No placeholder
  number, no prose-only flag. The file states outright that arginine cannot enter
  a solid-phase energy balance until they are transcribed.
* Also recorded: no LVPP COSMO output exists for arginine (`available none`).

### phenylalanine
* **Removed:** pKa1 1.83 / pKa2 9.13 / pI 5.48 -> `phenylalanine-*`; charge (derived);
  D_aq ~6.7e-10 + r 0.364 nm + V2 121.5 cm3/mol -> `diffusion-phenylalanine-water`;
  COSMO/PC-SAFT prose; duplicate Cp comment.
* **Kept:** dHf -467400 J/mol, S 213.64 (Cole, Hutchens & Stout 1963),
  Cp 203.1 (Spink & Wadso 1975).
* **Fixed:** the dHf Hess derivation was buried in a comment; it is now a
  structured `derivation {}` block (equation, dHc -4646300 J/mol from Tsuzuki 1958,
  dHf(CO2,g), dHf(H2O,l), result) with `origin derived` -- the value is honestly
  labelled derived, not measured.

### taurine -- estimates no longer dressed as data
* **Defect resolved:** the sulfonate pKa1 and the pI were **estimates**, and the
  file contradicted itself -- header `NEEDS: sulfonate pKa<0, amine pKa~9.0` against
  body `pKa1 ~1.5, pKa2 ~9.06, pI ~5.2`. **Both statements are deleted from the
  component.** `taurine-pKa1` and `taurine-pI` carry them with `origin estimated`
  and `status flagged`; nothing here presents an estimate as a datum.
* **Removed:** the two speciation statements; charge @ pH 7 (derived);
  D_aq ~8.7e-10 + r ~0.28 nm + V2 ~93 cm3/mol (all flagged) ->
  `diffusion-taurine-water`; COSMO/PC-SAFT prose.
* **Kept:** dHf -774500 J/mol (Yang, Pilcher & Macnab 1994); S 154.0 **flagged**
  (the compiler flags it as a low-temperature extrapolation of the 1940
  calorimetry); Cp 140.54 **flagged** with `measuredAt "300.3 K -- an UNSMOOTHED
  single datum"`, i.e. the state caveat is now part of the record, not a comment.
* The permanent-sulfonate-charge statement survives as a `speciationNote` **string**
  (qualitative interpretation, no number).

### urea -- real thermochemistry, now structured
* **Fixed as required:** dHf -333110 J/mol (+/-0.69 kJ/mol, Kabo/Miroshnichenko 1990),
  S 104.26 J/(mol K) (Andersson/Matsuo 1993) are a **structured
  `standardThermochemistry {}`** with `phase solid`, `referenceState pureSolid`
  and per-value provenance; Cp 92.79 J/(mol K) was a **comment only** and is now a
  real `solidHeatCapacity {}` block (same primary). NIST WebBook is declared as a
  *finding aid* (no-grant compilation), the values re-cited to their primaries.
* **Kept additionally:** crystal density 1323 kg/m3 @ 293.15 K (CRC 81st ed.,
  `status rightsPending`) and the **pure-solid** molar volume 4.539e-5 m3/mol as a
  `derivation { V = MW/rho }` -- arity-1, explicitly *not* a partial molar volume in
  water and *not* the Le Bas volume.
* **Removed:** logKow -2.11 -> `urea-octanol-water`; solubility 545 g/L ->
  `urea-water`; D_aq 1.38e-9 -> `diffusion-urea-water`; `chargeAtpH7 0` -> deleted
  as derived; the loose COSMO paragraph -> named sets (`lvpp-urea` evidence
  pointer, VT-2005 `available none`).

### acrylamide -- real thermochemistry, now structured
* **Fixed as required:** dHf -212080 J/mol (+/-0.30 kJ/mol, Steele/Chirico 1989) is a
  structured block with phase + reference state; Cp 110.58 J/(mol K) was a
  **comment only** and is now a `solidHeatCapacity {}` block with the **measured
  interval 305-415 K** and an explicit `caveat` that quoting it at 298.15 K is a
  short extrapolation (acrylamide polymerises above 415 K).
* Enthalpy of combustion -1683020 J/mol (+/-0.26 kJ/mol, same primary) -- the dHf
  lineage -- was a parenthetical comment and is now its own arity-1 block.
* **S(298) absence made structural**: `available none; status flagged;
  blockedBy "absent from the NIST WebBook condensed-phase page"`.
* **Removed:** logKow -0.67 -> `acrylamide-octanol-water`; solubility ~2040 g/L
  (and the CRC 371 g/L disagreement) -> `acrylamide-water`; D_aq ~1.06e-9
  (order-of-magnitude) -> `diffusion-acrylamide-water`; `chargeAtpH7 0` -> deleted;
  the flagged molar volume -> a structured `solidDensity { available none; }`.

### NDMA
* **Removed:** logKow -0.57 -> `NDMA-octanol-water`; D_aq ~1.1e-9 ->
  `diffusion-NDMA-water`; `chargeAtpH7 0` -> deleted as derived; the prose
  thermochemistry FLAG -> a structured absence; the flagged molar volume -> a
  structured `liquidDensity { available none; }`; the loose COSMO paragraph -> named sets.
* **Rescued from prose:** the normal boiling point (~152 C) was stated inside a
  comment. It is arity-1 intrinsic, so it now has a `normalBoilingPoint {}` block --
  flagged, with `origin "stated in the staging source WITHOUT a citation"` and an
  action to pin a primary. It is not presented as a curated datum.
* **New contradiction found:** `role nonvolatile` **contradicts** that same boiling
  point (NDMA is a liquid, b.p. approx 152 C). The role is left as declared but a
  `roleReview { status flagged; finding ...; action ...; }` block now says so out loud:
  "nonvolatile" encodes the intended *use* (trace aqueous contaminant), not physics.
* **Stranded datum, handled:** the aqueous solubility is *qualitative*
  ("miscible / infinitely soluble, 23-25 C", Mirvish et al. 1976) -- phase 2
  deliberately emitted **no** solubility record because there is no number and no
  SLE. The component's pointer says exactly that and names its custodian,
  `parameters/solubility/_LEDGER.md` (the not-emitted entry). Nothing was invented,
  nothing was silently dropped.

### glyphosate
* **Defect resolved as required:** the component now carries **no pKa at all**.
  Both incompatible sets are out: the 4-step 2.0 / 2.6 / 5.6 / 10.6
  (Caceres-Jensen et al. 2009) -> `glyphosate-pKa1 ... pKa4`; the 3-step alternative
  2.34 / 5.73 / 10.2 (e-Pesticide Manual) does **not** map 1:1 onto those steps and
  is held as a whole-set alternative in the speciation `_LEDGER.md`. The pointer
  names both; nothing was reconciled or averaged.
* **Removed also:** net charge -2 @ pH 7 (derived); the "no single pI" prose
  (no number); logKow -3.40 -> `glyphosate-octanol-water`; solubility 12 g/L ->
  `glyphosate-water`; the loose COSMO paragraph -> named sets (`lvpp-glyphosate`).
* **Kept:** identity, `role nonvolatile`, crystal density 1705 kg/m3 @ 293.15 K
  (e-Pesticide Manual, `rightsPending`) and the derived pure-solid molar volume
  9.916e-5 m3/mol; thermochemistry declared structurally absent.

### atrazine
* **Removed:** pKa 1.60 -> `atrazine-pKa1`; `chargeAtpH7 0` -> deleted as derived;
  logKow 2.61 -> `atrazine-octanol-water`; solubility 33 mg/L (plus the
  Ward & Weber 34.7 mg/L cross-check) -> `atrazine-water`; COSMO prose -> named sets.
* **Kept:** identity, `dissociation 1`, crystal density 1230 kg/m3 @ 295.15 K
  (e-Pesticide Manual, `rightsPending`) and the derived pure-solid molar volume
  1.7535e-4 m3/mol; thermochemistry structurally absent.
* **Deleted outright (reported, not re-homed):** `StokesRadius ~0.34 nm typ.` --
  an **uncited placeholder**; and the note "reported NF270/NF70 rejection ~81-98 %"
  -- a number with **no citation, no membrane identity and no operating
  conditions**. A rejection is a membrane+solute+conditions result, never a
  component property. Both removals are stated in the file itself.

### simazine
* **Removed:** pKa 1.62 @ 20 C -> `simazine-pKa1`; charge (derived); logKow 2.18 ->
  `simazine-octanol-water`; solubility 6.2 mg/L @ pH 7 -> `simazine-water`;
  COSMO prose -> named sets.
* **Kept:** identity, `dissociation 1`, crystal density 1302 kg/m3 @ 293.15 K
  (NTP Chemical Repository 1992 -- a US-government source, so `status candidate`,
  the only density in this batch that is not `rightsPending`) and the derived
  pure-solid molar volume 1.5489e-4 m3/mol; thermochemistry structurally absent.

### diuron
* **Removed:** "pKa none in ambient range" -> recorded as an explicit *absence*
  pointer (PubChem holds no dissociation constant; the absence is the finding);
  charge (derived); logKow 2.68 -> `diuron-octanol-water`; solubility 37.4 mg/L
  (with the USDA-ARS 42 mg/L disagreement) -> `diuron-water`; COSMO prose -> named sets.
* **Kept:** identity, `dissociation 1`, crystal density 1480 kg/m3 (e-Pesticide
  Manual, `rightsPending`) and the derived pure-solid molar volume 1.5749e-4 m3/mol.
* **New (minor) finding:** the diuron density carries **no temperature** in its
  source. `temperature notStated;` plus a `caveat` -- none was invented, and the
  derived molar volume inherits the same `notStated`.

---

## Still unresolved (carried forward, nothing hidden)

1. **Partial molar volume in water has no home.** V2 (Millero, Lo Surdo & Shin,
   *J. Phys. Chem.* 82 (1978) 784) is a solute+water **system** property, so it
   correctly left the component -- but there is **no `parameters/volumetric/`
   record type**. For the seven amino acids with an *estimated* D_aq the number
   survives inside the `derivation {}` block of the diffusion record. For
   **glycine (43.2) and alanine (60.4)** the diffusion records are *measured*, so
   they carry **no** `derivation {}` -- those two numbers now live **only** in
   `../aminoacids_SOURCES.md` section 3. Both pointers say so verbatim. **Recommended
   next act: an arity-2 `partialMolarVolume` record type.**
2. **arginine** S(298), Cp(298) -- blocked on Pokorny et al., *Int. J.
   Thermophys.* 42 (2021) 156 (paywalled). Declared absent, not filled.
3. **acrylamide** S(298) -- no open primary located. Declared absent.
4. **lysine** Cp = 289.2 J/(mol K) -- outlier vs the family; flagged for a
   digit-exact re-read of the open Pokorny 2023 paper. Value untouched.
5. **NDMA** `role nonvolatile` vs b.p. approx 152 C -- flagged in `roleReview`, and its
   boiling point is uncited. Needs Vitor's call: re-declare the role and add a
   vapour-pressure correlation, or state the case-scoped simplification.
6. **NDMA** aqueous solubility -- qualitative only ("miscible"); no record exists
   and none should be fabricated.
7. **atrazine / simazine / diuron** Stokes radius and D_aq -- the candidate
   primaries (Kiso et al. 2010; Van der Bruggen et al. 2001) were paywalled at
   curation. No record, no placeholder.
8. **glyphosate** -- the 4-step and 3-step pKa sets remain unreconciled by design
   (they are different assignments, not different roundings). A curator must
   choose one *set*, never mix steps.
9. **COSMO for all 16** -- no deployable set. A named `LVPP` set becomes possible
   only after a matching runtime `variant` plus panel validation (area
   conservation, profile normalisation, sigma-moments, then published properties).
10. **PC-SAFT for all 16** -- no set transcribed. The amino-acid route
    (Cameretti & Sadowski 2008; Held/Do ePC-SAFT) is paywalled: `rightsPending`.
