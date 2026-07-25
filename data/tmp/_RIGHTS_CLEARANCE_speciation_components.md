# RIGHTS CLEARANCE — aqueous speciation + component-level values (phase 4, 2026-07-24)

Scope worked: `chemistry/aqueousSpeciation/*.dat` (the 9 `rightsPending` records) and
`components/*.candidate.dat` (every component-level `rightsPending` /
`[FLAG -- AGGREGATE]` value).  **`parameters/solubility/` and `parameters/henry/`
were NOT touched** — other agents own those.

Rule applied per value, in this order:
**(a) RE-ROUTE** to a source that may be redistributed (an open/primary report, or a
public-domain government publication) reporting the SAME number ·
**(b) REPLACE** when a legally clear source reports a DIFFERENT number (the compilation
value is demoted into `crossCheck{}` / `alternativeDeterminations{}`, never averaged) ·
**(c) DROP** the number and declare the gap (`available none; status flagged;
blockedBy; action;`) when neither is available.

Nothing was invented.  Where a value was seen only in a re-citation and not at the
measuring paper, the record says so and the status is `flagged`, not `candidate`.

---

## 1. `chemistry/aqueousSpeciation/` — the 9 `rightsPending` records

| compound | quantity | old source | action | new primary / reason it was dropped | new status |
|---|---|---|---|---|---|
| **estradiol** | pKa1, phenolic A-ring OH | DrugBank (CC BY-NC 4.0) | **REPLACE** 10.46 → **10.71** | **Lewis, K.M. & Archer, R.D., *Steroids* 34 (1979) 485-499, PMID 516114.** The abstract was read and states verbatim: "The acid ionization constants of estrone (10.77), 17 beta-estradiol (10.71) and 2-methoxyestrone (10.81) have been determined". The route named in the old record was followed and it does **not** confirm 10.46. DrugBank's 10.46 kept in `crossCheck{}`, attributed, never promotable. | `candidate` |
| **atrazine** | pKa1, triazine ring N | e-Pesticide Manual 15th ed. (BCPC) | **REPLACE** 1.60 → **1.68** | **Bailey, G.W., White, J.L. & Rothberg, T., *Soil Sci. Soc. Am. Proc.* 32 (1968) 222-234**, doi 10.2136/sssaj1968.03615995003200020021x. Value seen in **ATSDR, Toxicological Profile for Atrazine, Table 4-2** (US federal government → public domain), which lists pKa 1.68 and attributes it to that primary. The primary itself was NOT inspected → `flagged`, not `candidate`. | `flagged` |
| **simazine** | pKa1, triazine ring N | The Pesticide Manual 11th ed. (BCPC) | **DROP** (1.62 @ 20 °C deleted) | No public-domain or open primary confirms the digit. Atrazine's ATSDR route has no simazine counterpart. The California DPR *Simazine Risk Characterization Document* (public sector) gives 1.70 @ 21 °C but re-cites **Montgomery 1993**, itself a commercial compilation — recorded as an alternative, not adopted. Action: read Weber, *Spectrochim. Acta* 23A (1967) 458-461 or Bailey et al. 1968. | `flagged` |
| **diclofenac** | pKa1, –COOH | Sangster, LOGKOW Databank (1994) | **DROP** (4.15 deleted) | No open primary reporting that digit under stated aqueous conditions could be read. The openly-licensed alternative found (ChEMBL, CC BY-SA) gives a *range* 3.99–4.30 and names no measurement. Leads staged in `action` (Anal. Chim. Acta 1997 PII S0003-2670(97)00307-3; J. Pharm. Biomed. Anal. 2007 PII S0731-7085(07)00442-6; PMID 10704132). | `flagged` |
| **ibuprofen** | pKa1, –COOH | Sangster, LOGKOW Databank | **DROP** (4.91 deleted) | Same. ChEMBL's 4.45 disagrees by 0.46 pK and names no primary → not adopted, kept as an attributed alternative. | `flagged` |
| **ketoprofen** | pKa1, –COOH | Sangster, LOGKOW Databank | **DROP** (4.45 deleted) | Same. The open-access alternative (ChEMBL 3.98, quoted in Hidalgo et al., *Membranes* 13 (2023) 868, CC BY) is a **quotation inside a membrane-rejection paper**, not a determination. | `flagged` |
| **naproxen** | pKa1, –COOH | Sangster, LOGKOW Databank | **DROP** (4.15 deleted) | Same. ChEMBL 4.18 kept as an attributed alternative only. | `flagged` |
| **fructose** | pKa1, sugar OH | The Merck Index | **DROP** (12.03 deleted) | No open primary could be **read**. Izatt, Rytting, Hansen & Christensen, *J. Am. Chem. Soc.* 88 (1966) 2641-2645 (25 °C, covers fructose) and Christensen, Rytting & Izatt, *J. Chem. Soc. B* (1970) 1646 (10/40 °C) are behind ACS/RSC paywalls. Thamsen, *Acta Chem. Scand.* 6 (1952) 270-284 **was** fetched free and OCR'd — it covers only glucose, mannitol and sorbitol, no ketose/pentose row. | `flagged` |
| **xylose** | pKa1, sugar OH (18 °C) | The Merck Index | **DROP** (12.14 deleted) | Same three leads; same outcome. The dropped value was at 18 °C, which the replacement must not silently inherit. | `flagged` |

---

## 2. `components/*.candidate.dat` — real numbers

### 2a. Re-routed (same value, legally clear source)

| compound | quantity | old source | new source (route) | new status |
|---|---|---|---|---|
| **atrazine** | solid density 1.23 g/cm³ @ 22 °C | e-Pesticide Manual (BCPC) | **ATSDR Toxicological Profile for Atrazine, Table 4-2** (US federal government, PUBLIC DOMAIN), which lists 1.23 g/cm³ (22 °C) attributed to HSDB 2002. Digits and temperature agree exactly. | `flagged` (legally clear; no primary measurement named) |
| **atrazine** | solid molar volume 1.7535e-4 m³/mol | derived from the above | inherits the cleared status | `flagged` |
| **glyphosate** | solid density 1.705 g/cm³ @ 20 °C | e-Pesticide Manual (BCPC) | **ATSDR Toxicological Profile for Glyphosate (Aug 2020), Table 4-2** (PUBLIC DOMAIN), acid row. Digits and temperature agree exactly. | `flagged` (ATSDR re-cites two commercial compilations) |
| **glyphosate** | solid molar volume 9.916e-5 m³/mol | derived from the above | inherits the cleared status | `flagged` |
| **nPropanol** | Tb 370.3 K `[FLAG -- AGGREGATE]` | NIST WebBook average | **DERIVED from the primary Antoine set already in the file** (Ambrose & Sprake, *J. Chem. Thermodyn.* 2 (1970) 631): T = B/(A − log₁₀P) − C = 1441.629/(4.87601 − 0.0057173) + 74.299 = **370.30 K**. The 333–378 K validity window brackets Tb → interpolation, not extrapolation. Identical to the aggregate it replaces. | `candidate` value, `origin derived` |
| **limonene** | ΔvapH(T) 5-point table | flagged `rightsPending` | **RECLASSIFIED**, not re-sourced: Steele, Chirico et al., *J. Chem. Eng. Data* 47 (2002) 689 is a **primary research paper**, not a compilation. `rightsPending` is for compilation/database sources; this corpus already carries other paywalled-primary values as `candidate` (urea's Kabo 1990, mannitol's Xu 2010). | `flagged` (the 298 K point's Clara et al. 2009 citation is still unresolved) |

### 2b. Replaced (different value from a legally clear source)

| compound | quantity | old | new | new status |
|---|---|---|---|---|
| **alphaPinene** | Tb `[FLAG -- AGGREGATE]` | 430.0 K (NIST WebBook average of 14) | **429.4 K**, DERIVED from the file's own Antoine set (Hawkins & Armstrong 1954): 1411.869/(3.92161 − 0.0057173) + 68.817 = 429.36 K. −0.6 K (0.15 %). | `flagged` — the Antoine set's own citation is unresolved, and 429.36 K sits 0.4 K above the set's stated 429 K upper limit (a declared marginal extrapolation) |

### 2c. Dropped (number deleted, structured absence left)

| compound(s) | quantity | old source | why dropped | new status |
|---|---|---|---|---|
| **diuron** | solid density 1.48 g/cm³ (T not stated) **+** derived solid molar volume | e-Pesticide Manual (BCPC) | No public-domain counterpart to the ATSDR route; the EPA Diuron RED (public domain) **was fetched** and gives melting point and water solubility but **no density**. | `flagged` ×2 |
| **urea** | solid density 1.3230 g/cm³ @ 20 °C **+** derived solid molar volume | CRC Handbook 81st ed. | CRC is no-grant/all-rights-reserved (excluded outright). Public-domain routes checked and they do **not** confirm the digit: NOAA CAMEO Chemicals gives s.g. 1.34 @ 68 °F (USCG 1999) and a description density 1.335 g/cc with no temperature — 1 % away and less precise. Both kept in `crossCheck{}`. Action: derive ρ from the room-temperature single-crystal cell (Vaughan & Donohue, *Acta Cryst.* 5 (1952) 530-535; Worsham, Levy & Peterson, *Acta Cryst.* 10 (1957) 319). | `flagged` ×2 |
| **arabinose, erythritol, fructose, galactose, lactose, mannitol, sorbitol, xylitol, xylose** (9) | solid density | CRC / Merck Index / ChemicalBook | No open primary located. Action recorded on every record: read Dx from a published single-crystal structure of the **named** polymorph/anomer, or derive ρ = Z·MW/(N_A·V_cell) from open cell parameters (Crystallography Open Database, CC0). | `flagged` ×9 |
| the same 9 | solid molar volume (V = MW/ρ) | derived | **a derivative cannot outlive the datum it was computed from** — dropped with the density it was built on. The *partial* molar volume in water is a system property in `parameters/volume/` and is untouched. | `flagged` ×9 |
| **arabinose, erythritol, fructose, galactose, lactose, sorbitol, xylose** (7) | melting point | Merck Index / CRC / NIST-TRC | No open primary; and none of the sources names the polymorph/anomer melted. Action: a DSC/adiabatic primary staged as a `fusion{}` block with ΔH_fus. | `flagged` ×7 |
| **mannitol, xylitol** (2) | melting point | CRC / Merck / NIST-TRC | **DROP as redundant**: each file already carries the same transition as a primary-cited `fusion{}` block (mannitol T_fus = 437.25 ± 0.12 K, Xu et al., *J. Chem. Eng. Data* 2010, doi 10.1021/je900285w; xylitol 365.7 K, Barone & Della Gatta 1990 via Domalski & Hearing, *J. Phys. Chem. Ref. Data* 25 (1996) 1). The compilation entry was a second, weaker copy — an arity-1 duplication as well as a rights problem. Deleting it loses nothing. | `flagged` ×2 |
| **arabinose, fructose, galactose, lactose, xylose, trehalose** (6) | specific rotation [α]_D | Merck Index | No open primary. Lowest-priority gap: it is an identity descriptor, not a thermophysical datum. (For xylose and trehalose the numeric value was not preserved in the audit line — recorded as such, not guessed.) | `flagged` ×6 |
| **HMF** | reduced-pressure boiling point 388.2 K @ 100 Pa | CRC Handbook (Weast ed. 1989) | CRC is no-grant, excluded outright — nothing to honour, nothing to re-cite. Action: read the P–T data of the Verevkin/Emel'yanenko (2009) gas-saturation study already pinned in the file. HMF now carries **no** boiling datum. | `flagged` |
| **limonene** | Tb 450.0 K `[FLAG -- AGGREGATE]` | NIST WebBook average of 18 | Unlike nPropanol and alphaPinene, this file carries **no** vapour-pressure correlation, so Tb cannot be derived from a primary in hand. Action: stage the Steele/Chirico (2002) vapour pressures and derive Tb. | `flagged` |
| **nPropanol** | Pc 52.0 bar `[FLAG -- AGGREGATE]` | NIST WebBook average of 12 | Aggregator arrangement, no primary named, no-grant source. Consequence recorded: ω cannot now be derived from Antoine + Tc + Pc, so the ω gap stays open. | `flagged` |
| **nPropanol** | ΔHf°(298, ideal gas) −256000 J/mol `[FLAG -- AGGREGATE]` | NIST WebBook average of 7 | Same. Consequence recorded: the `standardThermochemistry{}` block is now deliberately incomplete and not loadable (s_298 alone is not an enthalpy datum). | `flagged` |

### 2d. Reclassified — `rightsPending` blocks that held **no number**

19 blocks carried `status rightsPending` while declaring `available none` /
`numbersInHand no`.  `rightsPending` means *a value is held that cannot be shipped*;
no value was held, so these were declared **gaps**, not legal blockers.  All were
reclassified to `status flagged` and given explicit `blockedBy` + `action` (and, for
the PC-SAFT ones, the standing rule: take ONE compound's row with its own citation,
with variant / association scheme / combining rules / objective function / data range
— never the table).

* `pcSaft { CamerettiSadowski2008 }` — **glycine, alanine, serine, valine, arginine,
  glutamicAcid, lysine, phenylalanine, taurine** (9)
* `pcSaftStatus` — **fructose, galactose, lactose, mannitol, sorbitol, trehalose,
  xylitol, xylose, ibuprofen, ketoprofen** (10)

### 2e. Adjacent flags NOT in the stated scope (left alone, listed for the next pass)

Same legal class, but tagged `[FLAG -- COMPILATION]` / `[FLAG -- EVALUATED
COMPILATION]` rather than `rightsPending` or `[FLAG -- AGGREGATE]`, so outside this
brief: **nPropanol** ω 0.620 and the ideal-gas Cp polynomial (Poling, Prausnitz &
O'Connell tabulation), **nPropanol** HvapTb 41440 J/mol (Majer & Svoboda 1985
evaluated compilation), and **nPropanol** liquid Cp 144.0 J/mol·K (`[FLAG -- NO
SOURCE]`).  **nPropanol** Tc 536.71 K and **limonene** ΔHf(liq) already re-cite a
primary whose journal/volume/pages are unresolved.

---

## Counts

| action | speciation | components | total |
|---|---|---|---|
| **RE-ROUTE** (same value, legally clear source) | 0 | 6 | **6** |
| **REPLACE** (different value, legally clear source) | 2 | 1 | **3** |
| **DROP** (number deleted, gap declared) | 7 | 41 | **48** |
| **RECLASSIFY** (block held no number) | 0 | 19 | **19** |
| total values handled | 9 | 67 | **76** |

**`status rightsPending` remaining in this scope: 0.**
(Verified by `grep -rn '^\s*status\s*rightsPending' components/ chemistry/` → no hits.
Remaining occurrences of the *word* are inside `licence` / `blockedBy` /
`alternativeDeterminations` text, where they correctly label a demoted value.)

### Compounds now free of `rightsPending` in this scope (31 → 0)

arabinose · alanine · arginine · atrazine · diclofenac · diuron · erythritol ·
estradiol · fructose · galactose · glutamicAcid · glycine · glyphosate · HMF ·
ibuprofen · ketoprofen · lactose · limonene · lysine · mannitol · naproxen ·
nPropanol · phenylalanine · serine · simazine · sorbitol · taurine · trehalose ·
urea · valine · xylitol · xylose · alphaPinene

### Still blocked elsewhere (NOT this agent's scope)

`parameters/solubility/` still carries `rightsPending` SLE records for arabinose,
diuron, erythritol, fructose, glyphosate, lactose, mannitol, sorbitol, trehalose,
xylitol, xylose and others — owned by another agent.  `generated/indexes/` was updated
**only** for the 9 acidDissociation rows this pass changed; its solubility rows are
still stale and the whole index should be regenerated once every agent has finished.

### Net effect on the corpus

Legality improved, quantity of data reduced — deliberately.  Nine compounds keep a
legally clean *speciation* record only in the atrazine and estradiol cases; the four
NSAID pKa values and the two sugar pKa values are now declared gaps, which is the
honest state (the literature spread on the NSAIDs is 0.5–2 pK units and no
determination could be read at its source).  The sugar/polyol family lost its
handbook densities, melting points and rotations; two of those melting points were
redundant with primary `fusion{}` blocks the files already had, and every deletion
carries the exact `action` needed to refill it.
