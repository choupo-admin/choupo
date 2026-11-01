# Boron in reverse osmosis: a proposal (C198)

Status: PROPOSAL, written 2026-11-02 at Vítor's request ("Ativei o Opus, faz a
proposta do boro"); **STAGE 1 BUILT 2026-11-02 (section 9)** after Vítor's two
answers ("usa a constante termodinamica e congela o pH a entrada"); Stage 2 has
no code and waits for its own ADR.

## 1. What a student must be able to see

A seawater RO plant fails its irrigation specification on BORON, not on salt.
Boric acid is a small NEUTRAL molecule that crosses a seawater membrane almost
like water; borate is an ANION that the membrane rejects like a salt. Which of
the two dominates is set by the pH against the acid's pKa, so plants raise the
second-pass feed to pH 10 with caustic. The lesson is one curve: boron
rejection against pH, and the caustic it costs to move along it.

## 2. What Choupo does today (measured, 2026-11-02)

- `swro01_campoDalias` carries boron as ONE lumped component (`components
  ( water NaCl boron )`, its `constant/thermoPhysPropDict` line 18) with a
  constant intrinsic rejection per pass, inverted from the data sheet's two
  rated tests (91 % at pH 8, 95 % at pH 10). The case announces this as a
  declared approximation, and `check_swro_plant` pins the limitation: changing
  the second pass's test pH changes nothing (DEV.md C194).
- `spiralWoundModule` meets pH only in its optional `scaling {}` audit, where
  pH is given (`pH 6.8;`) or solved (`pH solve;`)
  (src/unitOperations/membrane/SpiralWoundModule.cpp:1053-1066). No transport
  law reads a pH.
- The SDEM law already carries NEUTRAL and charged species side by side: it
  reads each solute's charge through its aqueous bridge and counts ions apart
  (src/unitOperations/membrane/transport/SDEM.cpp:302-318, `z_[s]`,
  `nIons`). A neutral solute with its own permeance is therefore not new.
- A stream already carries a pH, but REPORT-ONLY: the `speciation {}`
  decomposition with `pH`/`pH_valid` (src/streams/ProcessStream.H:185-245) is
  computed after the solve and is never state a unit reads.
- The catalogue has the carbonate network (`CO2-dissolution`,
  `CO2aq-formation`, `CO3-formation`, the bicarbonate pairs) and
  `water-dissociation`; it has the species `H3BO3`, `BOH4`, `B3O3OH4`,
  `B4O5OH4`, `CaBOH4`, `MgBOH4`; it has NO boric-acid dissociation record.
- The rated-test inversion (src/unitOperations/membrane/RatedTestInversion.H)
  inverts ONE intrinsic rejection per solute per test.

## 3. The physics, and the one choice that matters

B(OH)3 + H2O = B(OH)4- + H+. The fraction of boron as borate is
alpha = 1 / (1 + 10^(pKa - pH)), and if each form crosses with its own
permeance, the observed passage follows alpha. The choice is HOW pKa is
obtained in seawater:

- (K-a) a THERMODYNAMIC constant (infinite dilution, with its enthalpy) plus
  the case's declared activity model. Coherent with the rest of the aqueous
  architecture (one Gibbs surface per phase). But at seawater ionic strength
  (~0.7 mol/kg) Davies is outside its declared band (AqueousActivity.cpp:79,
  "trustworthy to I ~ 0.5"), and Pitzer has no boron parameters in the tree;
- (K-b) a CONDITIONAL seawater constant, a function of salinity and
  temperature fitted to measurements in seawater itself (the classic one is
  Dickson's, Deep-Sea Research 1990). Accurate where it applies, but it is a
  medium-specific convention, not a thermodynamic K: it would need its own
  convention profile (`conventions/`), and it must never be mixed with an
  activity model in the same equation.

Recommendation: (K-a) as the engine's route, because it is the project's
architecture and it extends to brackish and to the second pass's low-salinity
permeate where a seawater constant does not apply; (K-b) as the VALIDATION
ANCHOR (the pKa the engine computes in seawater compared with the conditional
constant, the gap published, never tuned). Values only from a primary source
read in the session: the thermodynamic constant and its enthalpy from the USGS
PHREEQC database (public domain, the class `conventions/PHREEQC-gasMolal-v1`
already admits) or the original measurement it cites.

## 4. Three routes, staged

**Stage 1 -- two boron species with a DECLARED pH (recommended first).**
- A curated record `BOH4-formation.dat` (H3BO3 + H2O = BOH4- + H+, log K and
  its enthalpy, primary source, validity window).
- The module reads a pH where boron is present: the same grammar as
  `scaling {}` (`pH 8.2;` given, with its source), per module. The engine
  splits the boron component into the two species by alpha at the module
  inlet's T, transports each with its OWN permeance, and recombines them into
  the boron component of the permeate and retentate. The streams keep the
  APPARENT component (the state); the split is the report (the two-bases rule).
  ANNOUNCED: "speciation frozen at the inlet pH; pH declared".
- The two permeances come from the data sheet by an extension of the
  rated-test inversion: TWO tests of the same solute at two pH give TWO
  unknowns (P_acid, P_borate), identifiable because alpha differs (pH 8 against
  10); with one test only, the inversion refuses by name.
- Result: the plant's boron becomes a function of pH, and the Toray sheet's two
  numbers are reproduced by construction (they are the fit), so a HELD-OUT
  point is needed (section 6).
- Cost: one general, one gate, one witness. No engine change outside the
  module, the inversion and one record.

**Stage 2 -- pH COMPUTED, and the caustic dosing.**
- The feed carries the pH-setting solutes as real components beside the lumped
  salt: CO2, HCO3-, CO3--, the boron pair and the Na+ the caustic adds, with
  the carbonate network declared. The stream's pH stops being report-only for
  the units that read it: it is RESOLVED at the unit's inlet the way an
  authored inlet's phase is (`flashState::resolvedInletVaporFraction`), one
  home, read by the module and by a dosing mixer.
- CO2 crosses the membrane almost freely, so the permeate's pH falls; this is
  what makes the second pass need caustic, and Stage 2 shows it.
- A dosing unit is a `mixer` fed a caustic stream; its flow is found by an
  outer `designSpec` on the pass-2 feed pH (pH published as a KPI). The
  caustic consumption enters the economics as a reagent.
- Cost: larger. It touches the stream-state contract (a pH read by units), the
  speciation solver at unit inlets, and the case's components. A written ADR
  before code.

**Stage 3 -- the full ion set.** All twelve ions of the case study's Table 2
with per-ion permeances under SDEM. Not recommended: no source gives per-ion
permeances for these membranes, so every one would be assumed, and the boron
lesson does not need it.

## 5. What does not change

The lumped NaCl for osmotic pressure and salt transport stays (C194's route
for the salt is unaffected). The rated-test inversion keeps its one-solute
form; the two-test form is an addition. No golden moves except the boron rows
of `swro01_campoDalias`, listed with their reason when Stage 1 lands.

## 6. Validation

The data sheet's two tests are the FIT, so they validate nothing. Needed: at
least one measured boron rejection against pH for a seawater membrane, read
from an open primary source, held out from the fit and compared with a
declared band (the C16/C189 rule: band declared before the comparison). If no
such source can be read, Stage 1 ships as a STRUCTURAL witness (the curve's
shape, the two-test identity) and says so on every run.

## 7. Two questions for Vítor (his research area)

1. pKa in seawater: thermodynamic constant + activity model with Dickson's
   conditional constant as the anchor (the recommendation above), or the
   conditional constant as the engine's route for seawater cases?
2. Speciation along the channel: Stage 1 freezes the split at the inlet pH.
   The wall is more concentrated and the permeate more acidic (CO2 passes).
   Is the frozen split acceptable for the teaching case, with the limitation
   announced, until Stage 2 resolves pH per station?

## 8. Recommendation

Build Stage 1 now (one general, Sonnet), with the record from a primary
source and a held-out point if one can be read. Write Stage 2's ADR next; build
it only after the ADR is read. Do not build Stage 3.

## 9. BUILT (Stage 1), 2026-11-02

**What exists.** `data/standards/chemistry/BOH4-formation.dat` (H3BO3 + H2O =
BOH4 + H+, log K -9.24, dH +3.224 kcal/mol = 13489.2 J/mol); `aqueousSplit {}`
in the `spiralWoundModule` operation (`src/unitOperations/membrane/AqueousSplit.{H,cpp}`,
called from `SpiralWoundModule.cpp`); the split form of the rated-test
inversion (`RatedTestInversion.{H,cpp}`: `invertSplitFromTwoTests`,
`invertSplitFromOneTest`, `solveSplitPassages`); the word
`( fromAqueousSplit )` in `constantRejection`'s `rejection {}`;
`tutorials/plant/swro01_campoDalias` converted from the lumped route; gate
`bin/curate/check_boron_split.py` (and `check_swro_plant`'s boron arm rewritten
into its positive form).

**The grammar, and why.**

    aqueousSplit
    {
        component boron;  acid H3BO3;  base BOH4;
        pH 8.2;  pHSource "...";                  // declared, with its source (Stage 1)
        rejection
        {
            acid ( fromRatedTest boronRef );      // ONE test: the acid
            base ( sameAs NaCl );                 // ... and the base DECLARED (or a number)
            // or: tests ( idLowPH idHighPH );    // TWO tests at two pH: both forms
        }
    }
    transportParameters { rejection { boron ( fromAqueousSplit ); } }

It sits in the operation beside `scaling {}` (the other block that meets a pH),
every key is required, an unread key refuses, and the effective rejection goes
to the law through the same door as any rated one (`setRatedRejection`).

**Where this differs from the proposal and from the brief.**

1. The proposal assumed the data sheet gives two boron tests at two pH for one
   membrane. It does not: Toray states ONE boron figure per element, for two
   DIFFERENT elements (TM820E-400: 91 % at pH 8; TM720C-430: 95 % at pH 10).
   The two-test inversion is built and gated on a fixture (the second test is
   labelled SYNTHETIC there), but the shipped case uses one test per element:
   it determines the ACID's rejection, and the BASE's is a DECLARED
   ASSUMPTION (the element's own NaCl rejection: an anion rejected like the
   salt), announced on every run. Pairing the two Toray figures across
   elements would mix two membranes and is not done.
2. The transport law does not see two solutes; it sees the apparent component
   with the effective rejection `1 - R_eff = (1 - alpha)(1 - R_acid) + alpha (1 - R_base)`.
   That is EXACT, not an approximation, under the three conditions Stage 1
   already imposes: the constant-rejection law (each form's flux is `(1 - R_i)
   J_w c_m,i`), one film coefficient for the component, and the split frozen at
   the inlet's pH. `transport solutionDiffusion;` or a per-solute film refuses by
   name (R_eff would vary along the channel); the species are reported (KPIs
   `split_*`: alpha, the pKa used and the apparent one, both gammas, I, both
   rejections, the permeate and retentate of each form) from the same algebra.
   Making the law see two solutes would be Stage 2's job together with a pH that
   moves along the channel.
3. alpha is the PACKAGE's (`ThermoPackage::speciateAqueous`, the curated record,
   the case's declared aqueous activity model), so the case now declares
   `equilibrium { aqueous { activityModel { model davies; } } }` and the boron
   component carries `aqueousMapping ( { species H3BO3; nu 1; } )`. The
   formation consumes a water, so alpha carries a_w (0.98 at pass 1).
4. The record states no Trange: the databank gives none and none is invented.
   The databank also names no primary for the line; the record says so. A
   primary (Mesmer, Baes & Sweeton, Inorg. Chem. 11 (1972) 537, is the usual
   citation for boric acid ionisation) was NOT read in this session and is not
   cited; re-citation is a curation act.

**Sources read in the session (2026-11-02).**

- USGS PHREEQC `phreeqc.dat` (usgs-coupled/phreeqc3, `database/phreeqc.dat`,
  lines 319-321): `H3BO3 = H2BO3- + H+`, `-log_k -9.24`, `-delta_h 3.224 kcal`;
  master species `B H3BO3 0 B 10.81`. No reference line, no window.
- `seacarb` `Kb.R` (GPL; cites Dickson 1990, Guide to Best Practices 2007): the
  conditional constant on the total scale, mol/kg-solution, S 5-45, T 0-45 C;
  evaluated here at S 35, 25 C: pK*B = 8.597.
- Lu et al., Nature Communications 16, 6289 (2025), doi 10.1038/s41467-025-61352-6
  (open access, CC BY-NC-ND 4.0; individual measured values quoted for comparison,
  nothing redistributed): boron rejection of a laboratory membrane at pH 7 (92.6 %),
  pH 8 (93.5 %), pH 10 (> 98 %), 5 ppm boric acid, 15.5 bar, no salt.

**Results (swro01_campoDalias, 2026-11-02).** First pass: pH 8.2, I = 0.593
mol/kg, gamma_BOH4 = 0.739, alpha = 0.1077, R_acid = 0.9321, R_base = 0.9978 (the
NaCl one), R_eff = 0.9392, permeate boron 0.457 mg/L. Second pass: pH 10, alpha =
0.858, R_acid = 0.790, R_base = 0.9939, R_eff = 0.965. Product 98 668.7 m3/day,
boron 0.0425 mg/L (the lumped route said 0.0464). **The pass-2 pH now acts:**
declared at 9 instead of 10, R_eff falls 0.9650 -> 0.8668 (alpha 0.858 -> 0.377) and the
product's boron rises 0.043 -> 0.141 mg/L, both recomputed by the gate.

**Validation, honestly.**

- pKa in seawater against Dickson's conditional constant (never tuned, printed
  by the gate): the engine's APPARENT pKa at pass 1 is 9.118 (thermodynamic 9.240
  plus log gamma_BOH4 under Davies) against Dickson's pK*B 8.597 for S 35, 25 C,
  a gap of +0.52. It is the expected size and sign for this route: Davies is
  outside its own band at I = 0.59, the lumped NaCl is not seawater (no Mg, Ca, SO4
  ion pairs with borate, which are what lower Dickson's constant), and the two are
  on different pH scales. Pitzer has no boron parameters in the tree. At pass 1 the
  engine's alpha (0.108) is therefore indicative and the run says so (the
  speciation's own Davies-beyond-band advisory fires and is echoed beside the alpha).
- A HELD-OUT point (band declared before the comparison): a laboratory membrane
  (NOT the plant's), the acid's rejection fixed from the pH 7 value alone, the
  base's 0.99 (the shipped case's declared kind): the model predicts 92.91 % at pH 8
  against 93.5 % measured (-0.59 pp, band +-1.0 pp) and 98.06 % at pH 10 against
  "> 98 %". It tests the SHAPE of the pH dependence (alpha-weighting of two
  passages), neglects the film (no salt, no pressure model) and rests on a single
  paper; it says nothing about Toray's numbers, which are the FIT. Without it the
  case would be a structural witness only.

**Moved goldens (swro01_campoDalias only).** 118 rows beyond tolerance, 60 new `split_*`
rows. 35 are boron rows (R_obs_boron, Gamma_boron, boron inventories of the tanks);
the rest are the second pass's NaCl-side numbers (RO2a/RO2b Gamma_NaCl, dP, Re, the
recycle F, the tank NaCl inventories). The latter are NOT a defect of the split: boron
is a solute of the van't Hoff osmotic pressure and is about 1 % of the second pass's
osmotic pressure, so a changed boron rejection moves its flows by 4e-5 of the product.
Proved: with boron's `dissociation` set to 1e-6 in BOTH the lumped and the split
copies, the product is 98 737.347 and 98 737.339 m3/day (8e-8 apart).

**Gate** `check_boron_split` recomputes the record, alpha (self-consistent Davies,
a_w), the acid rejection from the rated test, R_eff, the permeate shares, the closure
of the permeate boron, the pH 9 variant, the two-test 2x2 on a fixture, eight
refusals by name and the held-out comparison. Sabotage results: see the commit.

**NOT done, said plainly.** Stage 2 (pH computed, caustic dosing); a pH along the
channel; per-form film coefficients; two Toray tests for one element (the sheet does
not give them); a borate-specific permeance from data (assumed); Pitzer boron
parameters; the Dickson anchor as anything but a printed gap.
