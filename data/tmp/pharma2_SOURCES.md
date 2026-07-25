# pharma2 — SOURCES (set 2: pharmaceutical NF/RO micropollutants)

Private, gitignored staging log (`data/tmp/`).  Enrichment session **2026-07-24**.
Compounds: sulfamethoxazole, trimethoprim, metformin, gemfibrozil, primidone,
atenolol, iopromide.  Every value below is an INDIVIDUAL FACT re-cited to a
primary/open source — no compilation table was copied wholesale.

## Legal frame
- **Identity** (formula/MW/InChIKey/CID): PubChem PUG-REST (US NIH, public domain).
- **Physicochemical facts** (logKow, pKa, solubility, mp): PubChem **PUG-View**,
  each value carrying its own source attribution (HSDB / DrugBank / HMDB / ChEMBL —
  all open, US-gov or CC).  A PUG-View value is a single re-cited fact, not the
  proprietary CAS/aggregator arrangement.
- **NF-review facts** (Radjenović 2008 Table 1; Bizi 2021 dimensions): open-access
  peer-reviewed primaries, per-value.
- **molarVolume / D_aq / r_Stokes**: NOT copied — COMPUTED by Choupo from the
  **Le Bas additive method** (molar volume) + **Hayduk-Laudie correlation** (aqueous
  diffusivity, 25 °C, μ=0.894 cP) + **Stokes-Einstein** (radius).  Labelled `[ESTIMATE]`
  in every `.dat`.  Method: Poling, Prausnitz & O'Connell, *Properties of Gases and
  Liquids*, 5th ed.  These are engineering estimates, not measurements.

## Primary sources cited
- **Radjenović, Petrović, Barceló & Petrović, Water Research 42 (2008) 3601-3610**
  ("Rejection of pharmaceuticals in NF and RO membrane drinking water treatment") —
  open PDF.  Table 1 MW/pKa/logKOW (attributed there to Syracuse PhysProp/KOWWIN).
- **Bizi & El Bachra, Molecules 26 (2021) 7318** (open access) — molecular
  dimensions (W×H×L) and logD8 for sulfamethoxazole (+ carbamazepine ref).
- **PubChem PUG-View** headings LogP / Dissociation Constants / Solubility /
  Melting Point, retrieved 2026-07-24 (raw JSON kept in `data/tmp/_pugview/`).
- MD cross-check for metformin D_aq: arXiv:1802.02516 (0.7-2.0×10⁻⁹ m²/s).

## Per-compound REAL vs FLAGGED

### sulfamethoxazole (C10H11N3O3S, CID 5329, MW 253.28) — anion @pH7
| field | value | source |
|---|---|---|
| pKa1 / pKa2 | 1.6 / 5.7 | HSDB |
| logKow | 0.89 | HSDB expt; = Radjenović 2008 Table 1 |
| logD(pH8) | -1.54 | Bizi 2021 |
| waterSol | 610 mg/L @37 °C | HSDB |
| mp | 167 °C | HSDB/HMDB |
| molecularDims | 0.526×0.587×1.031 nm | Bizi 2021 |
| molarVolume | 256.8 cm³/mol | [EST] Le Bas |
| D_aq(25 °C) | 5.7e-10 m²/s | [EST] Hayduk-Laudie |
| r_Stokes | 0.43 nm | [EST] Stokes-Einstein |
FLAGGED: standardThermochemistry, cosmo{} (VT-pharma set paywalled), PC-SAFT.

### trimethoprim (C14H18N4O3, CID 5578, MW 290.32) — partly cationic @pH7
| field | value | source |
|---|---|---|
| pKa | 7.12 (conj. acid, 20 °C) | DrugBank/HSDB |
| logKow | 0.91 | HSDB expt |
| waterSol | 400 mg/L @25 °C | HSDB |
| mp | 199-203 °C | DrugBank/HMDB |
| molarVolume | 328.4 cm³/mol | [EST] Le Bas |
| D_aq(25 °C) | 5.0e-10 m²/s | [EST] Hayduk-Laudie |
| r_Stokes | 0.49 nm | [EST] Stokes-Einstein |
FLAGGED: standardThermochemistry, cosmo{}, PC-SAFT.

### metformin (C4H11N5, CID 4091, MW 129.16) — cation @all pH (small, hard to reject)
| field | value | source |
|---|---|---|
| pKa | 12.4 (2nd ~2.8) | DrugBank/HSDB |
| logKow | ~ -1.43 **[FLAG]** | widely-cited free-base; NO open experimental in PubChem (computed XLogP3 -0.5) |
| waterSol | freely soluble (>300 g/L) | DrugBank |
| mp | 223-226 °C | DrugBank/HMDB |
| molarVolume | 177.9 cm³/mol | [EST] Le Bas |
| D_aq(25 °C) | 7.1e-10 m²/s | [EST] Hayduk-Laudie; MD 0.7-2.0e-9 (arXiv:1802.02516) |
| r_Stokes | 0.34 nm (smallest) | [EST] Stokes-Einstein |
FLAGGED: **logKow**, standardThermochemistry, cosmo{}, PC-SAFT.

### gemfibrozil (C15H22O3, CID 3463, MW 250.33) — anion @pH7, hydrophobic
| field | value | source |
|---|---|---|
| pKa | 4.43 | Radjenović 2008 Table 1 |
| logKow | 4.77 | Radjenović 2008 Table 1 (KOWWIN; HMDB pred 3.4) |
| waterSol | ~11 mg/L **[FLAG]** | sparingly soluble; HMDB pred 28 mg/L; no firm open @25 °C |
| mp | 61-63 °C | HMDB/DrugBank/HSDB |
| molarVolume | 310.6 cm³/mol | [EST] Le Bas |
| D_aq(25 °C) | 5.1e-10 m²/s | [EST] Hayduk-Laudie |
| r_Stokes | 0.48 nm | [EST] Stokes-Einstein |
FLAGGED: **waterSol**, standardThermochemistry, cosmo{}, PC-SAFT.

### primidone (C12H14N2O2, CID 4909, MW 218.25) — NEUTRAL @pH7 (poorly rejected ref)
| field | value | source |
|---|---|---|
| pKa | 12.3 (acidic N-H) | HSDB |
| logKow | 0.91 | HSDB expt (HMDB pred 1.6) |
| waterSol | 480 mg/L @30 °C | HSDB |
| mp | 281.5 °C | HSDB/HMDB |
| molarVolume | 245.4 cm³/mol | [EST] Le Bas |
| D_aq(25 °C) | 5.9e-10 m²/s | [EST] Hayduk-Laudie |
| r_Stokes | 0.41 nm | [EST] Stokes-Einstein |
FLAGGED: standardThermochemistry, cosmo{}, PC-SAFT.

### atenolol (C14H22N2O3, CID 2249, MW 266.34) — cation @pH7, hydrophilic
| field | value | source |
|---|---|---|
| pKa | 9.6 | HSDB/DrugBank (ChEMBL 9.54-9.58) |
| logKow | 0.16 | HSDB expt |
| waterSol | 13.3 g/L @25 °C | HSDB/HMDB |
| mp | 146-148 °C | HSDB (DrugBank 158-160) |
| molarVolume | 327.0 cm³/mol | [EST] Le Bas |
| D_aq(25 °C) | 5.0e-10 m²/s | [EST] Hayduk-Laudie |
| r_Stokes | 0.49 nm | [EST] Stokes-Einstein |
FLAGGED: standardThermochemistry, cosmo{}, PC-SAFT.

### iopromide (C18H24I3N3O8, CID 3736, MW 791.11) — NEUTRAL @pH7 (large, well-rejected tracer)
| field | value | source |
|---|---|---|
| pKa | none (2-12) | amide/hydroxyl, non-ionizing |
| logKow | -2.05 **[FLAG]** | HMDB computed; no open experimental |
| waterSol | very soluble **[FLAG]** | no open numeric @25 °C |
| mp | decomposes **[FLAG]** | no clean open mp |
| molarVolume | 557.2 cm³/mol | [EST] Le Bas (I=37.0) |
| D_aq(25 °C) | 3.6e-10 m²/s (lowest) | [EST] Hayduk-Laudie |
| r_Stokes | 0.67 nm (largest) | [EST] Stokes-Einstein |
FLAGGED: **logKow, waterSol, mp**, standardThermochemistry, cosmo{}, PC-SAFT.

## FLAGGED (systematic, whole set)
- **standardThermochemistry{}** — ALL 7: no open ideal-gas ΔHf/S298 for these
  non-volatile solids (paywalled / unavailable).  NOT fabricated.  Consistent with
  the `role nonvolatile` note (not characterized by Joback/VLE).
- **cosmo{} σ-profiles** — ALL 7 not obtained.  A pharmaceutical σ-profile set
  exists (VT / Mullins, *IECR* 46 (2007) ie0711022, paywalled; CHAOS CC-BY,
  arXiv:2511.19002 for the long tail).  Requires a bulk InChIKey join staged
  separately; InChIKeys recorded per file for that join.  Not fabricated.
- **PC-SAFT params** — ALL 7: none published open.  (metformin would additionally
  need ePC-SAFT electrolyte treatment as a permanent cation.)
- **Value-specific flags**: metformin logKow; gemfibrozil waterSol;
  iopromide logKow + waterSol + mp.

## Notes for the curator
- The membrane geometry set (molarVolume / D_aq / r_Stokes) is a self-consistent
  Le Bas+Hayduk-Laudie+Stokes-Einstein triple; the size ORDERING is the physically
  meaningful output: metformin (0.34) < primidone (0.41) < sulfamethoxazole (0.43)
  < gemfibrozil (0.48) ≈ atenolol/trimethoprim (0.49) < iopromide (0.67) nm.
  This reproduces the textbook NF story (metformin/primidone poorly rejected,
  iopromide strongly rejected).  Replace any `[ESTIMATE]` with a measured D_aq if
  one is later curated from an open primary.
- Raw PUG-View JSON retained under `data/tmp/_pugview/` for audit.
