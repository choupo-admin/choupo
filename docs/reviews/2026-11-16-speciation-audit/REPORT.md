# Speciation models: an independent double check (2026-11-16)

Requested by Vítor: "double check the thermodynamic speciation models, to
make sure everything is right".  This is the deliverable DEV.md 4c **C409**
names ("toda a especiacao do Choupo", 2026-11-16), at the path C409 gives.
How each point of C409 was covered, and what was not, is in the last
section.  Done on origin/main 72ddf86960, built
natively.  Nothing in the tree was edited; every case ran from a copy.

Three reviewers worked independently, one area each, by recomputing outside
the engine in Python.  The commander then verified the strongest claims by
hand.  The three areas:

- the speciation solver and its equilibrium constants:
  [solver-and-constants.md](solver-and-constants.md), findings SP-xx;
- the aqueous activity models: AC-xx, summarised below;
- the gas-liquid and solid-liquid equilibria: GS-xx, summarised below.

## Verdict

**The numerical machinery is right.**  Every model reproduces the engine's
published numbers, to round-off, when it is given the parameters the engine
loaded.  The models covered:
- the speciation solver: mass and charge balances, mass action and ionic
  strength, on all 150 speciate operations of 26 cases;
- Davies;
- Pitzer single salt and Pitzer-HMW;
- Edwards-Pitzer (all 28 beta parameters re-derived from the records);
- eNRTL single salt, multi salt and mixed solvent;
- Olsson NaOH;
- the Henry conversions;
- the saturation indices;
- the reactive flashes flash12, 13, 16, 17 and 19.

An independent Python solver agrees with the engine's pH and ionic strength
to 1e-6.  Gibbs-Duhem holds to about 1e-9 for HMW seawater, single-salt NaCl
and Edwards.  The solver converges from 1e-12 to 20 mol/kg, at pH 0 and 14,
and from 0 to 100 °C, and announces every out-of-range state.

**The defects are in the DATA, in a few NETWORK and DEFAULT choices, and in
claims made about the numbers.**  None is in the solver arithmetic.  Merged
and ordered below; duplicates found by two reviewers are joined.

## Findings

Severity:
- S1: a wrong answer published silently;
- S2: wrong but announced, or with limited reach, or a decision pending;
- S3: a document or claim that does not match;
- S4: cosmetic.

### S2: the ones that change numbers a student reads

1. **The calcite constant departs from the source its record cites**
   (SP-01 and GS-01, found independently; verified by hand).
   - **Where:** `data/standards/components/CaCO3.dat:68` (calcite: logK25
     1.879, analytic 40.0171 ...) and every sealed copy of it.
   - **What it encodes:** log Ksp = −8.450 at 25 °C.  The record agrees with
     its own expression: 1.8809 against 1.879.
   - **What the cited source gives:** Plummer & Busenberg 1982 give −8.480.
     The aragonite entry on the same record is their aragonite to 1e-4, but
     the calcite expression is a different fit altogether.
   - **Where the value came from:** `bin/curate/parse_speciation.py:606-622`
     pins −8.45 on purpose, noting a revised release of the reference
     database ("revised vs classic −8.48").  So it is a choice, cited to the
     wrong source.  The reference database is gitignored here, so its origin
     could not be confirmed.
   - **Effect, measured:**
     - every calcite saturation index reads about 0.03 low at 25 °C;
     - the temperature trend of `ksp_temperature` is about 30 % steeper
       (SI_calcite +0.059 at 10 °C, −0.086 at 80 °C);
     - the Langelier and Ryznar pH_s values, the calcite ceilings and
       flash14/16/19 all follow it;
     - **pb82_calcite_open_co2:** with −8.48 its pH is 6.0186 instead of
       6.0295.  The header blames the whole offset from the measured 6.004
       on Davies against Truesdell-Jones, and its anchor band is sized on
       that explanation.  About 0.011 of the 0.025 is this constant.
   - **Decision for Vítor:**
     - (a) adopt Plummer & Busenberg's −8.48, re-recording the rows that
       move after the list is shown; or
     - (b) keep −8.45, cite the revised database release it comes from, and
       correct the pb82 header and band rationale.

2. **A curation script invents dissolution enthalpies** (GS-02; verified in
   the code).
   - **Where:** `bin/curate/pitzer_minerals_to_choupo.py:161` writes
     `dHo = 0.0` when the source has no enthalpy, then subtracts the rebase
     steps' enthalpies at :180.
   - **The records it produced:** nahcolite, burkeite, kalicinite, natron,
     nesquehonite (−14.9 kJ), gaylussite, pirssonite, trona (−29.8 kJ) and
     portlandite (−112.8 kJ).  Each carries an enthalpy no source gave, and
     the engine applies it as a real van 't Hoff slope.
   - **Effect:** in `ksp_temperature` from 10 to 80 °C these salts read as
     less soluble when hot: SI_nahcolite −3.80 → −3.30, SI_natron −7.76 →
     −7.27.  The rows are pinned in goldens.  Nothing moves at 25 °C.
   - **Remedy:** when the source has no enthalpy, write none, so the
     constant reads flat in T, as CaOH already does.  Then re-derive those
     records.

3. **The stored logK25 silently overrides the record's own analytic K(T)**
   (SP-02).
   - **The gap:** in 13 records the stored 25 °C value and the analytic
     expression disagree, worst KFaq +0.215, NaHCO3aq +0.127 and anhydrite
     −0.064.
   - **How the engine uses it:** logK25 + [analytic(T) − analytic(298.15)],
     which carries the gap to every temperature.
   - **Anhydrite:** 25 °C lies outside the expression's own validity range
     (50–160 °C).  In `ksp_temperature` at 80 °C its verdict moves from
     saturated (−0.007) to −0.071.
   - **Remedy:** announce the gap, or decide which of the two is the datum.
     The arity rule says one.

4. **pitzerHMW on the full ion-pair network double counts** (AC-01).
   - **The contradiction:** `pitzer_seawater_verify` restricts its network,
     because HMW's mixing terms were fitted without sulfate pairs.
     `pitzer_calcite_brine` runs pitzerHMW on the default network of 20
     equilibria (NaSO4−, MgSO4°, CaSO4°, CaHCO3+, ...), and nothing says so.
   - **Effect:** restricting to the pairs the HMW carbonate model carries
     moves SI_gypsum from −0.964 (outside the case's own band −0.9 … −0.6)
     to −0.688.
   - **The case header is wrong:** it blames "slightly higher I", but I is
     lower, because the pairs remove charge.
   - **Same pattern:** `pitzer_vs_davies_ro_concentrate`, not rerun.
   - **Remedy:** announce ion pairs under pitzerHMW, or refuse them unless a
     `networkScope` is declared.

5. **The water vapour pressure is an Antoine law used past its fit**
   (GS-03, GS-04, GS-05).
   - **Size of the error:** +2.47 % at 100 °C against IAPWS, the error the
     header of `water.dat` already measures.
   - **edwards02:** two of its Table 7 pressure anchors pass partly because
     of it.  With the IAPWS value, rows 2 and 3 sit at −4.3 % and −4.4 %
     against a 4 % band.  edwards03 has the same mechanism at 80 °C.
   - **olsson01:** its boiling-point-rise tables above 100 °C are 3–4 % low.
   - **What the run says:** the `[psat]` line states only the distance
     outside Trange, never the fit's error.
   - **A second home on the reactive path:** water is priced by the H2O(g)
     record, −1.7 % at 85 °C, while the `[resolver]` line names Raoult and
     the Antoine law.  That is 3–4 % between the two paths for the same
     water.
   - **Remedy:** use the IAPWS route `water.dat` already names, and give the
     solvent's vapour pressure one home.

6. **The water of crystallisation of a hydrate stays in the solvent**
   (GS-12).
   - **Reproduction:** gypsum from 1 mol/kg Ca and SO4 gives n = 0.98473,
     the saturation molality taken on the original kilogram of water.  It
     should be 0.98527, on the 0.9645 kg left.
   - **Effect:** 35.5 g of water per kg is counted twice.  The saturation
     index carries a_w correctly; it is the water balance that does not.
   - **Reach:** gypsum, mirabilite, epsomite and other hydrates.

7. **The Debye-Hückel slope is frozen outside 273–573 K without a word**
   (AC-03).
   - `SolventProperties.H debyeHuckelFactor()` clamps to its ends, and its
     comment promises an announcement nobody makes.
   - The `[pair-span]` sentence "only the Debye-Hückel slope follows T"
     becomes false there.
   - `FreezingPoint.cpp` skips the span check entirely.  The effect there
     is small (about 0.013 K at 2 m).

8. **The `atmosphere {}` gas pin takes partial pressure as fugacity at any
   pressure, silently** (SP-04).
   - At 100 atm of CO2 it exits 0 with 3.4 mol/kg dissolved.
   - The `vapour {}` path refuses the same thing unless `fugacity ideal;` is
     declared.

### S3: claims that do not match the code or the numbers

- **AC-02 (verified by hand):** the E-theta J(x) function is "verified
  against the published table", but the table is its own output.
  - Pitzer's integral gives J(0.1, 1, 10) = 0.003603, 0.116437, 2.063284;
    the code gives 0.003529, 0.115790, 2.040302.
  - The real error is 0.6–2 %, not the 1e-3 the comment claims.
  - Exact J lowers seawater divalent gammas by about 0.3 %.  That moves
    `pitzer_seawater_verify`'s four out-of-band salts further away, so it
    does not explain them.
- **AC-04:** CLAUDE.md says the single-salt adapter is selected with
  `model pitzer;`.  The builder accepts only `Pitzer` (case-sensitive), and
  every case writes that.
- **AC-05:** the Davies water activity uses phi = 1.  It is announced, but
  the "dilute approximation" wording is backwards: relative to (1 − phi),
  the error is largest at dilution.
- **AC-06:** two places assume Davies without saying it was assumed:
  `Speciate.cpp:325`, and an `activityModel { molecular X; }` with no ionic
  word in `ThermoPackageBuilder.cpp`.
- **SP-03:** Kw at 25 °C is −14.000, while the record's own expression and
  the textbook give −13.995.  It is the same mechanism as item 3.
- **SP-05:** the inner Newton can exhaust its 50 steps and be accepted.  No
  case triggered it.
- **SP-06 / GS-06:** the `ksp_temperature` header gives the halite and
  calcite dissolution enthalpies for other reactions than the ones run, and
  names directories that no longer exist.
- **SP-07 / GS-08:** rainwater_air's dissolved-oxygen "saturation" is a
  dry-air number, about 3 % high against moist air at 1 atm.

### S4

- **AC-07:** stale prose.
  - Three headers describe a Born-Bjerrum factor the code replaced by an
    SP77 fit.
  - Two case headers point to a parameter path that moved.
  - enrtl_multisalt claims the "exact" Chen & Evans K-Cl values but uses a
    refit.
- **AC-08:** the Davies advisory prints "I = 0.50 beyond ~0.5" at I =
  0.500000129.
- **GS-09:** the CO2 Henry record's header writes the van 't Hoff sign
  inverted; the engine is right.
- **GS-10:** fpd01 uses the triple point as the melting temperature, so its
  freezing temperatures sit 0.01 K high.  The depression column is right.
- **GS-11:** the NH3aq enthalpy is 52 090 J/mol against the 12.48 kcal
  (52 216 J/mol) its own source string quotes.

## What was not checked

- **Primary literature:** nothing was read at the page.  No primary text is
  in the tree, and the reference database the records were transcribed from
  is gitignored and absent.  Agreement with the HMW 1984 seawater gammas,
  SP77 Table II, Edwards Table 6, Chen-Song 2004 and Olsson was checked in
  form and consistency only.
- **Alpha2 = 12:** used on three non-2:2 pairs with beta2 (Ca-Cl, Ca-OH,
  Na-HCO3).  The result is sensitive to it: about 13 % in gamma_HCO3 in
  seawater.  It needs the source.
- **UNIFAC:** the coefficients in flash17/19 were not reimplemented.
- **The softener exchange operation:** not checked.
- **The measured-data comparisons** of edwards02/03 and farelo: not redone.

## Order proposed for the fixes

1. **The calcite source (item 1):** a decision only Vítor can take, (a) or
   (b).  Every calcite number follows from it.
2. **The invented enthalpies (item 2) and the logK25/analytic gap (item 3,
   SP-03 with it):** a curation slice that re-derives records.  Golden rows
   move, and the list goes to Vítor first.
3. **The water vapour pressure route (item 5):** it reaches the Edwards
   anchors.
4. **Small engine slices** for items 4, 6, 7 and 8, each with its own
   refusal or announcement and a gate arm.
5. **The S3 and S4 prose.**

## C409, point by point

| C409 asks for | Done here |
|---|---|
| every shipped case that speciates | all 26 cases with a `speciate` operation (150 operations), plus the reactive flashes, the solid and saturation-index cases and the electrolyte activity cases |
| equilibrium constants against their cited source **at the page** | **NOT at the page.**  No primary text is in the tree.  The constants were re-derived from what each record and case header transcribes, and the textbook anchors were checked (Kw, carbonate K1 and K2, calcite).  The departures found (items 1, 2 and 3) are departures from the record's own citation or expression |
| the activity model's validity window against the case's ionic strength | Davies past I ≈ 0.5 is announced and reaches the caveat block, and the band-edge claim holds (+2.6 % at 0.25 m, +7.6 % at 0.5 m against HMW).  The silent Debye-Hückel clamp outside 273–573 K is item 7 |
| electroneutrality and element closure | ≤ 2.5e-9 and ≤ 4.5e-9 on every operation; where pH is given, the net charge is printed, by design |
| the temperature dependence | the K(T) forms, units and signs match the code; items 2 and 3 are the exceptions |
| the solvent, water vs water + ethanol (C406) | eNRTL mixed solvent was checked on the esteso case at 0 and 40 wt % ethanol.  **Speciation in water + ethanol (the wine cases) was NOT checked against a mixed-solvent K or activity** -- open |
| each case's README claims | every pH claim reproduced.  The false claims found: pb82 (item 1), pitzer_calcite_brine (item 4), ksp_temperature (SP-06), rainwater (SP-07) and enrtl_multisalt (AC-07) |

### What the engine should gain to do this better (ranked)

1. **One home for the solvent's vapour pressure on every electrolyte and
   reactive route**: the IAPWS equation `water.dat` already names (item 5).
   It is the largest single number error the review found.
2. **One datum per equilibrium constant**: logK25 or the analytic K(T),
   never both silently (item 3).
3. **A network-scope guard for Pitzer-HMW**: an announcement or refusal when
   ion pairs meet a model fitted without them (item 4).
4. **Hydrate water in the solvent balance** (item 6).
5. **An exact E-theta J(x)**, by quadrature or a Chebyshev evaluation,
   anchored on independent values (AC-02).
6. **A closed-form Davies osmotic coefficient** in place of phi = 1 (AC-05).
7. **A gas pin that knows it is ideal**: an announcement, or `fugacity
   ideal;`, on `atmosphere {}` (item 8).
8. **The Debye-Hückel clamp announced once per run** (item 7).
