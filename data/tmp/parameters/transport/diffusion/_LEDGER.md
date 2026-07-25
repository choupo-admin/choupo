# `parameters/transport/diffusion/` — emission ledger (phase 2, 2026-07-24)

**What this is.** Every aqueous-diffusion / hydrodynamic-transport datum that
was buried as a *comment line* inside the 57 `components/*.candidate.dat`
staging records, lifted out and re-emitted as a proper **arity-2 record** per
[`RECORD_SPEC.md`](../../../RECORD_SPEC.md).  A solute–solvent diffusion
coefficient is a SYSTEM property: it belongs here, never inside a component
file.  Private tier only (`data/tmp/`, gitignored) — nothing committed.

**Nothing was invented, re-derived, rounded or "improved".**  Each value and
its primary citation were moved verbatim from the component comment and
cross-checked against the family `_SOURCES.md` ledger.  Where the two disagreed
it is recorded under *Inconsistencies* below.

> **Superseded by the PHASE 6 section at the end of this file (2026-07-24)** — the
> counts below are the phase-2 emission counts; the directory now holds 44 records.

**Counts.** 43 records: **41** `diffusionCoefficient` + **2** `hydrodynamicRadius`.
By origin: **10 measured** (8 D + 2 radius) · **1 derived** · **32 estimated**.
By status: **11 candidate** · **32 flagged** · 0 verified · 0 rightsPending.

Conventions in the records:
* `derivation {}` — how THIS record's value was obtained (method + every input).
* `derived {}` — a Stokes radius computed FROM this record's D; **not** a second
  datum, never given its own record.
* A radius that was **measured independently** gets its own `hydrodynamicRadius`
  record with its own provenance (erythritol, carbamazepine) — measured and
  derived radii are never conflated.
* `crossCheck {}` — a corroborating independent number, quoted but **never merged**
  into the value.
* `flagged {}` / `pendingPrimary {}` — the reason + the primary that would resolve it.

---

## 1. Records emitted — MEASURED (status `candidate`)

| solute | D (m²/s) | T (K) | origin | status | primary citation |
|---|---|---|---|---|---|
| fructose | 6.86e-10 | 298.15 | measured | candidate | Ribeiro et al., *J. Chem. Eng. Data* 51 (2006) 1836-1840 (Taylor dispersion) |
| xylose | 7.50e-10 | 298.15 | measured | candidate | Mogi, Sugai, Fuse & Funazukuri, *JCED* 52 (2007) 40-43; cf. Uedaira & Uedaira, *BCSJ* 42 (1969) 2140 |
| lactose | 5.66e-10 | 298.15 | measured | candidate | Ribeiro et al., *JCED* 51 (2006) 1836-1840 |
| glycine | 10.55e-10 | 298.15 | measured | candidate | Longsworth, *JACS* 75 (1953) 5705 (Gouy, infinite dilution) |
| alanine | 9.10e-10 | 298.15 | measured | candidate | Longsworth, *JACS* 75 (1953) 5705; Gutter & Kegeles, *JACS* 75 (1953) 3893 |
| ibuprofen | 5.0e-10 | 298.15 | measured | candidate | Mendes, Cruz, Martins, Prates Ramalho & Martins, *J. Chem. Thermodyn.* 178 (2023) 106955 |
| ketoprofen | 4.4e-10 | 298.15 | measured | candidate | Mendes et al., *J. Chem. Thermodyn.* 178 (2023) 106955 |
| urea | 1.38e-9 | 298.15 | measured | candidate | Gosting & Akeley, *JACS* 74 (1952) 2058 (Gouy, infinite dilution) |

Each of the above except urea carries a `derived {}` Stokes radius
(r = kT/6πµD): fructose 0.358, xylose 0.327, lactose 0.434, glycine 0.233,
alanine 0.270, ibuprofen 0.49, ketoprofen 0.56 nm.  Urea's component file
records no radius — none was invented.

## 2. Records emitted — DERIVED (status `candidate`)

| solute | D (m²/s) | origin | status | basis |
|---|---|---|---|---|
| carbamazepine | 6.6e-10 | derived | candidate | Stokes-Einstein from the MEASURED r = 0.37 nm (Hidalgo, Gómez, Murcia et al., *Membranes* 13 (2023) 868 T3, CC-BY, doi 10.3390/membranes13110868).  A measured D exists but is paywalled (*Fluid Phase Equilib.* 580 (2024) 114056) — flagged as `pendingPrimary`. |

## 3. Records emitted — measured HYDRODYNAMIC RADIUS (own record, `candidate`)

| solute | r (nm) | origin | status | primary citation |
|---|---|---|---|---|
| erythritol | 0.34 ± 0.01 | measured | candidate | Song, Marsh et al., *Atmos. Meas. Tech.* 11 (2018) 4809 (erythritol–water particles) |
| carbamazepine | 0.37 | measured | candidate | Hidalgo, Gómez, Murcia et al., *Membranes* 13 (2023) 868, Table 3 (open access, CC-BY) |

## 4. Records emitted — ESTIMATED (status `flagged`, 32 records)

All carry `origin estimated`, the method, and every numeric input.  **None is
presented as a measurement.**

### 4a. Stokes-Einstein from an equivalent-sphere radius (solid molar volume) — polyols
| solute | D (m²/s) | r input (nm) | route to a real primary |
|---|---|---|---|
| sorbitol | 6.7e-10 | 0.365 (V_m 122.3 cm³/mol) | Paduano, Sartorio, Vitagliano & Costantino, *J. Solution Chem.* (Gouy) — paywalled |
| mannitol | 6.8e-10 | 0.362 (V_m 120.3) | Ribeiro et al. mannitol Taylor-dispersion (~0.66e-9); Longsworth *JACS* 75 (1953) 5705 — paywalled |
| xylitol | 7.2e-10 | 0.341 (V_m 100.1) | Kimura et al., *BCSJ* 63 (1990) 533 — paywalled |
| erythritol | 7.6e-10 | 0.34 (**measured** radius, see §3) | Longsworth 1953; Kimura 1990 — paywalled.  Cross-check: a measured D ~0.9e-9 is reported and **not** reconciled. |

### 4b. Stokes-Einstein from the partial molar volume — amino acids
V° primary: Millero, Lo Surdo & Shin, *J. Phys. Chem.* 82 (1978) 784.

| solute | D (m²/s) | r input (nm) | V° (cm³/mol) | route |
|---|---|---|---|---|
| serine | 8.5e-10 | 0.288 | 60.6 | Ma, Zhu, Wang et al., *JCED* 50 (2005) 1192 — paywalled |
| valine | 7.4e-10 | 0.330 | 90.8 | Ma et al. 2005 — paywalled |
| glutamicAcid | 7.6e-10 | 0.324 | 85.9 | Germann, Turner & Allison, *JPC A* 111 (2007) 1452 (D₂O, pD 3.5 — needs correction) |
| lysine | 7.0e-10 | 0.351 | ~108.5 (V° flagged) | Germann 2007 |
| arginine | 6.6e-10 | 0.369 | ~127.3 (V° flagged) | *Fluid Phase Equilib.* 187-188 (2001) 61 — paywalled |
| phenylalanine | 6.7e-10 | 0.364 | 121.5 | Umecky et al. — paywalled |
| taurine | 8.7e-10 | ~0.28 | ~93 (V° flagged) | no open primary located |

### 4c. Wilke-Chang from a Le Bas volume — hormones + bisphenol A
Route for all seven: Nghiem, Schäfer & Elimelech, *ES&T* 38 (2004) 1888-1896;
Comerton, Andrews, Bagley & Yang, *JMS* 303 (2007) 267 — both paywalled.

| solute | D (m²/s) | Le Bas Vb (cm³/mol) | derived r (nm) |
|---|---|---|---|
| estradiol | 5.4e-10 | ~313.5 | 0.46 (cross-check: open agarose-gel ~4.6e-10, not merged) |
| estrone | 5.5e-10 | ~306 | 0.45 |
| ethinylestradiol | 5.1e-10 | ~343 | 0.48 |
| estriol | 5.3e-10 | ~321 | 0.46 |
| testosterone | 5.1e-10 | ~343 | 0.48 |
| progesterone | 4.8e-10 | ~380 | 0.51 |
| bisphenolA | 6.0e-10 | ~266 | 0.41 (cross-check: open studies 4-6e-10, not merged) |

### 4d. Hayduk-Laudie from a Le Bas volume — pharma set 2
Method: Poling, Prausnitz & O'Connell, *Properties of Gases and Liquids*, 5th ed.
(µ = 0.894 cP, 25 °C).  Route: replace with a measured D when one is curated open.

| solute | D (m²/s) | Le Bas Vb (cm³/mol) | derived r (nm) |
|---|---|---|---|
| sulfamethoxazole | 5.7e-10 | 256.8 | 0.43 |
| trimethoprim | 5.0e-10 | 328.4 | 0.49 |
| metformin | 7.1e-10 | 177.9 | 0.34 (cross-check: MD 0.7-2.0e-9, arXiv:1802.02516, not merged) |
| gemfibrozil | 5.1e-10 | 310.6 | 0.48 |
| primidone | 5.9e-10 | 245.4 | 0.41 |
| atenolol | 5.0e-10 | 327.0 | 0.49 |
| iopromide | 3.6e-10 | 557.2 | 0.67 |

### 4e. Wilke-Chang from a Choupo-computed McGowan V_x — pharma set 1
Method primary: Abraham & McGowan, *Chromatographia* 23 (1987) 243.
No radius emitted for either (the component files defer it until D is pinned).

| solute | D (m²/s) | V_x (cm³/mol) |
|---|---|---|
| diclofenac | 5e-10 | 202.5 |
| naproxen | 6e-10 | 178.2 |

### 4f. Chemical-analogue surrogates — sugars whose primary digit is paywalled
| solute | D (m²/s) | anchor | route |
|---|---|---|---|
| galactose | 6.8e-10 | glucose 6.79e-10 (Ribeiro 2006); C4 epimer | Mogi et al., *JCED* 52 (2007) 40-43 — transcribe the 298.15 K digit |
| arabinose | 7.5e-10 | xylose 7.50e-10; both aldopentoses | Mogi et al. 2007 |
| trehalose | 5.0e-10 | sucrose 5.23e-10 at low conc. | Ekdawi-Sever, de Pablo et al., *JPC A* 107 (2003) 936 — transcribe the exact digit |

Their `derived {}` radii (0.36 / 0.33 / 0.49 nm) are marked **PROVISIONAL** —
they must be recomputed when the real D lands.

### 4g. ORDER-OF-MAGNITUDE ONLY — the weakest two records in the set
No primary, no correlation, no method.  Emitted only so the number is not lost
when the component comments are cleaned; **not usable as-is**.

| solute | D (m²/s) | note |
|---|---|---|
| acrylamide | 1.06e-9 | "order-of-magnitude", no primary sourced clean |
| NDMA | 1.1e-9 | "order-of-magnitude", no primary; route = RO-transport nitrosamine literature |

---

## 5. DELIBERATELY NOT EMITTED

| component | what it carries | why no record |
|---|---|---|
| caffeine | no number — only "literature order-of-magnitude ~0.6–0.7e-9 m²/s" | a *range* is not a value.  Primary identified (Niesner & Heintz, *JCED* 45 (2000) 1121, Taylor dispersion, 298.15 K) but never transcribed.  Emitting a range midpoint would be inventing a number. |
| atrazine | D absent; StokesRadius "FLAGGED (~0.34 nm typ.)" | the radius is an unsourced *typical* value, neither measured nor derived; no D at all.  Fill from Kiso et al., *JMS* 358 (2010) 101-113 / Van der Bruggen et al., *JMS* 193 (2001) 51-63. |
| simazine | D and radius both FLAGGED, no number | nothing to move. Same two primaries. |
| diuron | D and radius both FLAGGED, no number | nothing to move. Same two primaries. |
| glyphosate | D and radius both FLAGGED, no number | nothing to move; additionally speciation-dependent — a single infinite-dilution D would be physically wrong without declaring the species. |
| PFOA, PFOS, PFBA, PFBS | D and radius FLAGGED, no number ("estimate Wilke-Chang at curation") | the estimate was never made; making it now would be creating data, not moving it. |
| nPropanol, limonene, alphaPinene, HMF, furfurylAlcohol, gammaValerolactone, levulinicAcid | no aqueous-diffusion datum at all (VLE-characterised volatiles) | out of scope — nothing buried to lift. |

**16 of the 57** candidates produced no record — 9 carrying a flagged-but-empty
D slot (caffeine, atrazine, simazine, diuron, glyphosate, PFOA, PFOS, PFBA,
PFBS) and 7 volatiles with no aqueous-transport slot at all.  The remaining
**41 components** contributed the **43 records** (erythritol and carbamazepine
each contributed two: a diffusion record and a measured-radius record).

## 6. INCONSISTENCIES found between a component file and its family ledger

1. **erythritol D** — `polyols_SOURCES.md` writes `~0.76e-9 m²/s (measured ~0.9)`;
   the component comment says the same but adds that Stokes-Einstein *underestimates*.
   The two numbers are ~18 % apart and **were never reconciled**.  The emitted
   record keeps the estimate (0.76e-9) as the value and quotes the measured ~0.9e-9
   as an unmerged `crossCheck`.  A curator must pick one — Longsworth 1953 /
   Kimura 1990 are the primaries.
2. **erythritol radius conditions** — the source (Song et al. 2018) measured
   *erythritol–water particles*, i.e. concentrated droplets, not a bulk
   infinite-dilution solution, and states no single thermostatted T.  The
   component comment silently presented 0.34 nm as if it were a bulk
   infinite-dilution aqueous radius.  The record now declares
   `composition aqueousSolutionDroplet` and flags the temperature for verification.
   **This is the one place where the previous pass over-claimed a condition.**
3. **taurine V°** — the amino-acid ledger lists V°(taurine) ≈ 93 cm³/mol as
   FLAGGED, yet also asserts a Stokes radius "~0.28 nm" and D "8.7e-10" derived
   *from* that flagged volume.  The estimate therefore rests on an unverified
   input; recorded as `partialMolarVolumeStatus FLAGGED` inside the derivation.
   Same pattern for lysine (~108.5) and arginine (~127.3).
4. **glutamicAcid / lysine route** — the component files say only "measured value
   FLAG / primary paywalled" with no citation, while `aminoacids_SOURCES.md`
   names Germann, Turner & Allison, *JPC A* 111 (2007) 1452 — which measured in
   **D₂O at pD 3.5** (the cationic form).  That is not the same quantity; the
   ledger's own caveat was not carried into the component file.  The record
   carries the citation *with* the caveat.
5. **arabinose** — the family ledger flags the component's InChIKey as WRONG
   (copied from xylose).  Irrelevant to the diffusion value itself, but it means
   any InChIKey-based join on that file is unsafe; noted here so the diffusion
   record is not later matched by that key.
6. **diclofenac / naproxen method** — the component comments say "Wilke-Chang
   from V_x (Choupo's own)".  Wilke-Chang is defined on a **Le Bas** volume, not
   on the McGowan characteristic volume; the two are different quantities.  The
   record reproduces the stated method verbatim and names V_x explicitly, so the
   mismatch is visible rather than hidden.  Flagged for the curator.
7. **mannitol** — `polyols_SOURCES.md` and the component file both carry an
   estimate (0.68e-9) *and* an experimental ~0.66e-9 whose exact digit is
   paywalled.  The estimate is the emitted value; the experimental route is in
   `flagged { route }`.  They are within 3 % — replacing the estimate should be
   trivial once the digit is obtained.
8. **galactose / arabinose / trehalose** — the family ledger presents these as
   "D_aq | F | ~6.8e-10 (≈glucose)" etc., i.e. *analogue surrogates*, but the
   compounds' `Sources` headers list Mogi 2007 / Ekdawi-Sever 2003 as though the
   value came from them.  It did not.  The records state the anchor substance and
   anchor value explicitly and set `origin estimated`.
9. **No record was assigned `rightsPending`.**  Every flagged value here is a
   Choupo own-estimate or an explicit analogue — no number was extracted from a
   paywalled compilation table.  The paywalled sources appear only as *routes*,
   never as values, which is the legally safe side of the sui-generis line.

---

# PHASE 6 — clearing `flagged` by hunting the missing evidence (2026-07-24)

**Mandate.** For every `flagged` record: read its own `reason`/`route`, go looking
for the *measured* value in open-access primaries, US-government sources, CC-BY
journals and theses; replace the estimate only on a primary I actually read;
otherwise **sharpen the action** — name the paper and the technique, never "search
the literature".  Also: create records for the aqueous compounds that had none,
but **only from a found measurement**, never from an estimate invented now.

**Tools actually used.** OpenAlex + Crossref + Unpaywall + Semantic Scholar +
Europe PMC APIs (bibliographic resolution and OA-status checks), plus direct PDF
retrieval and text extraction where a copy existed.  Where a value is claimed
below as *measured*, the primary's own text/table was read.

---

## 1. THE ONE VALUE FOUND — `caffeine` (new record, `candidate`)

| item | before | after |
|---|---|---|
| record | **none existed** (phase 2 refused: only a prose range `~0.6–0.7e-9 m²/s`) | `caffeine-water.candidate.dat` |
| origin | — | **measured** |
| status | — (absent) | **candidate** |

**What was searched.** The phase-2 route (Niesner & Heintz, *JCED* 45 (2000) 1121,
doi 10.1021/je0000569) — confirmed **closed** (Unpaywall `is_oa=false`), ACS
platform additionally down for migration.  A 1968 diaphragm-cell paper (Okada &
Kawashima, *Yakugaku Zasshi* 88 (1968) 1251, free PDF) turned out to be a **scanned
image with no text layer** — not readable.  The hit came from OpenAlex: an
author deposit of the RSC primary at UNSWorks.

**What was found (and read).** Price, W. E.; Trickett, K. A.; Harris, K. R.,
*Association of Caffeine in Aqueous Solution. Effects on Caffeine Intradiffusion*,
**J. Chem. Soc., Faraday Trans. 1 85 (1989) 3281-3288**, doi `10.1039/f19898503281`.

* Limiting mutual diffusion coefficient at 25.00 °C: **D° = 0.769 × 10⁻⁹ m² s⁻¹**
  (Results text; also the fixed `a0` of the paper's `D_I(m, 25 °C)` polynomial).
* Two independent Taylor-dispersion runs at 25.00 °C in its Table 3 bracket it
  (0.78 and 0.76 ×10⁻⁹; the final subscript digit of each is illegible in the
  scanned copy and was **not** reproduced in the record).
* Independent corroboration, different technique and laboratory: ¹⁴C-tracer
  diaphragm-cell intradiffusion, lowest concentration at 25 °C (0.001 mol kg⁻¹),
  `D_I = 0.774 × 10⁻⁹ m² s⁻¹`.
* Derived Stokes radius **0.319 nm** (r = kT/6πµD, µ = 0.8903 mPa·s).

**Why this matters beyond one record:** 0.769e-9 lies **above** the range the
staging tree had been carrying.  Had phase 2 emitted the midpoint of
"~0.6–0.7e-9", the number would have been ~15 % low.  The refusal to invent a
midpoint was correct.

**Legal note carried in the record.** The only readable copy is the UNSWorks
deposit, which the repository stamps **CC BY-NC-ND 4.0**.  Only the *fact* was
taken; the value is attributed to the primary journal article.  A `sourceAccess {}`
block states this explicitly so the promoting curator can disagree — CLAUDE.md
excludes NonCommercial **databases/compilations**, and a primary research report
is a different thing, but that call is Vítor's, not mine.

---

## 2. THE 32 FLAGGED RECORDS — searched, none cleared, all sharpened

None reached `candidate`: **no open measured primary was found for any of them.**
Every one now carries an `action` naming the specific paper, DOI, technique and
access status, plus what was ruled *out*.  Grouped by why.

### 2a. Polyols (4) — the route COLLAPSED to one paywalled paper, and it is now pinned

| record | old | searched / found | new |
|---|---|---|---|
| `xylitol` | flagged/estimated | **Kimura et al., *Bull. Chem. Soc. Jpn.* 63 (1990) 533-537, doi `10.1246/bcsj.63.533`** — abstract read verbatim: interdiffusion coefficients in water **at concentrations close to infinite dilution, 278-373 K**. Xylitol confirmed in its solute list. Oxford Academic, **paywalled**; Unpaywall's `is_oa=true` is stale (it points at the dead `journal.csj.jp` host) | flagged, action pinned |
| `mannitol` | flagged/estimated | same paper, mannitol confirmed in its list. Estimate (0.68e-9) vs quoted experimental (~0.66e-9) differ ~3 % — one transcription closes it | flagged, action pinned |
| `erythritol` | flagged/estimated | same paper, *meso*-erythritol confirmed. **One transcription also settles the unreconciled ~18 % conflict** (0.76e-9 estimate vs "measured ~0.9e-9" in `polyols_SOURCES.md`) that no curator has yet decided | flagged, action pinned |
| `sorbitol` | flagged/estimated | **RULED OUT**: sorbitol is *not* in Kimura's list (verbatim abstract: 1,2-butanediol, 1,4-butanediol, *meso*-erythritol, xylitol, mannitol, *myo*-inositol). Longsworth *JACS* 75 (1953) 5705-5709, doi `10.1021/ja01118a065` — closed, no repository copy. The phase-2 "Paduano/Sartorio/Vitagliano" route **could not be resolved at all** (Crossref returns only that group's cyclodextrin and alkylurea papers) — it is an unverified citation and must be pinned or dropped | flagged, action sharpened + one route **invalidated** |

### 2b. Amino acids (7) — routes fully resolved, all closed; two rest on a broken input

| record | old | searched / found | new |
|---|---|---|---|
| `serine` | flagged/estimated | best route is now **Umecky et al., *Fluid Phase Equilib.* 264 (2008) 18-22, doi `10.1016/j.fluid.2007.10.013`** — the *hydroxyl-group* α-amino-acid paper, i.e. serine's own family; then Umecky *JCED* 51 (2006) 1705-1710 doi `10.1021/je060149b`; then Ma *JCED* 50 (2005) 1192 doi `10.1021/je049582g`; then Longsworth. All closed | flagged, action sharpened |
| `valine` | flagged/estimated | Umecky *JCED* 2006 (plain α-amino acids); Ma 2005; Longsworth. All closed | flagged |
| `phenylalanine` | flagged/estimated | the phase-2 bare "Umecky et al." is now **resolved to a real article** (vol/pages/DOI it never had) | flagged, citation completed |
| `glutamicAcid` | flagged/estimated | phase-2 route resolved: **Germann, Turner & Allison, *J. Phys. Chem. A* 111 (2007) 1452-1455, doi `10.1021/jp068217o`** — but it measures in **D₂O at pD 3.5**, i.e. the *cationic* form in a solvent ~23 % more viscous. Two declared corrections needed, or use an H₂O source instead | flagged, physics caveat made non-optional |
| `lysine` | flagged/estimated | same Germann caveat **and** the estimate's input V° ≈ 108.5 cm³/mol is itself flagged | flagged, **input defect named first** |
| `arginine` | flagged/estimated | the phase-2 route "*Fluid Phase Equilib.* 187-188 (2001) 61" is a bare volume/page with **no title or authors and could not be resolved** — pin or drop it. V° ≈ 127.3 cm³/mol also flagged | flagged, one route **invalidated** |
| `taurine` | flagged/estimated | **RULED OUT**: taurine is a *sulfonic* zwitterion, not an α-amino acid, so it is absent from all three standard α-amino-acid diffusion sets — the record must stop pointing at them. Realistic deliverable is a PFG-NMR (DOSY) or Taylor-dispersion run; search the osmolyte literature. V° ≈ 93 cm³/mol also flagged | flagged, whole search direction **redirected** |

### 2c. Hormones + bisphenol A (7) — the phase-2 "route" would have LAUNDERED an estimate

Both phase-2 routes were resolved — Nghiem, Schäfer & Elimelech, *ES&T* 38 (2004)
1888-1896, doi `10.1021/es034952r`; Comerton, Andrews, Bagley & Yang, *JMS* 303
(2007) 267-277, doi `10.1016/j.memsci.2007.07.025` — and the important finding is
**negative**: both are membrane-rejection studies whose solute `D_aq` / Stokes
radii are *themselves* Wilke-Chang or Stokes-Einstein estimates.  Transcribing
them would convert an estimate into a "measurement".  Every one of the seven
actions now says so and demands a *direct* determination (Taylor dispersion,
diaphragm cell, Gouy/Rayleigh, PFG-NMR) published as a physical-chemistry
measurement, not inferred from a flux.

| record | additional finding | new |
|---|---|---|
| `estradiol` | the only openly reported numbers are **agarose-gel** D from the DGT literature (~4.0–4.7e-6 cm²/s at 25 °C). A gel D is **not** the free-solution D this record declares — it stays in `crossCheck`, unmerged | flagged |
| `bisphenolA` | two concrete unexhausted leads named: Niesner & Heintz *JCED* 45 (2000) 1121 (Taylor dispersion on **aromatics** — verify whether BPA is in its solute list), and an **open CC-BY** MDPI item, *Determination of the Diffusion Coefficient of Butylparaben and Bisphenol-A via UV-Vis Spectrometry*, doi `10.3390/engproc2026124063`, which returned **HTTP 403 to every fetch attempt** on 2026-07-24 — retry it, it is the one directly usable lead in this group | flagged |
| `estrone`, `ethinylestradiol`, `estriol`, `testosterone`, `progesterone` | nothing further found | flagged |

### 2d. Pharma set 2, Hayduk-Laudie (7)

No measured primary found for any.  All seven actions now name a search *order*:
the Coimbra aqueous Taylor-dispersion programme (A. C. F. Ribeiro et al., which
has published limiting mutual D for paracetamol, caffeine, L-dopa) → the
Évora/Coimbra group that measured **ibuprofen and ketoprofen** (Mendes et al.,
*J. Chem. Thermodyn.* 178 (2023) 106955) and already supplies two `candidate`
records here, so a companion paper is the single likeliest source → DOSY, with
the D₂O/self-diffusion caveat stated.

| record | additional finding | new |
|---|---|---|
| `metformin` | its MD cross-check (0.7–2.0e-9, arXiv:1802.02516) is **so wide it cannot even bound the estimate** and must never reach the value slot. Added physics: metformin is essentially fully **protonated** at neutral pH, so a transcribed D must state species and counter-ion — a cation's mutual D is coupled to its co-ion | flagged |
| `iopromide` | at Le Bas Vb = 557 cm³/mol this is **outside the range Hayduk-Laudie was fitted on** — the estimate is an extrapolation of a correlation. Redirected to the clinical/pharmaceutical contrast-media transport literature | flagged |
| `sulfamethoxazole`, `trimethoprim`, `gemfibrozil`, `primidone`, `atenolol` | nothing further found | flagged |

### 2e. Pharma set 1 (2) — the METHOD MISMATCH is now inside the records

`diclofenac` and `naproxen` used **Wilke-Chang with a McGowan V_x**.  Wilke-Chang
is defined on the **Le Bas** additive volume `Vb`.  Per the mandate this is now
*made explicit in the record*, not just in this ledger: each file carries a new

```
methodMismatch { correlation; volumeRequired; volumeSupplied; sameQuantity no;
                 consequence; handling; status declaredNotFixed; }
```

stating that `V_x` and `Vb` are different quantities, that `V_x` is the smaller,
that `D_WC ∝ Vb^-0.6` so **the recorded D is biased HIGH**, and that the size of
the bias is deliberately **not** quantified — doing so needs a Le Bas `Vb` nobody
has computed, and inventing one now would be creating data.  The number itself is
untouched.  Neither record is promotable while `status declaredNotFixed` stands.

### 2f. Analogue surrogates (3) — "tried hardest", still failed, but two false trails are now closed

| record | searched / found | new |
|---|---|---|
| `galactose` | Mogi et al. *JCED* 52 (2007) 40-43, doi `10.1021/je0601816` — **closed**, and (ACS being down) it is **not even confirmed that galactose is one of its "six sugars"** → that is now the explicit first check. **Uedaira & Uedaira, *BCSJ* 42 (1969) 2140, doi `10.1246/bcsj.42.2140` is RULED OUT**: its title is *Diffusion Coefficients of **Xylose and Maltose*** — it cannot supply galactose and must stop being cited for it. A Landolt-Börnstein entry literally titled *Diffusion coefficient of D-galactose in water at infinite dilution* (doi `10.1007/978-3-662-54089-3_1868`) **exists** — flagged as **do-not-extract** (paywalled compilation, EU sui-generis) and to be used only to read off the primary it cites | flagged, two trails closed |
| `arabinose` | same Mogi status. Uedaira 1969 is the source of the **anchor** (xylose), not of an arabinose value; its companion at *BCSJ* 42 (1969) 2137 is an **activity-coefficient** paper, not diffusion. Ledger's InChIKey defect (copied from xylose) carried into the action | flagged |
| `trehalose` | route resolved: **Ekdawi-Sever & de Pablo et al., *J. Phys. Chem. A* 107 (2003) 936-943, doi `10.1021/jp020187b`** — closed. Second route **Rampp, Buttersack & Lüdemann, *Carbohydr. Res.* 328 (2000) 561-572, doi `10.1016/S0008-6215(00)00141-5`** — closed; abstract read: it *does* measure α,α-trehalose, but by PFG-NMR **at high concentration**, so it yields a **self**-diffusion coefficient (not the mutual coefficient this record's `D` slot means) and would need a declared dilute-limit extrapolation. Physics distinction now stated in the record | flagged, route ranked + physics corrected |

### 2g. The two weakest records (2)

| record | searched / found | new |
|---|---|---|
| `acrylamide` | nothing. Action now states the exit condition plainly: either transcribe a real determination (search *diaphragm cell* / *Taylor dispersion* / *DOSY* in the polymerisation-kinetics and acrylamide-in-food-migration literature, **not** membrane papers), **or replace the bare number with a method-declared Hayduk-Laudie/Wilke-Chang estimate from a stated Le Bas volume** — an estimate with a declared method beats a number with none | flagged |
| `NDMA` | one concrete unexplored lead named: the **open** UOW thesis *Assessment and optimisation of N-nitrosamine rejection by reverse osmosis for planned potable water recycling applications* — check whether it **measures** `D_aq(NDMA)` or merely cites it (a thesis quoting a number is not the primary). Same "estimate with a method beats a number without one" exit | flagged |

---

## 3. Compounds that still have NO record

**No record was created from an invented estimate.**  Nothing was found for these,
so nothing was emitted.

| compound | searched | outcome |
|---|---|---|
| `atrazine`, `simazine`, `diuron` | pesticide DGT / o-DGT literature (the closest hit, *Sensitivity improvement of o-DGT ... neutral pesticides*, `10.1016/j.talo.2022.100123`, was blocked by the publisher; two **open** Bordeaux theses on passive samplers, Fauvelle 2012 and Belles 2012, are unexamined leads) | **no record.** Warning for whoever follows: a DGT/o-DGT paper usually reports D **in the diffusive gel**, which is not the free-solution `D_aq` — check which quantity before transcribing |
| `glyphosate` | electrochemical/sensor literature only | **no record.** Additionally speciation-dependent: a single infinite-dilution D is physically wrong without declaring the species |
| `PFOA`, `PFOS`, `PFBA`, `PFBS` | **the exact primary was identified**: Gauthier, J. R.; Mabury, S. A., *Experimentally Determined Aqueous Diffusion Coefficients of PFAS Using ¹⁹F NMR Diffusion-Ordered Spectroscopy*, **ACS ES&T Water 4 (2024) 4615-4624**, doi `10.1021/acsestwater.4c00631` (closed) — **and a published Comment disputing it**: Endo, S., *ACS ES&T Water* 5 (2025) 488-489, doi `10.1021/acsestwater.4c01021` (**open access**, but ACS was down for platform migration on 2026-07-24 and neither could be read) | **no record.** This is the highest-value open item in the whole directory: a real ¹⁹F-DOSY determination exists for exactly these four solutes. **Read the Comment before the paper** — a contested value must not be transcribed as settled, and DOSY gives self-diffusion, which needs the usual caveat |
| `nPropanol`, `limonene`, `alphaPinene`, `HMF`, `furfurylAlcohol`, `gammaValerolactone`, `levulinicAcid` | not searched — out of scope (VLE-characterised volatiles with no aqueous-transport slot) | no record, by design |

---

## 4. What phase 6 did NOT do

* No value was fabricated, no citation invented, no estimate promoted.
* No record's **number** was changed. The single new number
  (caffeine 0.769e-9) comes from a primary that was read, not from a compilation.
* No `supersededEstimate {}` block was written anywhere — because no estimate was
  replaced.  The caffeine record instead carries `supersedes {}` recording that it
  replaced an *absence*, plus the range that absence was hiding.
* Nothing outside `parameters/transport/diffusion/` and `parameters/volume/`.

## 5. COUNTS

| | before phase 6 | after phase 6 |
|---|---|---|
| records in this directory | 43 | **44** |
| `candidate` | 11 | **12** |
| `flagged` | 32 | **32** |
| `verified` / `rightsPending` | 0 / 0 | 0 / 0 |
| origin `measured` | 10 (8 D + 2 radius) | **11** (9 D + 2 radius) |
| origin `derived` | 1 | 1 |
| origin `estimated` | 32 | 32 |
| compounds with no diffusion record | 16 | **15** |

* flagged → candidate: **0**
* new records created: **1** (`caffeine-water.candidate.dat`, measured, candidate)
* still flagged, every one with a sharpened action: **32**
* routes **invalidated** as unusable or unresolvable: **4**
  (Uedaira 1969 for galactose/arabinose; Kimura 1990 for sorbitol; the α-amino-acid
  sets for taurine; the unresolvable Paduano and *FPE* 187-188 citations)
* records where a *new* defect was named: **5**
  (`metformin` protonation, `iopromide` extrapolation, `trehalose` self-vs-mutual,
  `estradiol` gel-vs-free-solution, `diclofenac`/`naproxen` Vb-vs-V_x — the last
  now declared inside the files)

---

# PHASE 7 — OBTAIN-AND-READ the identified primaries (2026-07-25)

**Mandate.** Phase 6 *identified* primaries bibliographically; phase 7 tries to
**obtain the full text and READ the digit**.  The governing rule: *identification
is not verification.*  A named-but-unread primary may not promote a record; a
digit becomes `candidate` only if I read it in the primary; a read primary that
DISAGREES gets the number deleted with a structured absence.

**Retrieval environment on 2026-07-25.**  WebSearch budget was exhausted, so
retrieval was by direct fetch of known DOIs/URLs + open metadata APIs (Unpaywall,
Crossref, Europe PMC, Semantic Scholar).  **Every scholarly publisher in scope was
unreachable for full text:** ACS (`pubs.acs.org`) HTTP 403 across all endpoints
(the platform-migration outage phase 6 noted was still in effect), RSC
(`pubs.rsc.org`) HTTP 403, Elsevier/ScienceDirect HTTP 403, Oxford Academic served
**abstract only** (tables paywalled).  Internet Archive (`web.archive.org`,
`archive.ph`) and `fatcat.wiki` were **blocked / connection-refused** from this
environment, so even a Wayback snapshot of the OA Endo Comment (which the
availability API confirmed EXISTS at `20250126044904`) could not be fetched.

## Outcome per target

| target | primary | obtained? | digit | action | status |
|---|---|---|---|---|---|
| volume/lactose | Banipal 1997, doi 10.1039/a604656h | **no** (RSC 403, no OA) | not read | `phase7Retrieval` block added; number kept, not deleted | flagged |
| volume/trehalose | Banipal 1997, doi 10.1039/a604656h | **no** (RSC 403, no OA) | not read | same | flagged |
| volume/arabinose | Galema & Hoiland 1991, doi 10.1021/j100166a073 | **no** (ACS 403, no OA) | not read | `phase7Retrieval` added | flagged |
| diffusion/erythritol | Kimura 1990, doi 10.1246/bcsj.63.533 | **abstract only** | not read | membership CONFIRMED from abstract; ~18 % conflict still undecided | flagged |
| diffusion/xylitol | Kimura 1990 | **abstract only** | not read | membership confirmed; digit paywalled | flagged |
| diffusion/mannitol | Kimura 1990 | **abstract only** | not read | membership confirmed; digit paywalled | flagged |
| diffusion/sorbitol | (rule-out) Kimura 1990 | **abstract only** | n/a | **RULED OUT confirmed by reading Kimura's own abstract** (solute set has no sorbitol) | flagged |
| PFAS (PFOA/PFOS/PFBA/PFBS) | Gauthier & Mabury 2024 doi 10.1021/acsestwater.4c00631 (closed) + **Endo Comment 2025** doi 10.1021/acsestwater.4c01021 (bronze-OA) | **no** — both ACS-only, 403; Wayback exists but `web.archive.org` blocked | not read | **Comment could NOT be read first → NO records created** (a contested value must not be transcribed as settled) | no record |
| diffusion/carbamazepine (pendingPrimary) | measured D route | route **RESOLVED** to Mendes et al., *FPE* 580 (2024) 114056, doi 10.1016/j.fluid.2024.114056 | not read (Elsevier 403) | DOI + full citation written into the pendingPrimary; record stays the CC-BY-derived candidate, not superseded | candidate (unchanged) |

## Physics defects actioned (structured `wrongQuantity` / `phase7Retrieval` blocks added, none promoted)

* **metformin** — cation, fully protonated at neutral pH; a cation's mutual D is
  co-ion-coupled, so the neutral-solute Hayduk-Laudie value is the wrong quantity.
* **iopromide** — Le Bas Vb 557 cm³/mol is outside the Hayduk-Laudie fit range;
  the value is an out-of-range correlation output, order-of-magnitude only.
* **trehalose** — the only citable measurement (Rampp 2000) is a high-concentration
  PFG-NMR **self**-diffusion coefficient, not the mutual D the record declares;
  kept out of the value.
* **estradiol** — the only open numbers are **agarose-gel** DGT coefficients, not
  the free-solution D_aq; kept in crossCheck, unmerged.
* **atenolol** — a measured primary was IDENTIFIED (the same *FPE* 580 (2024)
  114056 paper measures atenolol); unreachable, so `pendingPrimary` added, estimate
  not promoted.

## COUNTS (phase 7)

| | after phase 6 | after phase 7 |
|---|---|---|
| records in this directory | 44 | **44** (none created, none deleted) |
| `candidate` | 12 | 12 |
| `flagged` | 32 | 32 |

* flagged → candidate: **0**
* deleted on disagreement: **0** (no digit was READ, so no disagreement could be
  established — deletion requires a read primary that contradicts the number)
* still blocked by an unreachable source: **all in-scope targets** — Banipal (2
  records), Galema (1), Kimura digits (3), the PFAS pair (4 would-be records), the
  carbamazepine + atenolol *FPE* measured D (2 records) — every identified primary
  was paywalled/403/blocked on 2026-07-25.
* the one thing READ from a primary: **Kimura 1990's abstract**, which
  independently CONFIRMS the sorbitol rule-out (from the primary itself, not a
  secondary claim) and confirms erythritol/xylitol/mannitol membership.
* newly RESOLVED citation (bibliographic, not confirmatory): the carbamazepine /
  atenolol measured D → Mendes et al., *FPE* 580 (2024) 114056,
  doi 10.1016/j.fluid.2024.114056.
