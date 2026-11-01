# Boron in reverse osmosis: a proposal (C198)

Status: PROPOSAL, written 2026-11-02 at Vítor's request ("Ativei o Opus, faz a
proposta do boro"). No code is authorised by this file; the architect decides
after Vítor has read it (boron rejection is his research area, so two questions
in section 7 are put to him).

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
