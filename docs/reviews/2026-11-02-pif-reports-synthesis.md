# What the previous years' PIF reports need, read in full (2026-11-02 night)

*DEV.md 4c C195.  Four readers each read the BODY of about five of the 19
project folders in Vítor's `Projetos antigos` (text extracted with
`pdftotext`, every claim carries a page; Excel and Word files opened).  This
note is the aggregate.  The per-project evidence (titles of products, pages,
the errors of each group) is student coursework and stays OUT of this public
repository: it lives in the git-ignored `data/local/pif-reports/` (one file per
group of projects).  Counts are over the 18 readable projects: one folder
(a "Grupo" file and a workbook) is two files of 0 bytes and was not counted.*

## 1. The earlier keyword scan, recounted

| claim of the scan | what the pages show |
|---|---|
| 4 stop at market and patent | **CONFIRMED**: 4 of 18 (one more is unreadable); **14 reach process design** and full economics |
| batch Gantt in 10 | **CORRECTED to 14** (every design report has one) |
| CAPEX-to-NPV chain in 14 | CONFIRMED: 14 |
| break-even in 12 | **CORRECTED to 14** |
| sensitivity in 12 | CONFIRMED in substance: 11 with several scenarios, 2 with one or three runs, 1 with none |
| equipment from vendor catalogues, matched to batch size, in 14 | CONFIRMED for the selection (14); the "matching" is a one-line capacity comparison in all but a few |
| HVAC / purified water / WFI / effluent as description with a cost | CONFIRMED; **WFI is a requirement in none** (it appears as a grade, and as hardware in one report that contradicts its own text) |
| no air-change calculation in any | **CONFIRMED: 0 of 14 design reports multiply an air-change rate by a room volume**; three quote a range from a standard, none computes the supply air |
| staffing in 12 | CONFIRMED in substance: 13 |
| market forecast in 10 | CORRECTED: a method is shown in fewer; several only summarise or cite an earlier project |

## 2. What the reports do, as a pattern

* **The capacity loop is never closed.** No report tabulates per-machine
  utilisation against the batch plan; one schedules a press above its
  data-sheet maximum, and several give a very fast machine a one-hour slot
  without a fill or rate check.
* **HVAC is bought, not computed**: a lump of 0.6-2.5 M EUR from a vendor or a
  consultant, or a percentage of equipment cost; the room classes are tabulated
  and nothing follows from them.  Purified water is the only clean utility with
  real arithmetic, and not in all.
* **Effluent is qualitative everywhere** (a paragraph and a cost line).
* **The layout is drawn by hand** in a drawing tool in every design report.
  Piping, valves and instruments are absent (one report lists CIP valves);
  the control strategy is a paragraph at most.
* **The economics is the weakest part, and the reports often say so.**
  Discount rates from 22 % to 78 %; IRRs from -7 % to 670 %, one of 34 trillion
  per cent and one the authors call "unrealistic"; working capital taken from
  whichever of three methods suits (the spread is more than an order of
  magnitude); the same quantity of packs carrying two different revenues, so
  the break-even is not computed from the revenue of the NPV; a sold quantity
  raised by an unargued factor (x6, x10) to fill the plant; units confused
  between thousands and millions; the tax rate multiplied by sales; royalties
  charged on a patent the report calls expired; a utility bill 1000 times what
  its own arithmetic gives; a building cost that varies five times
  (200-1000 EUR/m2) for the same kind of building.
* **Sterile (parenteral) products are 3 of 14 design projects** (21 %): filling,
  lyophilisation, sterilising filtration, cleaning validation and F0 are
  described and not computed.  Scale-up appears in none; qualification
  (DQ/IQ/OQ/PQ) and PAT appear in one.
* **No simulator is named by any report**; the tools are Excel (with Solver
  for the IRR), AutoCAD, LucidChart, Floorplanner, Visio.

## 3. EASY to implement (each inside an existing home, a general-day or less)

| # | what | why it is easy | closes |
|---|---|---|---|
| E1 | the layout pack and a three-room-suite `building {}` template | the engine does it (C75-C100); an LLM and a student only lack the pack (being written tonight) | the hand-drawn layout in every design report |
| E2 | HVAC cost from the supply air `cleanUtilities` already publishes, times a DECLARED installed cost per m3/h by class (source on the line, through `quotes`) | the flow exists; the cost shape is the C98 quote | the 0.6-2.5 M EUR lump |
| E3 | cleaning events from the batch plan: CIP/purified water and effluent volume per campaign, from the changeovers the Gantt already holds and a declared volume per machine | the Gantt and the changeover are in `batchPlan`; the volume is declared | effluent as a number, not a paragraph |
| E4 | building cost = room areas of the GMP interior x a declared EUR/m2 with its source, into the economics (the C82 land pattern) | the areas are published; the economics already takes a declared price | the 5x spread, made visible |
| E5 | economics hygiene: working capital computed by the three usual methods side by side and the spread printed; royalty only inside a declared patent window; the discount rate and IRR printed together | pure reporting on `appraise`; no threshold invented | the "pick the convenient method" and the royalty-after-expiry errors |
| E6 | a per-machine utilisation table and a Gantt per machine drawn in the GUI | the data exists (the Gantt is published as data, drawing is the listed "not done") | the open capacity loop, visibly |
| E7 | an EduTool "ways a PIF economics goes wrong": each error class above, with the guard in Choupo that catches it | content from this review, anonymised | the arithmetic errors |
| E8 | an EduTool for the demand forecast: trend, regression, DDD x prevalence, with a units check and the "factor" made explicit | a calculator page; the patent-expiry tool is the precedent | the forecast done by hand in Excel |
| E9 | the compaction bench (running now) | decided and dispatched | the tablet-press design |

## 4. IMPORTANT, long-term (new physics or a large build)

| # | what | why it matters |
|---|---|---|
| L1 | the sterile route: filling line rate, isolator/RABS, lyophiliser (primary-drying model), sterilising filtration, F0 | one project in five; the parenteral groups get nothing today |
| L2 | full HVAC: latent and equipment heat loads, the pressure cascade's leakage flows from the building's declared pressures, filtration | 0 of 14 compute it; `cleanUtilities` is sensible-only, announced |
| L3 | labour following the plan: shifts, operators per step from the Gantt, calendar, multiproduct campaigns | the C99 "not done"; staffing is a table in 13 reports |
| L4 | quality calculations: blend and content uniformity (C195 item 3), cleaning-validation limits, qualification checklist | present as prose; the donepezil case flags blend uniformity itself |
| L5 | utility networks: steam, compressed air, vacuum, nitrogen demand per machine and their sizing | partial in half the reports, computed in none |
| L6 | equipment catalogue records with capacity ranges and source, matched to the batch beyond a one-line comparison | the reports' "sizing" is vendor selection |
| L7 | scale-up and solid-dosage unit models (granulation end-point, fluid-bed drying kinetics) | 0 of 14; ties to the compaction bench |
| L8 | the economics as a distribution (Monte Carlo over the declared uncertain inputs) | every report does one-at-a-time; C68 says it is not an uncertainty analysis |
| L9 | piping, valves, instruments and a control strategy per line (C207, C203, C204) | absent from 14 of 14 |
| L10 | effluent treatment, liquid and gas (C206) | qualitative everywhere |

## 5. What this changes for the class tomorrow

What an LLM can already be asked to do with Choupo, because the engine does it:
the batch plan and its Gantt, machine utilisation against a batch (refused above
1, announced above 0.85), clean utilities with air changes DECLARED by room
grade, the GMP building and the plot plan, CAPEX/OPEX/NPV/payback and a
sensitivity on a declared price, and (from tomorrow noon) the compaction fits.
What it must be told to declare, with a source, rather than expect a number:
air changes per grade, the cleaning volume per machine, a price per unit of
equipment (a quote), the discount rate and the sale price.
