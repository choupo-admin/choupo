# Review by measurement: the pharmaceutical drug-product plant cases

Date: 2026-11-13.  Reviewed at main e6a004a703: tutorials/batch/plant/
apalutamide01_tablets, donepezil01_tablets, donepezil02_two_strengths, with
their batch plan, quote, economics and GMP layout.  `run_all.sh <repo root>
[work dir]` runs the three cases and the two recompute scripts.  The
reviewer changed no tracked file.  Everything said about real industrial
practice is the reviewer's understanding, unverified against the
literature.  The powder-compaction cases were not reviewed: no plant case
refers to them.

## 1. What was run

All three cases twice; `bin/runTests` on the three: PASS 3 / FAIL 0; the
gates check_batch_plan, check_cost_provenance, check_gmp_layout,
check_equipment_list, check_tablet_machines and check_spray_dryer_solvents,
all OK.  Layout and GMP: apalutamide 3 plot findings (one entrance, two
unbunded acetone tanks) and 0 building findings; both donepezil cases 0 and 0.

## 2. Independent recomputation

* **Apalutamide formula** (the patent examples as transcribed in the
  dossier): every ingredient per tablet matches to 1e-6 mg; core 700.0 mg,
  coat 21.0 mg, dispersion exactly 1:3.
* **Nitrogen loop** (an explicit steady state with the record's Antoine
  equation and Raoult): acetone vapour pressure at 263.15 K 0.054509 bar;
  recovered 68.575 kg/h, 96.25 %; purge loss 2.675 kg/h; the acetone balance
  closes to 1e-9; the 35 C cooler condenses nothing (dew point 279.2 K),
  as the engine finds.
* **Energy by hand:** dryer exhaust 319.46 K (engine 319.26), heater 18.21 kW
  (18.15), condenser -18.483 kW (-18.484).
* **Batch plan:** reproduces exactly (lot 410.4009 kg, 25 lots, 14.0 million
  tablets, spray-drying train 4 campaigns and 1256.29 h, solid-dose train
  443.75 h, every machine utilisation).
* **Economics:** exact or to 1 EUR (raw materials 6 877 344 EUR/yr, FCI
  23 784 923, working capital rebuilt item by item, NPV 128 116 778 against
  128 116 779, one sensitivity bar exact).
* **Donepezil:** the formula, the lot plan (143 lots; 86 and 29 for the two
  strengths), the fluid-bed dryer (exhaust 316.72 K both) and the NPV
  (-18 672 739 against -18 672 735) all agree.

## 3. Conservation

Mass: apalutamide 99.9997 % (the 1 g/h gap is N2 at the gas recycle's tear,
which contracts slowly), donepezil 100.0000 %.  Elements UNAVAILABLE in all
three, announced (the polymers declare no formula; nothing reacts).  Energy
boundary residual -0.0002 kW and 0.0000 kW.  Both apalutamide recycles
converge in 19 iterations.

## 4. Traceability

Apalutamide: about 24 numbers sourced in place (all agree with the dossier;
the patent, the assessment reports and the label could not be read here),
about 150 author-set and SAID so, 12 neither.  Donepezil01: 6, 120, 8.  The
"neither" list: both tanks' fill fraction (0.85), the loop pressures,
`siteFactor 0.50`, `usdToEur 0.92`, `constructionPeriod 1`,
`salvageFraction 0`, `minimumCash 15 day`, and two values the engine
supplies itself (4.5 positions per operator-per-shift; 1960 h per operator
a year).  No solids property default is silent.

## 5. Sabotage (`sabotage.tsv`)

A lot cut to 20 kg: refused, and check_batch_plan fails -- by a traceback,
not a verdict.  Magnesium stearate x10, the tablet-press quote x10, an
HPMCAS price x10: the golden fails, no gate does (no gate holds the feeds to
the dossier formula).  A false "supplier quotation" provenance with the price
unchanged: everything passes (nothing can verify that a quotation exists).

## 6. Findings (`findings.tsv`, 18 rows)

* **PH-01 (S2, decides the sign of an NPV)** the declared crew is multiplied
  by a constant 4.5 (round-the-clock cover) at `EconomicsPass.cpp`
  (`constexpr positionsPerOperatorPerShift = 4.5`, read by the commander),
  whatever hours the trains are declared to run, and no key changes it:
  staffed for donepezil01's declared 3840 h the NPV goes from -18.7 to +9.2
  MEUR.  The README does tell the student to question the 4.5; the grammar
  cannot express the answer.
* **PH-02 (S2)** the utility bill (2 052 EUR/yr apalutamide, 1 314
  donepezil01) leaves out the running energy of the HVAC and purified-water
  plant the same run sizes, and nothing announces it.
* **PH-03 (S2)** in donepezil02 the clean between products REPLACES the 24 h
  campaign clean and the declared product cleans are 2-12 h, so changing
  product costs less time than continuing one (36 h less on granulation, 30
  on tableting), unannounced.
* **PH-04 (S2)** the gas heater's declared outlet pressure (1.10 bar) is
  above its inlet (1.0695 bar): the heater (`phaseChanger`) takes a declared
  P as the outlet without comparing it with the inlet
  (`PhaseChanger.cpp`, "held from inlet unless set explicitly", read by the
  commander); the blower's own comment calls its outlet pressure a result.
* **PH-05 (S2)** README section 8 says the nitrogen loop "keeps the acetone
  below its flammable limit"; the loop carries 5.2 mol % in and 11.6 mol %
  out, and inerting works through the oxygen, not the solvent (the limit
  quoted, about 2.5 vol %, is the reviewer's understanding).
* **PH-06 (S2)** the final blender and the coating pan are priced at the
  batch plan's sizes (1.333 and 0.812 m3) while the rated-machine checks
  declare a 1.2 m3 bin and a 1.0 m3 pan; the README calls 1.33 m3 "the 1 000
  - 1 200 L class".
* **PH-07 (S2)** the API and HPMCAS records cite an assessment report that
  the README and the dossier say was never read.
* **PH-08..PH-18 (S3)** a purified-water line that prints a product that is
  not one; a recycle that stops on a step ten times smaller than its
  remaining error; `cashFlow.csv` without a column for the working-capital
  recovery; ten excipient records citing an aggregator rather than the
  primary label; a README line saying "one finding" where the run publishes
  three; a refrigerated acetone tank whose cost is a floor, unsaid; the
  batch-plan refusal naming the first stage over its hours, not the binding
  one; raw materials priced on the declared production rather than the 25
  whole lots (1 % more); a 150 K "saturation temperature" printed that is a
  search-bracket floor; check_batch_plan failing sabotage by traceback;
  stored N2 valued at the coating air's price (zero).

## 7. What the review agrees with

The arithmetic is exact everywhere it was rebuilt; the physics agrees with
hand calculations within the reviewer's own approximations; the apalutamide
formula matches the patent example; the traceability discipline is unusually
good (the donepezil README's "NOT verified" column is exemplary); defaults
are announced; the READMEs teach the right questions (the solvent choice, the
pressure classification of the suite, content uniformity).

## 8. Not examined

The spray dryer's droplet, kinetics and chamber models beyond the particle
size and residence time; each GMP rule by hand; road and pipe geometry; the
HVAC room-volume sums; donepezil02's Gantt bar by bar; the generic-entry
design record; every primary source (patent, assessment reports, labels,
sales report): cited, unread.  The statements about industrial practice
(flammable limit, excipient moisture, staffing patterns, changeover times)
are for the owner to correct.
