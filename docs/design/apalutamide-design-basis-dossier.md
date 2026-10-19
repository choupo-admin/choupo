# Apalutamide film-coated tablets: a sourced design-basis dossier

For the project group re-basing `tutorials/plant/apalutamide01_tablets`.
Research done on 2026-10-19.  Every number below carries its source, how it
was obtained, and one confidence word:

* **stated**: read directly in the cited document, at the cited place.
* **derived**: computed here from stated numbers.  The arithmetic is shown.
* **estimate**: an engineering judgement or a secondary/indicative source.
  Replace it with a quotation or a measurement.
* **not found**: no public source was found.  The group must ask for it.

Documents read in full for the quality and process parts:

| Short name | Document | URL |
|---|---|---|
| EPAR-2018 | CHMP assessment report Erleada, EMA/879617/2018, 15 Nov 2018, section 2.2 "Quality aspects", pp. 12-19 | <https://www.ema.europa.eu/en/documents/assessment-report/erleada-epar-public-assessment-report_en.pdf> |
| EPAR-X28 | CHMP variation (line extension) assessment report EMEA/H/C/004452/X/0028/G, EMA/317740/2023, 22 Jun 2023, section 2.4, pp. 8-11 (the 240 mg strength) | <https://www.ema.europa.eu/en/documents/variation-report/erleada-h-c-004452-x-0028-g-epar-assessment-report-extension_en.pdf> |
| SmPC-EU | Erleada EPAR product information (SmPC and labelling, both strengths), sections 3, 6.1, 6.3, 6.5 and Annex II.A | <https://www.ema.europa.eu/en/documents/product-information/erleada-epar-product-information_en.pdf> |
| FDA-CMC | FDA NDA 210951 Product Quality (chemistry) review, 2018.  Heavily redacted "(b)(4)". | <https://www.accessdata.fda.gov/drugsatfda_docs/nda/2018/210951Orig1s000ChemR.pdf> |
| USPI | US prescribing information, DailyMed SPL setid d1cda4f7-cb33-46ea-b9ac-431f6452b1a5, version 29, published 6 Jul 2026, sections 3, 11, 16 | <https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=d1cda4f7-cb33-46ea-b9ac-431f6452b1a5> |
| PAT-HPMCAS | US 12,303,493 B2, "Anticancer compositions" (Aragon Pharmaceuticals / Janssen), the HPMCAS solid-dispersion family; priority EP 14196594.7 (5 Dec 2014); PCT/US2015/063661 (3 Dec 2015); Examples 3.1-3.3, 4.1, 6.1; claims 1-24 | <https://patents.google.com/patent/US12303493B2/en> |
| PAT-ACRYL | EP 3925598 B1, "Anticancer compositions" (ARN-509 + poly(meth)acrylate + HPMCAS); solvent paragraphs and Examples 3.1-3.2 | <https://patents.google.com/patent/EP3925598B1/en> |
| JNJ-10K | Johnson & Johnson Form 10-K for fiscal 2025, "Major Innovative Medicine therapeutic area sales" and "Sales to customers" by geographic area | <https://www.sec.gov/Archives/edgar/data/200406/000020040626000016/jnj-20251228.htm> |
| CMS-PtD | CMS "Medicare Part D Spending by Drug", data year 2024 (data.cms.gov API, Brnd_Name = Erleada) | <https://data.cms.gov/data-api/v1/dataset/7e0b4365-fd63-4a29-8f5e-e0ac9f66a81b/data?filter[Brnd_Name]=Erleada> |
| FDA-GEN | Conrad R, Lutter R. *Generic Competition and Drug Prices: New Evidence Linking Greater Generic Competition and Lower Generic Drug Prices*, FDA, Dec 2019, p. 2 | <https://www.fda.gov/media/133509/download> |
| ICH-Q3C | ICH Q3C(R8) Impurities: guideline for residual solvents, Table 2 (Class 2) and Appendix 1 | <https://database.ich.org/sites/default/files/ICH_Q3C-R8_Guideline_Step4_2021_0422_1.pdf> |
| GMP-3 / GMP-5 | EudraLex Vol. 4, EU GMP Part I, Chapter 3 (Premises and Equipment) and Chapter 5 (Production) | <https://health.ec.europa.eu/system/files/2016-11/chapter_3_0.pdf>, <https://health.ec.europa.eu/system/files/2016-11/chapter_5_0.pdf> |
| WHO-HVAC | WHO TRS 1010 (2018) Annex 8, *Guidelines on heating, ventilation and air-conditioning systems for non-sterile pharmaceutical products*, sections 4.4, 4.5, 7.4-7.7 | <https://gmp-compliance.org/files/guidemgr/TRS1010annex8.pdf> (copy of the WHO text; WHO page: <https://www.who.int/publications/m/item/Annex-8-trs-1010>) |

Not reachable from this session: the TGA AusPAR
(<https://www.tga.gov.au/sites/default/files/auspar-apalutamide-190325.pdf>; the server returned an empty reply or 403),
and the Janssen safety data sheet behind J&J Medical Connect's role gate.
The README cites the AusPAR.  Read it before the next revision.

---

## 1. What the public record says about the product

### 1.1 Strengths, dose, appearance, packs

| Item | Value | Source | How | Confidence |
|---|---|---|---|---|
| Daily dose | 240 mg once daily (4 x 60 mg or 1 x 240 mg) | SmPC-EU 4.2 and 4.4 ("per 240 mg dose (4 tablets)" / "(1 tablet)"); USPI 2 and 14 (TITAN: "240 mg once daily") | read | stated |
| Strengths | **60 mg** (EU authorised 14 Jan 2019) and **240 mg** (EU line extension 2023; US available Apr 2023) | SmPC-EU 1, 9; EPAR-X28 2.4.1; USPI 11 | read | stated |
| 60 mg tablet | oblong, slightly yellowish to greyish green, **17 mm x 9 mm**, debossed "AR 60" (EPAR-2018 p. 12: 16.7 mm long) | SmPC-EU 3; EPAR-2018 2.2.1 | read | stated |
| 240 mg tablet | oval, bluish grey to grey, **21 mm x 10 mm**, debossed "E240" | SmPC-EU 3 (240 mg); EPAR-X28 2.4.3.1 | read | stated |
| Release type | immediate release; BCS class 2; "enabling technology" for solubility | EPAR-2018 2.2.3 | read | stated |
| Shelf life | 3 years (EU), both strengths; 24 months US at grant | SmPC-EU 6.3; FDA-CMC p. 6 | read | stated |
| EU packs, 60 mg | HDPE bottle of **120** tablets with **6 g** silica-gel desiccant, PP child-resistant closure; PVC-PCTFE/Al blister in child-resistant wallets: **112** (4 x 28) or **120** (5 x 24) | SmPC-EU 6.5 | read | stated |
| EU packs, 240 mg | HDPE bottle of **30** with **2 g** desiccant; transparent PVC-PCTFE/Al blisters: 28 (2 x 14), 30 (3 x 10), 84 (6 x 14) | SmPC-EU 6.5 (240 mg) | read | stated |
| US packs | 60 mg: bottle of 120 (NDC 59676-600-12); 240 mg: bottle of 30 (NDC 59676-604-30); 160 cc HDPE bottle for the 60 mg | USPI 16; FDA-CMC p. 5 | read | stated |
| EU batch-release site | Janssen Cilag SpA, Borgo San Michele, **Latina, Italy** | SmPC-EU Annex II.A | read | stated |

### 1.2 Qualitative composition (the regulator's list)

| Strength | Core | Film coat | Source | Confidence |
|---|---|---|---|---|
| 60 mg | colloidal anhydrous silica, croscarmellose sodium, hypromellose acetate succinate (HPMCAS), magnesium stearate, microcrystalline cellulose (MCC), silicified MCC (SMCC) | iron oxide black, iron oxide yellow, macrogol (PEG), poly(vinyl alcohol) partially hydrolysed, talc, titanium dioxide | SmPC-EU 6.1; USPI 11 | stated |
| 240 mg | silica, croscarmellose sodium, HPMCAS, magnesium stearate, **SMCC only (no plain MCC)** | glycerol monocaprylocaprate, iron oxide black, PVA, talc, TiO2, **macrogol-poly(vinyl alcohol) grafted copolymer** (no free PEG, no yellow oxide) | SmPC-EU 6.1 (240 mg); EPAR-X28 2.4.1 and p. 9 ("similar to the 60 mg ... but does not contain cellulose microcrystalline"); USPI 11 | stated |

### 1.3 The process the regulators describe

| Fact | Source | Confidence |
|---|---|---|
| "a multistep process comprising preparation of intermediate, pre-blending, granulation, post granulation blending and lubrication, film-coating and packaging" (compression is not named in that sentence, but the product is a compressed tablet) | EPAR-2018 2.2.3 p. 16; the same sentence in EPAR-X28 2.4.3.2 | stated |
| ONE drug-product intermediate with its own specification.  NIR measures its water content and solid state.  The CPPs are the intermediate's process parameters ("they can affect stability and dissolution") | EPAR-2018 p. 16-17 | stated |
| The intermediate is the amorphous dispersion: "Ensuring and maintaining the solid state of the intermediate is important for the bioavailability"; XRD, mDSC, DVS, NIR | EPAR-2018 p. 15 | stated |
| The intermediate is made by **spray drying with HPMCAS** | Not stated in EPAR-2018, EPAR-X28 or FDA-CMC (all redacted).  Stated by a secondary review: Pandi P et al., *Materials* 16 (2023) 6616, section 3.1 and Table 2 ("the ASD of apalutamide by using HPMCAS through spray drying"), <https://pmc.ncbi.nlm.nih.gov/articles/PMC10608006/> | stated (secondary); consistent with the patent below |
| Intermediate packed in an LDPE bag inside an aluminium-laminated bag.  Stable 12 months; aged intermediate (12 months at 30 °C/75 % RH) still gives conforming tablets; expiry counted from the date the intermediate is mixed with the excipients | EPAR-2018 p. 15 and 17; EPAR-X28 2.4.3.4 | stated |
| Bulk coated-tablet hold time of **12 months** in a closed LDPE bag in a heat-sealed Al-laminated bag, in a drum | EPAR-2018 p. 17 | stated |
| Validated on **three commercial-scale batches** (tablets) and three intermediate batches "for the intended commercial batch sizes" | EPAR-2018 p. 17; EPAR-X28 p. 10 | stated |
| **Commercial batch sizes** (kg, tablets) | redacted in every public document | **not found** |
| Active substance as supplied: Form B (thermodynamically stable anhydrous polymorph), white to slightly yellow, non-hygroscopic, mp 194-196 °C; double antistatic LDPE bags in a drum | EPAR-2018 2.2.2; FDA-CMC p. 5 | stated |
| The particle size of the API does not affect the finished product, so it has no particle-size specification | EPAR-2018 p. 14-15 | stated |

The two 12-month holds matter for the design.  They decouple the spray-dried
intermediate from the tablet train, and the coated tablets from packaging.
The campaign structure in section 4 relies on them.

### 1.4 The quantitative formulation: the Janssen patent example

The regulators redact the quantities.  The originator's own patent gives a
complete commercial-type example.  It matches the 60 mg qualitative
composition **ingredient for ingredient**: silica, croscarmellose, MCC, SMCC,
magnesium stearate, HPMCAS, and an Opadry II PVA coat.  PAT-HPMCAS,
Examples 3.1-3.3:

**Example 3.1: spray-dried dispersion (SDD), ARN-509 : HPMCAS-LG 1:3**

| Component | Amount | Per cent | Confidence |
|---|---|---|---|
| apalutamide (ARN-509) Form B | 2 500 g | 25 % of solids | stated |
| HPMCAS **LG** (granular grade; Shin-Etsu AQOAT) | 7 500 g | 75 % of solids | stated |
| dichloromethane (removed) | 76 000 g | solvent 40 % w/w | stated |
| methanol (removed) | 114 000 g | solvent 60 % w/w | stated |
| solids in the spray solution | 10 000 / 200 000 g | **5.0 wt %** | derived |
| Dryer | **Niro (GEA) PSD-3, high-pressure nozzle** | | stated |
| Feed rate | **75 kg/h** | | stated |
| Outlet temperature | **46 °C** | | stated |
| Condenser temperature | **-9 °C** | | stated |
| Secondary drying | tray dryer, **vacuum, nitrogen flow, 40 °C** | | stated |
| Inline filtration of the solution | "GRID filter"; the mixture is "yellowish viscous turbid" | | stated |
| Batch | 10 kg SDD (a development/clinical scale) | | stated |

**Example 3.2: tablet core, 60 mg (amounts for 30 000 tablets)**

| Component | g / 30 000 | **mg / tablet** | Split | Confidence |
|---|---|---|---|---|
| SDD (1:3) | 7 200 | **240.0** (= 60 mg API) | intragranular | stated / derived |
| colloidal anhydrous silica | 273 | **9.1** | 10/13 intra (7.0), 3/13 extra (2.1) | stated / derived |
| croscarmellose sodium | 1 050 | **35.0** | 1/2 intra (17.5), 1/2 extra (17.5) | stated / derived |
| microcrystalline cellulose | 8 865 | **295.5** | **all intragranular** | stated / derived |
| silicified MCC | 3 507 | **116.9** | **all extragranular** | stated / derived |
| magnesium stearate (vegetable grade) | 105 | **3.5** | **all extragranular** (final lubrication) | stated / derived |
| **Core** | 21 000 | **700.0 mg** | intragranular 560.0 mg (80.0 %) | derived |

Process (stated): SDD sieved and blended with 10/13 of the silica.  Then
1/2 of the croscarmellose and all the MCC are added and blended.  Dry
granulation by **roller compaction**.  The SMCC, the remaining croscarmellose
and the remaining silica are sieved, added and blended.  Magnesium stearate
is sieved, added and blended.  Compression on "a suitable tablet press".

**Example 3.3: film coat**

| Component | Amount (batch of 857 tablets) | Per tablet | Confidence |
|---|---|---|---|
| cores | 599.9 g | 700 mg | stated |
| Opadry II 85F210036 Green | 17.997 g | **21.0 mg = 3.0 % weight gain** | stated / derived |
| purified water (removed) | 71.988 g | suspension **20.0 wt %** solids | derived |
| **Coated tablet** | | **721 mg** | derived |

Opadry II 85F is Colorcon's PVA-based system: PVA, PEG, talc, TiO2 and
colourants.  The exact percentages are proprietary and **not found**.  The
case's split (PVA 40 / PEG 20 / TiO2 24.2 / talc 14.8 / iron oxide 1) is a
plausible **estimate**.  Ask Colorcon for the certificate of composition of
the shade.  Sources for the family:
<https://www.colorcon.com/markets/pharmaceuticals/film-coatings/immediate-release/opadry-ii>,
and *Molecules* 29 (2024) 386 for an 85F composition.

**Caveat on Examples 3.1-3.3.**  This is the originator's example, not the
registered commercial recipe; the EU dossier redacts that recipe.  The match
is exact qualitatively, and the 1:3 ratio, the 60 mg dose and "SDD 20-40 % of
the tablet" (claim 21: 240/700 = 34 %) all fall inside the claims.  Treat the
quantities as **"stated in the originator's patent example, consistent with
but not confirmed as the registered formula"**.  An industry reviewer will
accept that wording.

**Other solvent systems the same patent family discloses** (relevant to the
solvent choice, section 3.3):

* acetone alone, at 1 g SDD per 19 g acetone (**5 wt %** solids), lab Büchi
  dryer, outlet 46-49 °C, condenser -15 to -21 °C, for HPMCAS-**LF** 1:2 and
  1:3 (PAT-HPMCAS Examples 4.1 and 6.1; stated).
* methanol/acetone 1:9 w/w and methanol/dichloromethane 6:4 or 5:5, with
  "methanol and dichloromethane 6:4 (w:w) or 5:5 (w/w), 6:4 (w:w) being
  preferred" (PAT-HPMCAS description; the same solvent paragraph appears in
  PAT-ACRYL; stated).

### 1.5 The 240 mg tablet

The tablet is made from an intermediate "which delivers 240 mg of
apalutamide per tablet".  The applicant refers back to the 60 mg
intermediate's development, which suggests the same SDD (EPAR-X28 p. 9).
The 240 mg formulation (code G043) is bioequivalent to 4 x 60 mg (G023).

Its quantitative composition and tablet weight are **not found**.  If it uses
the same 1:3 SDD it carries 960 mg of SDD.  At the 60 mg tablet's 34 % SDD
loading the tablet would weigh 2.8 g, which a 21 x 10 mm oval cannot hold.
So the 240 mg tablet must be far more concentrated in SDD (roughly 65-75 %,
about 1.3-1.5 g; **estimate**), or use a different drug load.  **Do not
design a 240 mg line without asking for the composition.**  This is a good
reason to base the case on the 60 mg tablet, whose recipe is public.

---

## 2. Hazard, containment and GMP premises

| Item | Value | Source | Confidence |
|---|---|---|---|
| GHS classification of apalutamide (supplier SDS) | Acute Tox. 4 (H302), **Repr. 1B (H360)**, **STOT RE 2 (H373, male reproductive organs)**, Aquatic Chronic 1 | MedKoo Biosciences SDS, rev. 11 Jun 2020, sections 2-3, <https://www.medkoo.com/uploads/product/Apalutamide__ARN-509_/safety/SDS-Apalutamide.pdf> | stated |
| Janssen's own SDS (Erleada 240 mg tablet, v8.1, 23 Feb 2025) | indexed as Skin Sens. 1, Repr. 1B, STOT RE 2 | search-engine summary of <https://www.jnjmedicalconnect.com/media/attestation/products/erleada/erleada-safety-data-sheet-sds-240-mg-tablet.pdf> (role-gated, not opened) | estimate (not read) |
| **Occupational exposure limit / band** | MedKoo: "Contains no substances with occupational exposure limit values" | MedKoo SDS section 8 | **not found** (no OEL published) |

**What to ask.**  Ask the API supplier and Janssen for the internal OEL
(µg/m³, 8-h TWA), the OEB, the health-based exposure limit (PDE, for
cleaning validation) and the wipe/surface limit.  A Repr. 1B compound is
handled as potent by most companies.  Assuming OEB 3-4 (roughly 1-100
µg/m³) until told otherwise is an **estimate**, not a fact.

**What applies to oral solids:**

* **EU GMP Annex 1 does not apply.**  It is the sterile annex.  Its A-D
  grades are not a requirement for tablets.  Calling OSD rooms "Grade D"
  invites a reviewer's objection.
* **EU GMP Part I Chapter 3** (GMP-3) applies:
  * 3.6: cross-contamination prevented by design and operation commensurate
    with risk (quality risk management); dedicated facilities when the risk
    cannot be controlled or the toxicological limits cannot be measured.
  * 3.12: production areas "effectively ventilated ... appropriate both to
    the products handled".
  * 3.13: weighing in a separate weighing room.
  * 3.14: specific provisions where dust is generated (sampling, weighing,
    mixing, processing, packaging of dry products).
* **EU GMP Part I Chapter 5**, 5.18-5.21 (GMP-5): a QRM process including a
  potency and toxicological evaluation, which is the HBEL.  The supporting
  document is the EMA *Guideline on setting health based exposure limits
  for use in risk identification in the manufacture of different medicinal
  products in shared facilities* (EMA/CHMP/CVMP/SWP/169430/2012), cited by
  title only.
* **Annex 15** (qualification and validation) applies to the equipment, the
  HVAC and cleaning validation.  Cited by title.
* **WHO TRS 1010 Annex 8** (WHO-HVAC), the one public HVAC guide written
  for non-sterile products:
  * 4.5: the manufacturer decides the cleanliness level and states whether a
    classification is "as-built", "at-rest" or "operational".
  * 7.5: airflow "from the corridor to the cubicle".
  * 7.7: "for rooms where dust is liberated, the corridor should be
    maintained at a higher pressure than the rooms and the rooms at a higher
    pressure than atmospheric pressure".
  * 4.4: facilities normally positive to outside.
* **ISPE Baseline Guide Vol. 2, *Oral Solid Dosage Forms*** (3rd ed.) and
  ISPE Good Practice Guide *HVAC*: cited by title only (not open access).
  Common industry practice is "controlled not classified" (CNC) for OSD
  suites, sometimes with an ISO 14644-1 ISO 8 at-rest company target.  That
  practice is an **estimate**: it comes from no document read here.

The case's cascade (dust rooms +15 Pa, suite corridor +25 Pa, bubble airlock
+45 Pa, everything positive to outside) is **consistent with WHO-HVAC 7.7**.
The 10 Pa step it borrows from Annex 1 should be re-attributed: WHO-HVAC
7.4-7.6 asks for an individually assessed differential with no overlap of
the operating ranges.  It gives no number.

---

## 3. Market, demand and price

### 3.1 Sales (net, as reported by the originator)

| Item | 2025 | 2024 | 2023 | Source | Confidence |
|---|---|---|---|---|---|
| Erleada worldwide sales, USD M | **3 574** | 2 999 | 2 387 | JNJ-10K, Innovative Medicine, Oncology | stated |
| of which U.S., USD M | **1 453** | 1 282 | 1 065 | JNJ-10K | stated |
| of which International, USD M | **2 121** | 1 717 | 1 322 | JNJ-10K | stated |
| J&J company-wide sales, Europe / all non-US, USD M | 21 535 / 40 441 | | | JNJ-10K "Sales to Customers" by area | stated |
| Erleada on the US Medicare negotiation list for 2028 | yes | | | JNJ-10K (CMS Selected Drug List published Jan 2026) | stated |
| US ANDA litigation (Lupin, Hetero); Canadian NOC litigation (Sandoz) | ongoing | | | JNJ-10K, legal proceedings | stated |

J&J does not report Erleada sales by region within "International".  The
European share below is an **estimate**: J&J's company-wide European share
of non-US sales, 21 535 / 40 441 = 53.3 %, applied to Erleada.

### 3.2 Prices per daily dose (240 mg)

| Market / price type | Figure | Per 60 mg tablet | Per day (240 mg) | Source | Confidence |
|---|---|---|---|---|---|
| UK, NHS indicative (list) price, ex-VAT, 112 x 60 mg | £2 735 | £24.42 | **£97.68** | NHSBSA dm+d AMPP 36746311000001108 (Feb 2026 release), <https://openprescribing.net/dmd/ampp/36746311000001108/>; NICE TA741 section 2 (a confidential simple discount exists) | stated; per-tablet derived |
| Germany, pharmacy retail price (AVP, incl. 19 % VAT), 112 x 60 mg | €2 684.84 | €23.97 | €95.89 | Shop Apotheke / DocMorris listings, PZN 14261678 | stated (retail listing) |
| Germany, **manufacturer's ex-factory price (ApU)**, back-calculated from the AVP with the statutory margins (wholesale +3.15 % capped at €37.80, +€0.73; pharmacy +3 %, +€9.00 +€0.21 +€0.20; VAT 19 %) | **≈ €2 143** | **≈ €19.13** | **≈ €76.5** | AMPreisV §2(1) and §3(1), <https://www.gesetze-im-internet.de/ampreisv/> | derived (±1 %; the Lauer-Taxe ApU is the primary figure, ask a pharmacist) |
| Germany, statutory manufacturer rebate on patented drugs (§130a SGB V) | 7 % of ApU | | ≈ €71 net | §130a SGB V | estimate (from memory; verify) |
| US Medicare Part D, 2024, **gross** spending | $1 386.3 M; 95 580 claims; 13 253 beneficiaries; $14 504 per claim | | ≈ **$483** (a claim ≈ 30 days) | CMS-PtD | stated; per-day derived |
| US launch price (2018) | $10 920 / month | | $364 | Scrip (Citeline), 2018 news item on the nmCRPC approval (secondary) | stated (secondary) |

**Gross-to-net, in one line.**  Medicare's 2024 *gross* Part D spending on
Erleada ($1 386 M) exceeds J&J's *entire* 2024 US *net* sales ($1 282 M).
The difference is the rebates and discounts the manufacturer pays.  A
manufacturer's NPV must use the **net ex-factory price** it actually
receives: the German ApU less statutory rebates, the UK price less the
confidential PAS discount, or a tender price.  It must never use a retail,
list or "cost to patient" figure.

**Strength mix (US Medicare, derived).**  2024 dosage units per claim =
8 737 751 / 95 580 = 91.4.  If every claim is 30 days at full dose, 60 mg
claims carry 120 units and 240 mg claims carry 30.  So the 240 mg share of
claims = (120 - 91.4) / 90 = **32 %**.  **Derived**, under that assumption.

### 3.3 European demand: the arithmetic

```
Erleada International 2025              = 2 121 M USD                 (stated)
x European share (company-wide proxy)   = 0.533                       (estimate)
= Europe                                ≈ 1 129 M USD
x 0.92 EUR/USD (the case's usdToEur)    ≈ 1 039 M EUR
/ net ex-factory price per patient-day  = 75 EUR  (German ApU ≈ 76.5 less rebates; range 60-100)
= patient-days per year                 ≈ 13.9 M   (range 10.4 - 17.3 M)
= patient-years                         ≈ 38 000   (28 000 - 47 000)
x 0.240 g API per day                   ≈ 3.3 t API / yr   (2.5 - 4.2)
= in 60 mg tablets                      ≈ 55 M / yr        (42 - 69 M)
```

Confidence: **derived from an estimate**.  The two soft inputs are the
European share and the net price per day.  Say so in the report.

### 3.4 Generic price erosion: the published evidence

Generic price as a share of the brand price before generic entry, median over
US products with first generic entry 2015-2017.  Source: FDA-GEN p. 2,
stated.

| Generic producers | 1 | 2 | 4 | 6+ |
|---|---|---|---|---|
| Price cut vs brand (AMP basis) | 39 % | 54 % | 79 % | > 95 % |
| Price cut vs brand (invoice basis) | 31 % | 44 % | 73 % | > 95 % |

Applied to the German ex-factory reference of €19.13 per 60 mg tablet:

| Competitors | Price per 60 mg tablet (derived) |
|---|---|
| 1 | ≈ €11.7 |
| 2 | ≈ €8.8 |
| 4 | ≈ €4.0 |
| 6+ | < €0.96 |

US data, so it is an **estimate** for Europe.  European generic markets with
tendering are often steeper.

### 3.5 API price (bought)

| Item | Value | Source | Confidence |
|---|---|---|---|
| Average recorded price, all order sizes, 12 months to 31 May 2026 | **US$ 8 452 /kg** (about €7 780/kg at 0.92) | Pharmaoffer, "Apalutamide API price and transactions", <https://pharmaoffer.com/api-excipient-supplier/transactions/apalutamide> | stated (aggregator; masked per-shipment) |
| Volume behind it | 463 kg in 12 months, 128 transactions, India 69 % of exports; no shipment > 100 kg | same | stated |
| PharmaCompass "reference price" | US$ 8 224/kg (undated) | <https://www.pharmacompass.com/prescriptions/apalutamide> | estimate |

These are **pre-generic development quantities**: small lots for
bioequivalence and validation.  A tonne-scale contract price is
**not found**.  Ask two or three DMF holders for a dated quotation at the
plant's annual tonnage.  The case's €10 000/kg is of the right order for
today's small-lot market.  It is probably high for a tonne-scale contract.

### 3.6 Exclusivity: the fact that decides the business model

* The HPMCAS solid-dispersion patent family (PAT-HPMCAS) claims exactly
  this product.  Claim 1: an ARN-509/HPMCAS solid dispersion.  Claim 4:
  1:3.  Claim 10: spray drying.  Claims 18 and 20: 60 mg and 240 mg.
* US 12,303,493 is **active**.  Its anticipated expiry is **3 Dec 2035**
  (Google Patents legal-status, an assumption by Google, not a legal
  conclusion).
* EP counterparts exist: EP 3226841 B1 and the acrylate family EP 3925598 B1
  and EP 3842034 B1.  Their EU status and SPCs were **not verified**.
* The EU regulatory data/market protection runs from first authorisation on
  **14 Jan 2019** (8 + 2 (+1) years under Reg. 726/2004 Art. 14(11)).
  Statement of the rule from memory: **estimate**; verify the exact dates.

**Consequence.**  A plant that copies the Janssen formulation and sells
generics before about 2035 infringes, unless the patents fall.  US generics
are being litigated now (JNJ-10K).  The group must choose and **state** its
business case:

* **(A) Contract manufacturer (CMO) / second supply site for the
  originator.**  The legal route today.  Revenue is a **conversion (toll)
  fee per tablet**, often with client-owned API.  No public fee was found:
  **not found**.  Ask a CDMO.
* **(B) Generic entrant at loss of exclusivity** (about 2035 in the US;
  verify the EU).  Revenue = generic net price × share.  The project NPV
  starts at launch, not today.
* **(C) A non-infringing design-around** (another polymer or process).  It
  needs its own bioequivalence and is a formulation-development project, not
  a plant design.

---

## 4. The recommended design basis

### 4.1 Scope (the group may change it; it must state it)

| Decision | Recommended value | Why | Confidence |
|---|---|---|---|
| Business case | (B) a generic entrant to the European market at loss of exclusivity, or (A) with a toll fee | section 3.6 | the group's choice |
| Product | **Apalutamide 60 mg film-coated tablets** (Ex. 3.2-3.3 recipe) | the only strength whose quantitative recipe is public; 240 mg recipe not found | stated basis |
| Market share | **25 % of European volume** | a typical 3-4-entrant generic share (estimate) | estimate |
| Annual output | **14 M tablets of 60 mg ≈ 3.5 M patient-days** (25 % of the 13.9 M of section 3.3); say 15 M for capacity with reject margin | derived | derived from estimate |
| API | 15 M × 60 mg = **0.90 t/yr** | | derived |
| SDD | 15 M × 240 mg = **3.6 t/yr** | | derived |
| Final blend | 15 M × 700 mg = **10.5 t/yr** | | derived |
| Coated tablets | 15 M × 721 mg = **10.8 t/yr** | | derived |
| Packs | blister wallet **112 tablets (28-day)**: 15 M / 112 ≈ **134 000 cartons/yr**; and/or bottles of 120 + 6 g desiccant | SmPC-EU 6.5 | derived |

For comparison, the current case's 50 M tablets/yr (3.0 t API) is
**≈ 90 % of the estimated whole European volume** (55 M).  That is not "a
mid-sized generic line".

### 4.2 Spray-dried dispersion (the intermediate)

| Parameter | Value | Source | Confidence |
|---|---|---|---|
| Drug : polymer | **1 : 3** apalutamide : HPMCAS-**LG** | PAT-HPMCAS Ex. 3.1, claim 4, claim 9 | stated (patent) |
| Solvent, patent scale-up example | **DCM / methanol 40 : 60 w/w** | PAT-HPMCAS Ex. 3.1 | stated (patent) |
| Solvent, patent alternatives | acetone (HPMCAS-LF, lab); methanol/acetone 1:9; methanol/DCM 5:5 or 6:4 | PAT-HPMCAS description, Ex. 4.1, 6.1 | stated (patent) |
| Commercial solvent | redacted | EPAR-2018, FDA-CMC | **not found** |
| Solids in feed | **5 wt %** | PAT-HPMCAS Ex. 3.1, 4.1, 6.1 (all three) | derived from stated |
| Atomisation | **pressure nozzle** | PAT-HPMCAS Ex. 3.1 | stated |
| Dryer scale | GEA Niro **PSD-3** at **75 kg/h feed** → 3.75 kg/h SDD, 71 kg/h solvent | PAT-HPMCAS Ex. 3.1 | stated / derived |
| Commercial SDD dryers in industry | "commercial-scale PSD-3" (Hovione, East Windsor NJ, 2026); PSD-4 for larger commercial products | pharmtech.com / pharmamanufacturing.com news on Hovione's 89 Twin Rivers facility, Sept 2026 | stated (trade press) |
| Gas | closed-cycle nitrogen (an organic solvent) | GEA Niro PSD-1/PSD-4 facility note, BioSpace | stated (vendor) |
| Outlet temperature | **46 °C** (DCM/MeOH); 46-49 °C (acetone, lab) | PAT-HPMCAS | stated |
| Inlet temperature | not given | | **not found** (set by the energy balance on the outlet) |
| Condenser | **-9 °C** (PSD-3); -15 to -21 °C (lab) | PAT-HPMCAS | stated |
| Secondary drying | vacuum tray (or agitated/conical) dryer, **N2 sweep, 40 °C** | PAT-HPMCAS Ex. 3.1 | stated |
| Residual solvent limits | DCM **600 ppm** (Class 2, PDE 6.0 mg/day); methanol **3 000 ppm** (Class 2, 30 mg/day); acetone **5 000 ppm** (Class 3) | ICH-Q3C Table 2 and Appendix 1 | stated |
| Hours on a PSD-3 at the patent rate for 3.6 t/yr | 3 600 / 3.75 ≈ **960 h/yr** spray time, before set-up, cleaning and secondary drying | | derived |
| SDD lot size | **100-200 kg** per lot (≈ 27-53 h of spraying) → 18-36 lots/yr | engineering choice | estimate |
| Intermediate packaging and hold | LDPE in Al-laminated bag; ≤ 12 months | EPAR-2018 | stated |

### 4.3 Granulation, compression, coating, packaging

| Step | Lot / rate (recommended) | Source of the scale | Confidence |
|---|---|---|---|
| Final-blend lot | **400 kg** = 571 000 tablets → ~26 lots/yr; a 1 000-1 200 L IBC/bin blender for the pre-blend and the final blend | no public batch size (redacted); IBC blending is common practice | estimate |
| Pre-blend (intragranular) | 560 mg/tablet = 320 kg per 400 kg lot | Ex. 3.2 split | derived |
| Roller compaction | a production compactor rated **100-400 kg/h** (Gerteis MINI-PACTOR max 100 kg/h; MACRO-PACTOR max 400 kg/h) → 320 kg in ~1-3 h | Gerteis product page, <https://www.gerteis.com/products/> | stated (vendor maxima) |
| Compression | a mid-size rotary press; for a 17 x 9 mm oblong (D tooling) a realistic **80 000-150 000 tablets/h**; 571 000 tablets ≈ 4-7 h per lot; ≈ 100-190 h/yr | Fette FE55 max 626 400 tablets/h with 87 B-tooling stations (vendor listing, pharmaceutical-tech.com); the derating to D tooling is an estimate | stated (max) / estimate |
| Film coating | perforated pan, **≈ 150-400 kg cores per load**; 400 kg lot = one large or two medium loads; 3 % w.g. from 20 % solids Opadry II suspension (12 kg solids + 48 kg water per 400 kg) | coater sizes: used-equipment listings, e.g. Vector Hi-Coater HCF-130, 120-140 kg input; Ex. 3.3 for the suspension | estimate (sizes) / derived (suspension) |
| Bulk coated-tablet hold | ≤ 12 months, LDPE + Al-laminate in drums | EPAR-2018 | stated |
| Packaging | thermoform blister (PVC-PCTFE/Al) into child-resistant wallets (4 x 28) + carton + serialisation (EU FMD), or HDPE bottle line with induction seal + desiccant canister | SmPC-EU 6.5 | stated (pack); line speed **not found** (ask a vendor) |

**Campaign structure (recommended).**  The intermediate and the tablets are
two different campaigns, decoupled by the 12-month hold.

1. SDD campaigns, a few per year on one dryer: about 960 h of spraying plus
   cleaning.
2. Tablet campaigns of several 400 kg lots: blend → compact → mill/screen →
   final blend → compress → coat, about 1-2 days per lot per step.
3. Packaging campaigns sized by market orders.

A single steady "campaign rate" for the whole plant (the current case)
cannot represent this.  The spray dryer is busy about ten times longer than
the tablet press.

### 4.4 Selling-price basis for the NPV

* Use a **net ex-factory price per tablet**, never a retail, list or
  patient price.
* **Originator reference (the ceiling):** German ApU ≈ **€19.13 per 60 mg
  tablet** (€76.5/day; derived).  The UK list is £24.42/tablet, less a
  confidential discount.
* **Scenario (B), generic:** price = ceiling × (1 − FDA-GEN erosion) at the
  assumed number of competitors.  For 4 competitors, **≈ €4.0 per 60 mg
  tablet**; for 6+, **< €1.0**.  Run the NPV at both and declare the year
  of entry.
* **Scenario (A), CMO:** a toll fee per 1 000 tablets with client-owned API
  (**not found**; ask a CDMO).  The API then leaves the raw-material line.
* **The case's €1.00/tablet** equals the "6+ competitors, mature generic"
  floor.  It is defensible only if stated so.  At €7 780-10 000/kg the API
  alone costs €0.47-0.60 per tablet.

### 4.5 Facility benchmarks

| Item | Value | Source | Confidence |
|---|---|---|---|
| Mayne Pharma (Greenville NC) commercial OSD plant with potent-compound containment | **$80 M, 126 000 ft² (≈ 11 700 m²), capacity "over 1 billion doses"** → ≈ $6 800 per m² all-in, ≈ $0.08 of capital per dose of annual capacity (if the capacity is annual) | DCAT Value Chain Insights news item (undated), <https://www.dcatvci.org/top-industry-news/mayne-pharma-opens-80-million-oral-solid-dose-mfg-facility/> | stated; ratios derived |
| Purdue Pharma (Durham NC) OSD plant | $59 M, 150 000 ft² | PharmaFocusAsia (secondary) | stated (secondary) |
| OSD construction cost per m² (building only) | — | | **not found** in an authoritative study; ask an EPCM contractor |

The case's €11 M for 1 800 m² (€6 100/m², building only) sits at the
all-in level of Mayne's plant, which includes equipment.  That is high for a
building alone, but of the right order.

---

## 5. RED TEAM: the current case against this dossier

Ranked by severity, worst first.  "Fatal" means an industry reviewer stops
reading.

1. **FATAL: the business case is unstated, and as written it infringes.**
   The README calls it "a mid-sized generic line" and the NPV runs from
   construction now for 10 years.  The 1:3 HPMCAS SDD of apalutamide is
   claimed by an active Janssen patent family (US 12,303,493, anticipated
   expiry 3 Dec 2035) and is under ANDA litigation (JNJ-10K).
   *Remedy:* declare scenario (A) CMO with a toll fee, or (B) generic launch
   at loss of exclusivity, with the NPV starting at launch.  Add one
   paragraph on patents and regulatory exclusivity.

2. **FATAL: the volume is about 90 % of Europe, not "a mid-sized line".**
   50 M tablets of 60 mg is 3.0 t API, 12.5 M patient-days.  The estimated
   whole European volume is 13.9 M patient-days, 55 M tablet-equivalents
   (section 3.3).
   *Remedy:* derive the volume from the market (section 3.3) with a stated
   share.  The recommendation is 14-15 M tablets/yr for 25 %.

3. **HIGH: the price is unsourced, and its meaning is undefined.**  €1.00
   ex-factory sits against an originator ex-factory of ≈ €19.13/tablet.
   *Remedy:* replace the "round figure" with section 4.4.  Run €4.0
   (4 competitors) and < €1.0 (6+) as two cases, cite FDA-GEN and the
   AMPreisV-derived ApU, and state that it is net ex-factory.

4. **HIGH: the formulation contradicts the originator's published recipe.**

   | | Case | Patent Ex. 3.2-3.3 |
   |---|---|---|
   | Core | 580 mg | **700 mg** |
   | MCC | 150 mg | **295.5 mg, all intragranular** |
   | SMCC | 150 mg intragranular | **116.9 mg, all extragranular** |
   | Croscarmellose | 30 mg (20 + 10) | **35 mg (17.5 + 17.5)** |
   | Silica | 5 mg | **9.1 mg (7.0 + 2.1)** |
   | Mg stearate | 5 mg, half intragranular | **3.5 mg, all extragranular** |
   | Coated tablet | ~600 mg | **721 mg** |

   The coat (3 % w.g., 20 % solids) already matches the patent.
   *Remedy:* adopt the Ex. 3.2-3.3 numbers with the patent as the citation,
   and move the SMCC and all the Mg stearate to the final blender.

5. **HIGH: the solvent and the solids content.**  The case uses acetone at
   10 wt %.  The originator's scale-up example uses DCM/MeOH 40:60 at
   5 wt %; its acetone examples are lab-scale, HPMCAS-LF, also 5 wt %.
   Acetone is defensible, since it is a patent-exemplified, Class 3 solvent
   that Choupo's one-solvent dryer can model.  But it must be argued, not
   assumed, and 10 % solids doubles the patent value without a viscosity
   measurement.
   *Remedy:* cite PAT-HPMCAS Ex. 4.1/6.1 for acetone and state that the
   commercial solvent is not public.  Set 5 wt % (or justify 10 % with a
   measured viscosity).  Add the ICH Q3C limit (5 000 ppm) as the
   secondary-drying target.  Note what DCM/MeOH would change: a Class 2
   limit, DCM's toxicity and emissions, methanol's flammability zones.  The
   engine's single-solvent limit is the reason acetone was kept.

6. **HIGH: one steady rate for the whole plant misrepresents a campaign
   plant.**  12 800 tablets/h over 3 942 h/yr is a small laboratory press
   rate.  A commercial press does that in minutes.  Meanwhile the spray
   dryer is the bottleneck: about 3 200 h/yr at the PSD-3 patent rate for
   the case's 12 t/yr of SDD.
   *Remedy:* give each section its own hours (section 4.3).  At minimum,
   solve the SDD section and the tablet section at their own campaign rates,
   and state the decoupling holds (EPAR-2018: 12 months for both the
   intermediate and the bulk tablets).

7. **MEDIUM-HIGH: the spray-dryer operating point is far from the
   precedent.**  The case's exhaust is 347 K (74 °C) from a 120 °C inlet;
   the patent runs at a 46-49 °C outlet.  An outlet near or above the wet
   dispersion's Tg risks sticking and phase separation.  The case also uses
   a rotary wheel, where the patent uses a pressure nozzle (the normal SDD
   atomiser).
   *Remedy:* lower the inlet temperature or raise the feed until the outlet
   is ≈ 45-50 °C, and cite the patent.  Switch to the pressure nozzle:
   Choupo's sprayDryer already offers it (`operation { atomiser { model ...; } }`,
   rotary / pressure-swirl / twin-fluid; registry at
   `src/unitOperations/UnitOperation.cpp:214`), so the rotary wheel has no
   reason to stay.

8. **MEDIUM-HIGH: there is no secondary drying.**  The patent's step is a
   vacuum tray dryer with N2 at 40 °C; the residual-solvent test is a
   release test (ICH Q3C).  The README admits the gap, but the capital and
   the hours omit the equipment.
   *Remedy:* add the secondary dryer as a quoted item with its hours.

9. **MEDIUM: the product range.**  The case makes 60 mg only.  Since 2023
   the 240 mg once-daily tablet exists; it was about 32 % of US Medicare
   claims in 2024 (derived), and it has a different core (no MCC) and coat.
   *Remedy:* state that the 60 mg is chosen because its recipe is public,
   and that a 240 mg line needs the composition (not found).

10. **MEDIUM: the GMP vocabulary.**  The README already says "by analogy",
    but "Grade D" for OSD rooms will be challenged.
    *Remedy:* label the rooms CNC (or the company's ISO 8 at-rest target).
    Cite EU GMP Ch. 3 (3.6, 3.12-3.14), Ch. 5 (5.18-5.21) and WHO TRS 1010
    Annex 8 (4.5, 7.5, 7.7), whose cascade the case already satisfies.
    Keep Annex 1 out of the citations.

11. **MEDIUM: recovered acetone is sold as a product at €0.80/kg.**  A GMP
    plant either reuses its recovered solvent in-process after validation
    (a raw-material credit, not revenue) or sends it to licensed off-site
    recovery or incineration, usually at a cost.
    *Remedy:* treat recovered solvent as a recycle with make-up, or as a
    waste stream at a disposal cost.  Cite a waste-contractor quotation.

12. **MEDIUM: the API price.**  €10 000/kg is round.  The only public
    signal is ≈ $8 452/kg (≈ €7 780/kg), an average of small 2025-26
    development lots.
    *Remedy:* cite Pharmaoffer as an indication, and ask for a tonne-scale
    DMF-holder quote.

13. **LOW-MEDIUM: sources.**  The README cites RxList for the US label.
    Replace it with DailyMed or FDA (primary); the current label lists both
    strengths with different excipients.  The AusPAR could not be opened
    here.  Add EPAR-2018, EPAR-X28 and PAT-HPMCAS to the sources table:
    they answer most of README section 9, question 1.

14. **LOW-MEDIUM: containment.**  The assumption that apalutamide is potent
    is reasonable: Repr. 1B and STOT RE 2 per the supplier SDS.  No OEL is
    published.
    *Remedy:* cite the SDS classification, state "OEL not public — internal
    band assumed OEB 3-4 pending the supplier's figure", and list the
    API-open-powder steps.  The SDD is the API at 25 %, still a potent
    powder.

15. **LOW: the grade of HPMCAS is unspecified.**  Specify **HPMCAS-LG**
    (Shin-Etsu AQOAT AS-LG), the grade of PAT-HPMCAS Ex. 3.1 and claim 9.

16. **LOW: the building cost.**  €6 100/m² for the building alone is at the
    all-in level of a published US OSD containment plant (≈ $6 800/m²,
    building plus equipment).  It is not wrong; it should cite the
    benchmark and say what it includes.

17. **LOW: what the case gets right**, which is worth keeping and saying:
    * the 1:3 ratio and the 240 mg of SDD per 60 mg tablet;
    * the 3 % coat weight gain from a 20 % solids suspension;
    * a condenser at -10 °C (the patent's PSD-3 runs at -9 °C);
    * closed-loop N2;
    * dry granulation by roller compaction;
    * a positive cascade with corridor-to-room airflow (WHO-HVAC 7.5/7.7);
    * HDPE bottle and PVC-PCTFE blister packs.

---

## 6. Questions only a supplier or the originator can answer

1. The commercial SDD solvent, the solution concentration, the dryer scale
   and the lot size (Janssen; or a CDMO such as Hovione for an
   SDD-as-a-service quote).
2. The 240 mg tablet composition and weight.
3. The OEL/OEB, PDE and wipe limits for apalutamide (the API supplier's SDS
   and its toxicology report).
4. The API price at 0.9-3 t/yr, dated (two or three DMF holders).
5. Vendor quotations, each with model, capacity and date:
   * IBC/bin blender, 1 000-1 200 L;
   * roller compactor, 100-400 kg/h;
   * rotary press, D tooling;
   * perforated coater, 150-400 kg;
   * blister line with serialisation;
   * PSD-3/PSD-4 closed-cycle spray dryer with solvent recovery;
   * vacuum secondary dryer.
6. A toll-manufacturing fee per 1 000 tablets (scenario A).
7. The EU patent/SPC and data-exclusivity expiry dates (a patent attorney;
   the EPO register for EP 3226841 B1).
8. Opadry II 85F composition for the chosen shade (Colorcon).
