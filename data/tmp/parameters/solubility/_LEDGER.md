# `parameters/solubility/` — aqueous solubility (SLE) records (phase-2 reclassification)

PRIVATE tier (`data/tmp/`, gitignored).  Created **2026-07-24** by
`agent:partition` as part of the arity-correct reclassification.

> **Sections 1-N below are the PHASE-2 record and are now partly SUPERSEDED.**
> Phase 4 (same day, `agent:solubility`) identified the equilibrating phase in
> 8 records, cleared **all 12** `rightsPending`, deleted 9 non-redistributable
> numbers and promoted 2 records to `candidate`.  For the current state of any
> record, read the **PHASE 4** section at the end of this file — in particular,
> the phase-2 claims "zero records reached `status candidate`" and the
> `rightsPending (12)` table are no longer true.

An aqueous solubility is **not a bare scalar on a molecule**: it is the
**solid–liquid equilibrium between a specific solid phase (polymorph, hydrate,
salt) and water at a stated temperature** — **arity 2** (`solute` + `water`),
plus a solid-phase identity that is part of the equilibrium, not decoration.
It therefore does not belong in a component file, and per `RECORD_SPEC.md` it
does not belong in a comment line either.

Values are transcribed **verbatim**; every unit conversion is written out in
the file (`// UNIT CONVERSION (shown, not hidden): …`) and the source's own
wording is preserved in `value { originalStatement "…"; }`.  Nothing was
averaged or reconciled.

The component files were **not modified** — this phase only *emits* records.

---

## The dominant finding: almost no source states its solid phase

**Not one of the 38 sources names the polymorph, hydrate or crystalline form
that was equilibrated.** Two name a *salt* (PFOS-K, PFBS-K) — which is a
different substance from the acid in `participants`, flagged loudly in-file.

Per the phase-2 rule ("an SLE without its solid phase is incomplete, do not
pretend otherwise"), every such record carries `solidPhase unspecified;` and
**`status flagged`**, or `rightsPending` where the legal status dominates.
**Zero records reached `status candidate`** — and that is the correct, honest
result for this batch, not a failure of curation. Four of them (estradiol,
estrone, ethinylestradiol, bisphenolA) rest on a genuine measured primary
(Shareef et al. 2006) and are flagged *only* for the missing solid phase; they
are the first candidates for promotion once the crystal form is pinned.

---

## Records emitted — 38

### status `flagged` (26) — value present, equilibrium under-specified

| # | compound | mg/L | T | solid phase | origin | primary |
|---|---|---|---|---|---|---|
| 1 | caffeine | 2.16e4 | 298.15 K | unspecified | measured | Yalkowsky, He & Jain, *Handbook of Aqueous Solubility Data* 2nd ed., CRC 2010 |
| 2 | carbamazepine | 152 | **not stated** | unspecified | **estimated** | HMDB (via PubChem) |
| 3 | ibuprofen | 21 | 298.15 K | unspecified (neutral acid) | measured | Yalkowsky & Dannenfelser, AQUASOL 1992 |
| 4 | diclofenac | 2.37 | 298.15 K | unspecified (neutral acid) | measured | Fini et al. (1986) |
| 5 | naproxen | 15.9 | 298.15 K | unspecified (neutral acid) | measured | Yalkowsky & He, CRC 2003, p.962 |
| 6 | ketoprofen | 51 | **295.15 K (22 °C)** | unspecified | measured | Yalkowsky & Dannenfelser, AQUASOL 1992 |
| 7 | sulfamethoxazole | 610 | **310.15 K (37 °C)** | unspecified | measured | HSDB CID 5329 |
| 8 | trimethoprim | 400 | 298.15 K | unspecified | measured | HSDB CID 5578 |
| 9 | gemfibrozil | 11 | **not stated** | unspecified | measured | **unpinned** — no firm open measurement |
| 10 | primidone | 480 | **303.15 K (30 °C)** | unspecified | measured | HSDB CID 4909 |
| 11 | atenolol | 1.33e4 | 298.15 K | unspecified | measured | HSDB CID 2249 |
| 12 | estradiol | 1.51 ± 0.04 | 298.15 K | unspecified | measured | **Shareef et al., *J. Chem. Eng. Data* 51 (2006) 879-881 (PRIMARY)** |
| 13 | estrone | 1.30 ± 0.08 | 298.15 K | unspecified | measured | **Shareef et al. 2006 (PRIMARY)** |
| 14 | ethinylestradiol | 9.20 ± 0.09 | 298.15 K | unspecified | measured | **Shareef et al. 2006 (PRIMARY)** |
| 15 | estriol | 13.25 | **not stated** | unspecified | measured | HSDB CID 5756 (double-distilled water) |
| 16 | testosterone | 23.4 | 298.15 K | unspecified | measured | HSDB CID 6013 |
| 17 | progesterone | 8.81 | 298.15 K | unspecified | measured | HSDB CID 5994 |
| 18 | bisphenolA | 300 ± 5 | 298.15 K | unspecified | measured | **Shareef et al. 2006 (PRIMARY)** |
| 19 | urea | 5.45e5 | 298.15 K | unspecified | measured | Yalkowsky, AQUASOL / Arizona DB 1989 |
| 20 | acrylamide | 2.04e6 | 298.15 K | unspecified | measured | ILO-WHO ICSC #0091 (CC-BY) |
| 21 | atrazine | 33 | 298.15 K | unspecified | measured | Yalkowsky, CRC 2010, p.152 (lineage Ward & Weber 1968) |
| 22 | PFOA | 9.5e3 | 298.15 K | unspecified | measured | ATSDR 2021 Table 4-2 (US-gov PD) |
| 23 | PFOS | 570 | **not stated** | **potassium salt** | measured | Brooke et al. 2004 (UK EA) via ATSDR 2021 |
| 24 | PFBA | 3.3e3 | 298.15 K | **n/a — melts at −17.5 °C** | measured | ATSDR 2021 Table 4-2 |
| 25 | PFBS | 5.26e4 | 296.4 K (range 295.65-297.15) | **potassium salt** | measured | ITRC / ATSDR 2021 |
| 26 | galactose | 6.5e5 | 293.15 K | unspecified | measured | ChemicalBook CAS 59-23-4 — **web aggregator, no primary** |

### status `rightsPending` (12) — lifted from a paywalled commercial compilation

Kept for **internal evaluation only** in this private tier; not promotable
as-is (EU *sui generis* database right: systematic extraction of a table is a
risk even when each value is a fact).

| # | compound | mg/L | T | source |
|---|---|---|---|---|
| 27 | simazine | 6.2 | 293.15 K (pH 7) | Tomlin (ed.), *The Pesticide Manual* 11th ed., BCPC 1997 |
| 28 | diuron | 37.4 | 298.15 K | *e-Pesticide Manual* 15th ed., BCPC 2008-2010 |
| 29 | glyphosate | 1.2e4 | 298.15 K | Worthing & Walker (eds.), *The Pesticide Manual*, BCPC 1987 |
| 30 | fructose | 4.0e6 | not stated | *The Merck Index* 12th ed. |
| 31 | xylose | 1.25e6 | not stated | *The Merck Index* (via PubChem CID 135191) |
| 32 | arabinose | 8.34e5 | 298.15 K | *The Merck Index* |
| 33 | lactose | 1.95e5 | 298.15 K | *The Merck Index* |
| 34 | trehalose | 6.9e5 | 293.15 K | *The Merck Index* |
| 35 | sorbitol | 2.35e6 | 298.15 K | *The Merck Index* 12th ed. |
| 36 | mannitol | 2.16e5 | 298.15 K | *The Merck Index* 12th ed. |
| 37 | xylitol | 6.4e5 | 298.15 K | *The Merck Index* |
| 38 | erythritol | 6.1e5 | 298.15 K | *The Merck Index* 12th ed. |

**Measured vs estimated:** 37 `origin measured` · 1 `origin estimated`
(carbamazepine — the HMDB number is almost certainly a prediction).

---

## Unit conversions performed (all shown in-file, original preserved)

| compound | as stated | → mg/L |
|---|---|---|
| caffeine | 21.6 g/L | 2.16e4 |
| atenolol | 13.3 g/L | 1.33e4 |
| urea | 545 g/L | 5.45e5 |
| acrylamide | 204 g/100 mL | 2.04e6 |
| glyphosate | 12 g/L | 1.2e4 |
| PFBS | 52.6 g/L | 5.26e4 |
| fructose | ~4 g/mL | 4.0e6 |
| galactose | ~650 g/L | 6.5e5 |
| **xylose** | **1 g in 0.8 mL water** | **1.25e6** — per litre of **solvent**, not of solution |
| arabinose | ~834 g/L | 8.34e5 |
| lactose | ~195 g/L | 1.95e5 |
| trehalose | ~690 g/L | 6.9e5 |
| sorbitol | ~2350 g/L | 2.35e6 |
| mannitol | ~216 g/L | 2.16e5 |
| xylitol | ~640 g/L | 6.4e5 |
| **erythritol** | **~61 g/100 mL** | **6.1e5** — Merck's per-solvent convention |

The xylose and erythritol conversions use the source's *per volume of solvent*
basis; at these concentrations that differs from a per-litre-of-solution basis
by tens of percent. Flagged in both files.

---

## Deliberately NOT emitted

| compound | why |
|---|---|
| **NDMA** | Source says *"miscible / infinitely soluble, 23-25 °C"* (Mirvish et al. 1976). Qualitative — there is no SLE and no number. Fabricating one would be invention. |
| **metformin** | *"freely soluble (>300 g/L)"* (DrugBank). A **lower bound**, not a value, and no temperature. |
| **iopromide** | *"very soluble"* — explicitly `[FLAG]` in its own file, no open numeric at 25 °C. |
| the 9 amino acids | No aqueous-solubility value in any file or in `aminoacids_SOURCES.md`. |
| nPropanol, limonene, alphaPinene, HMF, furfurylAlcohol, gammaValerolactone, levulinicAcid | No aqueous-solubility datum (curated for the VLE leg). |
| PFOA **CMC** (~3000 mg/L in 100 mM NaCl) | A micellisation/aggregation threshold, not a solubility. Different property, different record type; noted inside `PFOA-water.candidate.dat`. |

---

## Disagreements found

### (a) component file vs its family ledger — 1 real, 1 cosmetic

| compound | component file | family ledger | verdict |
|---|---|---|---|
| **estriol** | `waterSolubility 13.25 mg/L` (no T) | *"13.25 mg/L"* (no T) | agree — but **neither states a temperature**; recorded as not-stated. |
| **PFOA** | `9.5e3 mg/L @25C` + primaries 3300 / 4340 | identical | agree. |
| **sorbitol** | `~2350 g/L (70% w/v) 25 C` | `~2350 g/L (70% w/v) @25C` | the two carriers agree with each other but the **statement is internally inconsistent**: 70 % w/v is 700 g/L, a factor 3.4 from 2350 g/L. Recorded at 2350 g/L (consistent with Merck's "1 g in ~0.45 mL water"); the "70 % w/v" is most likely the commercial *syrup* grade, not the solubility. **Not resolved here.** |
| **xylitol** | `very soluble (~640 g/L 25 C) — exact FLAG` | `very soluble (~640 g/L)` `[OK approx; exact FLAG]` | agree; both call the exact number a flag. |

No numeric contradiction between a component file and its ledger was found.

### (b) between sources for the same compound (recorded in-file, never merged)

| compound | value A | value B | ratio |
|---|---|---|---|
| **carbamazepine** | 152 mg/L (HMDB) | **18 mg/L** (Hidalgo et al., *Membranes* 13 (2023) 868, Table 3) | **8×** — almost certainly a polymorph/hydrate difference (forms I-IV + dihydrate). The textbook case for why this family needs its solid phase. |
| **acrylamide** | 2040 g/L @25 °C (ICSC #0091) | 371 g/L @20 °C (CRC 95th) | **5.5×** — not explainable by 5 °C |
| **estrone** | 1.30 mg/L @25 °C (Shareef, primary) | 12.42 mg/L (HSDB, double-distilled) | **~10×** |
| **estradiol** | 1.51 mg/L @25 °C (Shareef, primary) | 3.90 mg/L @27 °C (HSDB) | 2.6× at ΔT = 2 °C |
| **bisphenolA** | 300 ± 5 mg/L @25 °C (Shareef) | 300 mg/L (HSDB, agrees) **and** 120 mg/L (HSDB) | 2.5× internal to HSDB |
| **PFOA** | 9.5e3 mg/L (ATSDR headline) | 3300 (Inoue 2011) / 4340 (Rahman 2014), neutral acid | 2-3× |
| **PFOS** | 570 mg/L (K salt, pure water) | 680 @25 °C · 519 @20 °C · 12.4 (seawater) | counter-ion + ionic strength, not error |
| **gemfibrozil** | ~11 mg/L (unpinned) | 28 mg/L (HMDB predicted) | 2.5× |
| **trimethoprim** | 400 mg/L (HSDB) | 615 mg/L (HMDB) | 1.5× |
| **primidone** | 480 mg/L @30 °C (HSDB) | 1040 mg/L (HMDB) | 2× |
| **diuron** | 37.4 mg/L (e-Pesticide Manual, paywalled) | 42 mg/L (USDA ARS PPD, **open**) | 12 % — the open value is the one to pin next |
| **atrazine** | 33 mg/L @25 °C | 34.7 mg/L @26 °C (Ward & Weber 1968) | consistent — the only clean pair in the batch |
| **glyphosate** | 12 g/L @25 °C | 10.5 g/L @ **pH 1.9**, 20 °C | a *different equilibrium* (fully protonated form), not a competing measurement |

### (c) identity mismatches (solid ≠ the named participant)

- **PFOS**, **PFBS** — the equilibrated solid is the **potassium salt**, not the
  acid named in `participants`.
- **lactose** — the component declares the **anhydrous** solid (mp 222 °C), but
  the phase stable under water at 25 °C is α-lactose **monohydrate** (mp ~202 °C).
  The ~195 g/L figure most likely belongs to the monohydrate.
- **trehalose** — component declares **anhydrous** (mp 203 °C); the **dihydrate**
  (mp ~97 °C) is the ambient-temperature aqueous phase.
- **PFBA** — melts at **−17.5 °C**, so at 25 °C there is no solid: the 3.3e3 mg/L
  is a **liquid–liquid** mutual solubility, not an SLE. Marked
  `soluteState liquidSolute;` in-file.
- **atenolol**, **ibuprofen**, **diclofenac**, **naproxen** — the solid is the
  neutral form while the dissolved species at pH 7 is the ion; the record states
  the neutral form explicitly.
- **arabinose** — its component record carries a **known-wrong InChIKey** (copied
  from xylose, per `sugars_SOURCES.md` item 7), so the identity itself is unsettled.

---

# PHASE 4 (2026-07-24, `agent:solubility`) — solid-phase identification + rights clearance

Phase 2 emitted 38 records, **all** carrying `solidPhase unspecified`, **none**
`candidate`, and 12 of them `rightsPending`.  Phase 4 attacked both defects:
identify the equilibrating solid where the literature allows it, and get every
non-redistributable number either re-routed to an open source or **deleted**.

## The three-tier phase rule adopted here

An SLE record's solid phase can be in one of exactly three states, and the file
says which via a new `conditions.phaseBasis` key:

| `phaseBasis` | meaning | status it permits |
|---|---|---|
| `statedBySource` | the determination itself names the equilibrating solid (or salt form) | `candidate` |
| `inferredFromPhaseStability` | an independent, **cited** phase-stability / crystallographic study fixes the phase at these conditions; the determination is silent | `flagged` + `blockedBy` |
| `notEstablished` | nobody states it — an honest, structured gap | `flagged` + `blockedBy` |

A phase assigned by inference is **never** allowed to promote a digit: the digit
was measured on an unnamed solid, and naming the *stable* solid does not prove
the experimentalist had it.  Where a phase source is used it lives in its own
`phaseProvenance {}` block, never mixed into the value's `provenance`.

Two further envelope additions, both structured rather than prose:
`blockedBy "<reason>";` (what stops promotion) and `alternativeDeterminations {}`
(competing numbers kept side by side — **nothing averaged, nothing merged**).

## Per-record outcome — 38

### Phase RESOLVED (8)

| record | old state | phase identified | basis | rights action | new status |
|---|---|---|---|---|---|
| carbamazepine | flagged | **yes — carbamazepine dihydrate** (aqueous-stable form; anhydrates convert solution-mediated) | inferred — Kobayashi et al., *Int. J. Pharm.* 193 (2000) 137-146 | n/a | flagged |
| caffeine | flagged | **yes — caffeine hydrate** (saturated solution a_w ≈ 1 ≫ the 0.835 β-caffeine→hydrate boundary at 25 °C) | inferred — Allan & Schmidt, *J. Food Sci.* (2020), doi 10.1111/1750-3841.15114 | n/a | flagged |
| lactose | rightsPending | **yes — α-lactose monohydrate** (not the anhydrate the component declares) | stated — Trespi, Roshanfekr & Mazzotti, *J. Phys. Chem. B* 129 (2025) 3661-3669, **CC-BY** | **number DELETED** (Merck) | flagged |
| trehalose | rightsPending | **yes — trehalose dihydrate** (not the anhydrate the component declares) | inferred — Allan & Schmidt, *J. Food Sci.* 84 (2019), doi 10.1111/1750-3841.14591 | **re-routed** to Lammert, Schmidt & Day, *Food Chem.* 61 (1998) 139-144 | flagged |
| mannitol | rightsPending | **yes — β-D-mannitol** (least soluble of α/β/δ ⇒ the stable polymorph) | inferred — Cornel, Kidambi & Mazzotti, *Ind. Eng. Chem. Res.* 49 (2010) 5854-5862 | **number DELETED** (Merck) | flagged |
| PFOS | flagged | **yes — the POTASSIUM SALT**; `participants` corrected to `PFOS-potassium` | stated by source (Brooke et al. 2004) | n/a | flagged (no T) |
| PFBS | flagged | **yes — the POTASSIUM SALT**; `participants` corrected to `PFBS-potassium` | stated by source | n/a | **candidate** |
| PFBA | flagged | **yes — there is NO solid**: mp −17.5 °C, so at 25 °C this is a **liquid-liquid** mutual solubility; record re-typed `equilibriumType liquidLiquid; soluteState liquidSolute;` | stated by source (ATSDR mp) | n/a | **candidate** |

Both PFOS and PFBS were renamed on disk to keep `recordId` filename-consistent
(`PFOS-potassium-water.candidate.dat`, `PFBS-potassium-water.candidate.dat`) and
carry `substituteFor` + `saltForm` keys so nobody re-attaches them to the acid.

### Phase NOT ESTABLISHED — structured gap (30)

All carry `solidPhase unspecified; phaseBasis notEstablished; status flagged;`
plus a `blockedBy` string naming the specific gap.

| record | old state | rights action | extra defect recorded in `blockedBy` |
|---|---|---|---|
| ibuprofen | flagged | — | racemate vs conglomerate also open |
| diclofenac | flagged | — | free acid ≠ the marketed sodium salt |
| naproxen | flagged | — | — |
| ketoprofen | flagged | — | T = 22 °C, not 25 °C |
| sulfamethoxazole | flagged | — | T = 37 °C; known-polymorphic |
| trimethoprim | flagged | — | HMDB prediction 1.5× apart, kept as an alternative |
| gemfibrozil | flagged | — | no temperature, **no measuring primary at all** |
| primidone | flagged | — | T = 30 °C; HMDB prediction 2× apart |
| atenolol | flagged | — | free base; cationic at pH 7 |
| estradiol | flagged | — | primary re-verified: *"excess solid, 4 d, 25.0 ± 0.5 °C"* and nothing on the crystal |
| estrone | flagged | — | same; ~10× HSDB disagreement kept, not merged |
| ethinylestradiol | flagged | — | same; component itself records **two** melting points |
| estriol | flagged | — | no temperature either; not covered by Shareef et al. |
| testosterone | flagged | — | free steroid, not an ester |
| progesterone | flagged | — | two known crystal forms, neither named |
| bisphenolA | flagged | — | BPA digit not re-read from the primary in phase 4 |
| urea | flagged | — | single known ambient form, but **still not stated**; 50 wt% saturated solution |
| acrylamide | flagged | **CRC figure DELETED** (all-rights-reserved compilation) | disagreement now *stated* without repeating the number |
| atrazine | flagged | — | cleanest pair in the family (33 @ 25 °C vs Ward & Weber 34.7 @ 26 °C) |
| PFOA | flagged | — | 3 determinations spanning 3×; micellisation above ~3 g/L ⇒ not a clean SLE |
| galactose | flagged | — | mutarotating sugar; aggregator source, no primary |
| simazine | **rightsPending** | **re-routed → USDA-ARS PPD** (US-gov PD): 6.2 ppm @ **22 °C** | the withdrawn "pH 7, 20 °C" framing dropped, not transplanted |
| diuron | **rightsPending** | **re-routed → USDA-ARS PPD**: **42 mg/L @ 25 °C** (was 37.4) | a real ~12 % numeric change |
| glyphosate | **rightsPending** | **re-routed → USDA-ARS PPD**: 1.2e4 ppm @ 25 °C (same digit) | polyprotic ⇒ **no pH stated** is a first-order omission |
| fructose | **rightsPending** | **number DELETED** (Merck) | no T; syrup, not a solution |
| xylose | **rightsPending** | **number DELETED** (Merck) | per-solvent-volume basis; no T |
| arabinose | **rightsPending** | **number DELETED** (Merck) | component's InChIKey is known-wrong ⇒ identity unsettled |
| sorbitol | **rightsPending** | **number DELETED** (Merck) | withdrawn statement internally inconsistent by ~3.4× |
| xylitol | **rightsPending** | **number DELETED** (Merck) | was an explicit order-of-magnitude approximation |
| erythritol | **rightsPending** | **number DELETED** (Merck) | per-solvent-volume basis; JCED 2005 primary named as the re-route lead |

## Rights outcome

**All 12 `rightsPending` records cleared — none remains.**

* **Re-routed to an open source (4):** simazine, diuron, glyphosate → USDA-ARS
  Pesticide Properties Database (US-government work, public domain — the
  individual `.TXT` files were read directly and their solubility blocks are
  reproduced verbatim in each record).  trehalose → Lammert, Schmidt & Day,
  *Food Chem.* 61 (1998) — a **measuring primary**, not a compilation, so
  lifting a handful of facts is not database extraction.
* **Number deleted, structured absence left (8):** fructose, xylose, arabinose,
  lactose, sorbitol, mannitol, xylitol, erythritol — all Merck Index only, no
  open primary verifiable.  Each keeps `value { available none; }`, a
  `provenance` that says `WITHDRAWN`, and a `blockedBy`.  Two of them
  (lactose, mannitol) nevertheless gained an identified solid phase, so they
  are the best-posed empty records in the family: the equilibrium is now fully
  specified except for the digit.
* **One extra deletion outside the original 12:** acrylamide's competing CRC
  Handbook figure.  CRC is all-rights-reserved; the rule "never keep a
  non-redistributable number because it is convenient" applies to alternatives
  as much as to headline values.

## Honesty notes (read before promoting anything)

* `trehalose` is the only re-route where the primary's **full text was not
  read** — the four solubility values came from the article's own abstract-level
  report.  Its `blockedBy` says so explicitly.  Its value is also kept in the
  source's own basis (g/100 g solution) and deliberately **not** converted to
  mg/L, because that needs a saturated-solution density nobody supplied.
* Shareef et al. 2006 was re-verified as an experiment (HPLC, excess solid,
  4 days, 25.0 ± 0.5 °C, six replicates, CV < 5 %).  It is a good primary that
  simply never names its crystal.  The four estrogen/BPA records are still the
  first candidates for promotion once someone runs a PXRD.
* No number in this family was averaged, reconciled or silently changed.  The
  only digits that moved are diuron (37.4 → 42, source swap) and simazine's
  temperature (20 → 22 °C, source swap) — both announced above.

## Counts after phase 4

| status | count |
|---|---|
| `candidate` | **2** (PFBS-potassium, PFBA) |
| `flagged` | **36** |
| `rightsPending` | **0** |
| `verified` | 0 |

| phase state | count |
|---|---|
| equilibrating phase resolved (`statedBySource` or `inferredFromPhaseStability`) | **8** |
| — of which name a solid | 7 |
| — of which establish there is **no** solid (PFBA, liquid-liquid) | 1 |
| `notEstablished` | **30** |

| value state | count |
|---|---|
| numeric value present | **30** |
| `available none` (deleted, structured absence) | **8** |

---

# PHASE 6 (2026-07-24, `agent:solubility`) — establishing the missing solid phases

Phase 4 resolved the equilibrating solid for 8 of 38 records and left **30
carrying `phaseBasis notEstablished`**, plus 8 records whose number had been
deleted on rights grounds (`value { available none; }`).  Phase 6 attacked
both: hunt the primary literature for determinations that state their crystal
form, and hunt an open measuring primary for the 8 withdrawn digits.

The three-tier vocabulary from phase 4 is unchanged and was applied strictly:
`statedBySource` (the determination itself names the equilibrating solid) ·
`inferredFromPhaseStability` (an independent cited study fixes it) ·
`notEstablished`.  **An inferred phase still never promotes a digit.**

## The finding that carried this phase

Phase 2's dominant complaint was that *not one* of its 38 sources named its
solid.  Phase 6 found the counter-example the family needed: a class of paper
that **runs PXRD on the residual solid of its own saturation experiment**.

> Chua, Y.Z., Do, H.T., Kumar, A., Hallermann, M., Zaitsau, D., Schick, C. &
> Held, C., *The melting properties of D-α-glucose, D-β-fructose, D-sucrose,
> D-α-galactose, and D-α-xylose and their solubility in water: A revision*,
> **Food Biophysics 17 (2022) 181-197**, doi `10.1007/s11483-021-09707-6`,
> **CC-BY 4.0** — *"the isothermal method with excess of the solute was
> applied to determine the aqueous solubility and examine the crystal
> structure of the solid deposit in equilibrium with the saturated solutions
> at T = 298.15 K and T = 323.15 K. The crystal structure of the solid phase
> was measured by Powder X-Ray Diffraction (PXRD)."*

That single open paper supplied three `statedBySource` phases (fructose,
xylose, galactose) **and** one measured, redistributable digit (galactose).
A second CC-BY primary (Trespi, Roshanfekr & Mazzotti, *J. Phys. Chem. B* 129
(2025) 3661-3669) closed the lactose `nextStep` that phase 4 had written.

## Per-record outcome — the 30 `notEstablished`

### Phase RESOLVED in phase 6 (9)

| record | phase now assigned | basis | source | value | new status |
|---|---|---|---|---|---|
| **galactose** | **D-α-galactose** | `statedBySource` | Chua et al., *Food Biophys.* 17 (2022) 181-197, **CC-BY** — PXRD of the saturation residue at 298.15 K | **RESTORED**, measured: `w_sat = 0.3256 ± 0.03 g·g⁻¹` (mass fraction of saturated solution) | **candidate** |
| **fructose** | **D-β-fructose** (β-D-fructopyranose, anhydrous) | `statedBySource` | Chua et al. 2022, **CC-BY** | still `available none` | flagged |
| **xylose** | **D-α-xylose** (α-D-xylopyranose, anhydrous) | `statedBySource` | Chua et al. 2022, **CC-BY**; corroborated by Tyson, Pask, George & Simone, *Cryst. Growth Des.* 22 (2022) 1371-1383, **CC-BY** | still `available none` | flagged |
| **arabinose** | **β-L-arabinopyranose** (anhydrous, P2₁2₁2₁, CCDC 2114271) | `inferredFromPhaseStability` | Tyson et al. 2022, **CC-BY** — *"no other known polymorphs or solvated structures for either arabinose or xylose"* | still `available none` | flagged |
| **ibuprofen** | **racemic phase I** | `inferredFromPhaseStability` | Dudognon, Danède, Descamps & Correia, *Pharm. Res.* 25 (2008) 2853-2858 — phase II **melts at 290 K**, i.e. is not a solid at 298.15 K | unchanged (21 mg/L) | flagged |
| **diclofenac** | **anhydrous diclofenac ACID** | `inferredFromPhaseStability` | Llinàs, Burley, Box, Glen & Goodman, *J. Med. Chem.* 50 (2007) 979-983 — *"Crystals of the acid form of diclofenac were anhydrous"*, solids characterised by TGA/DSC/XRD | unchanged (2.37 mg/L) | flagged |
| **urea** | **form I** (tetragonal P-42₁m, anhydrous) | `inferredFromPhaseStability` | Anker, McKechnie, Mulheran & Sefcik, *Cryst. Growth Des.* 24 (2024) 143-158, **CC-BY** — *"urea … has only one polymorph under ambient conditions"* | unchanged (5.45e5 mg/L) | flagged |
| **glyphosate** | **anhydrous zwitterion**, monoclinic P2₁/c | `inferredFromPhaseStability` | Castro, Sanchez-Burgos, H. Espejo, Garaizar, Maggioni & Espinosa, *J. Phys. Chem. B* 130 (2026) 3217-3226, **CC-BY** — *"glyphosate crystallizes from an aqueous solution in a pH-dependent zwitterionic form, adopting a monoclinic unit cell"* | unchanged (1.2e4 mg/L) | flagged |
| **progesterone** | **form I** | `inferredFromPhaseStability` | Sarkar, Ragab & Rohani, *Cryst. Growth Des.* 14 (2014) 4574-4582 — form I is the stable polymorph, form II converts to it | unchanged (8.81 mg/L) | flagged |

### Gap NARROWED but deliberately NOT closed (3)

These were the near-misses.  In each case the honest answer was a better-posed
question, not a phase assignment — recorded in structured `phaseLandscape {}`
blocks with `known` / `missing` / `readState` fields, plus a `nextStep`.

| record | what phase 6 established | what is still missing | why no phase was written |
|---|---|---|---|
| **sorbitol** | the full candidate list — 4 anhydrous polymorphs (α, β, γ, crystallised-melt E) **plus a hydrate**; γ is the most stable *anhydrate* (Nezzal, Aerts, Verspaille, Henderickx & Redl, *J. Cryst. Growth* 311 (2009) 3863-3870) | γ **vs the hydrate** at water activity ≈ 1 | the documented ranking is γ > the other *anhydrates*; that does not answer the hydrate question, and this family has already been burnt by it twice (carbamazepine → dihydrate, lactose → monohydrate) |
| **testosterone** | a hydrate **and** an anhydrate are both crystallographically characterised (*Acta Cryst. B* 26 (1970) 1184) — so the ambiguity is a live two-way fork, not a formality | which is stable under liquid water at 298.15 K | secondary literature encountered points **both** ways (anhydrate→hydrate on water contact; hydrates of 17α-alkylated *derivatives* being metastable). Two directions of unread evidence make a question, not an assignment |
| **estradiol** | the specific open axis is **anhydrate vs hemihydrate**, and the paper that maps the landscape is open: Stevenson, Lancaster, Buanz & Price, *CrystEngComm* 21 (2019) 2154-2163, doi `10.1039/c8ce01874j`, **CC-BY** | a readable copy of that paper | the publisher PDF returned **HTTP 403** repeatedly and no mirror was found. A `phaseBasis` of `inferredFromPhaseStability` requires a *cited study one has read* — a search-engine summary is not one, and neither is a pharmacopoeial habit |

### Unchanged `notEstablished` (18)

`PFOA` · `acrylamide` · `atenolol` · `atrazine` · `bisphenolA` · `diuron` ·
`erythritol` · `estriol` · `estrone` · `ethinylestradiol` · `gemfibrozil` ·
`ketoprofen` · `naproxen` · `primidone` · `simazine` · `sulfamethoxazole` ·
`trimethoprim` · `xylitol`

No determination naming its solid, and no phase-stability study that could be
read, was located for any of these.  Their phase-4 `blockedBy` strings already
name their specific defects and were left as they stand.

## The 8 withdrawn digits — re-hunt result

| record | outcome | detail |
|---|---|---|
| **lactose** | **RESTORED** | Trespi, Roshanfekr & Mazzotti, *J. Phys. Chem. B* 129 (2025) 3661-3669, **CC-BY**, states in words: *"the solubility at 25 °C is […], corresponding to a water molar fraction of **0.9886**"*, with Fig. 1's dashed line labelled *"the solubility of α-lactose monohydrate"*.  Binary complement (shown in-file): `x_lactose = 1 − 0.9886 = 0.0114`.  Argued in-file to be the **total** at mutarotation equilibrium, not α-only — which is exactly what phase 4's `nextStep` demanded.  → **candidate** |
| fructose | not restored | the CC-BY primary that pins its phase does not tabulate fructose `w_sat`; the one open number available (Veith, Luebbert & Sadowski, *Molecules* 26 (2021) 3176, CC-BY) is a **PC-SAFT prediction**, and a modelled digit is not a restoration of a measured one |
| xylose | not restored | Tyson et al. 2022 measured xylose only in **50:50 and 70:30 ethanol/water**, never pure water.  Their 25 °C ethanol/water point is recorded in-file *as prose*, explicitly **not** transplanted into the water record |
| arabinose | not restored | same paper, same limitation; and the arabinose **component's InChIKey is still known-wrong**, so identity gates everything upstream of the number |
| sorbitol | not restored | no open measuring primary located; the phase question above is unresolved anyway |
| mannitol | not restored | no open measuring primary located (phase already `inferredFromPhaseStability`, β-mannitol, from phase 4) |
| xylitol | not restored | lead identified but **not readable**: Wang, Z. et al., *Korean J. Chem. Eng.* 30 (2013) 931-936, a measuring primary for xylitol in water+ethanol, is paywalled and its digits could not be read |
| erythritol | not restored | the phase-4 re-route lead was chased.  The one open candidate found — *Orient. J. Chem.* 34 (2018) 265-275 — is **CC-BY-NC-SA**, i.e. **NonCommercial**, which is excluded by Choupo's data policy independently of any copyleft question; and it measured only aqueous **methanol/ethanol/2-propanol** mixtures, quoting a pure-water figure only as a supplier description of its own reagent.  Rejected on both grounds |

## Rules that bit, and were obeyed

* **Nothing was fabricated.** Where a paper could not be read, no number and no
  phase was taken from it — see estradiol (403), diclofenac's intrinsic
  solubility (full text unavailable, so its digit is a `nextStep`, not an
  `alternativeDeterminations` entry), and progesterone/sorbitol/Llinàs, each
  of which carries an explicit `readState` or honesty note saying the source
  was read at abstract level only.
* **An inferred phase promoted nothing.** All six new `inferredFromPhaseStability`
  records stayed `flagged`.  Both promotions rest on `statedBySource` phases.
* **No non-redistributable compilation was reinstated.** The Merck Index /
  CRC / BCPC ruling stands; the erythritol NonCommercial source was refused
  under the same doctrine.
* **Nothing was averaged or quietly picked.** The one substitution made —
  galactose — replaced an *unattributed web-aggregator entry* (ChemicalBook,
  no primary) with a measured CC-BY determination.  It is recorded in the file
  under `supersedes` with the reason: an unattributed aggregator entry is not
  a determination, so it does not belong in `alternativeDeterminations {}`,
  which is for competing **measurements**.  Announced here so the swap is not
  silent.
* **`participants` was corrected where the phase demanded it**: `galactose` →
  `D-alpha-galactose`, `fructose` → `D-beta-fructose`, `xylose` →
  `D-alpha-xylose`, `arabinose` → `L-arabinose` (the DL racemic *compound* is
  a different, more stable solid and is recorded in an `adjacentSolid {}`
  block so the two are never conflated).

## Counts after phase 6

| status | phase 4 | **phase 6** |
|---|---|---|
| `candidate` | 2 | **4** (PFBS-potassium, PFBA, **galactose**, **lactose**) |
| `flagged` | 36 | **34** |
| `rightsPending` | 0 | **0** |
| `verified` | 0 | 0 |

| phase state | phase 4 | **phase 6** |
|---|---|---|
| `statedBySource` | 4 | **7** (+ fructose, galactose, xylose) |
| `inferredFromPhaseStability` | 4 | **10** (+ arabinose, diclofenac, glyphosate, ibuprofen, progesterone, urea) |
| **equilibrating phase resolved** | **8** | **17** |
| `notEstablished` | 30 | **21** |

| value state | phase 4 | **phase 6** |
|---|---|---|
| numeric value present | 30 | **31** |
| `available none` | 8 | **7** |

**Net phase 6:** 9 phases newly established (3 `statedBySource`, 6 inferred),
1 of the 8 withdrawn digits restored from an open CC-BY primary, 1 further
digit replaced on provenance grounds by an open CC-BY measurement, 2 records
promoted to `candidate`, and 3 near-miss records converted from a generic gap
into a named, cited, one-fact-away question.
