# Review: C398 slices (a)+(b) as integrated, attacking what the engine says about itself

Date 2026-11-14.  Subject: `origin/integ/c398ab` at `a5d286d69`, built in
the reviewer's worktree (`make -j2 all`, exit 0).  Every run below used that
worktree's binaries on scratch copies.  No tracked source was edited.
Ledger rows CV-01..CV-15 (docs/reviews/LEDGER.tsv).  Scratch cases and
scripts were kept outside the tree (the coordinator's scratchpad, folder
`cv/`, scripts `mk_*.py`, `gate_probe.py`, `ledger_rows.py`).

Verdict: the numbers hold, but the claim that every statement the engine
makes about itself is true is refuted.  Six resolved-view rows or remedies
are false (S2), and no gate compares the view with the computation, so none
of them can fail the suite.  S1 0, S2 6 (CV-01..06), S3 7 (CV-07..13),
S4 2 (CV-14, CV-15).

## What was measured and holds

Numbers recomputed by hand (Python, from the coefficients the view names):

* purelaws01 (Grunberg-Nissan, every G_ij = 0, over methanol `vogel`,
  2-propanol `chemsepEq101` and water `vogel`): at 293.15, 323.15 and
  343.15 K, 0.0011021271720794, 0.00060275914911925 and 0.00043425005985382
  Pa s, equal to the goldens.  The pin of water `andrade` gives
  0.00110371304312, 0.000613130776865 and 0.000438123426086, also equal.
* purelaws02: Antoine at 350, 450 and 550 K, 42168.79, 1014452.86 and
  7152298.66 Pa; SR1 at the same temperatures, 41683.068, 932203.215 and
  6117184.197 Pa; all equal to the goldens.
* A new variant `pinA` (`model Vogel;` plus a pin of water `andrade`):
  0.000905124471962 Pa s at 300 K and 0.000527019656446 at 330 K, both
  equal to the hand values.
* The SL-05 chain (an ideal-gas Cp pin feeding a RowlinsonBondi liquid Cp),
  on a 2-propanol record with laws `own` and `second` = own x 1.2: Cp_liquid
  at 300 K moves from 175.101813628 to 192.648733628 J/(mol K); the
  difference, 17.5469, is exactly 0.2 x Cp_ig(300 K); the view names the
  injected ideal-gas law correctly on both sides.

Two units with different variants sharing components each took its hand
value: no leak between packages.  A system-level vapour-pressure pin (the
Theory Guide's example) works, and the view says `case pin`.

Refusals that fire, name the right remedy, and work when the remedy is
followed: transport pin errors (a component not in the system, a law not in
the record, a component pinned twice, a pin without `reason`);
vapour-pressure pin errors (a component not in the system, a pin of a
one-law block, a foreign key beside `pin`); variant errors (`inherits`,
`components` or `volumetric` in a variant, an unknown equilibrium slot); a
no-word block on sealed records that hold two laws and no `preferred`
(pinning both, as the remedy says, runs); the hard window (at exactly 373 K,
the bound, the value is returned; at 373.001 K and at 450 K the run is
refused naming `SR1`; following the remedy gives 932203.214807 Pa); a sector
unit naming a root variant (refused, naming the sector file and saying
variants are not inherited); a unit `thermo` in choupoCtrl and choupoBatch,
named or inline; a stream with T but no P, P but no T, or a vapour fraction
without P.

Soft-window announcements: water `andrade` given a window of 280-290 K and
evaluated at 300 to 330 K, on the system and pinned through a variant, is
announced exactly once per law and component, including when only the
pinned law is outside.

The five gates on this tree are all OK.  Two sabotages in a scratch data
home behaved as they should: a coefficient change on water's conductivity
law (B -128.6 to -150) reads back at relative -0.205 against a tolerance of
0.007, so `check_record_law_values` would fail; a wrong value-form `check {}`
on methanol `vogel` reads back at -9.8 %, which would also fail.

## Rows

**CV-01 (S2): the view's pairs are not the package's own.**
`ResolvedView.cpp:267` reads the process-wide `ThermoResolutionLog`,
filtered only by model name and component names.  Reproduction: a copy of
esterification2sector with the system on NRTL plus an inline ethanol-water
pair.  The view of `SEPARATION.flash` prints ethanol-water twice (as
`inline`, the system's pair, listed first, and as `caseRoot`, the pair it
used) and ethylAcetate-water twice (as caseRoot and as perNode).  The
12-line cap counts the borrowed lines, so a package's own pairs can be
pushed out of its view.

**CV-02 (S2): "no model" where a pure-fluid formulation answers.**
`ResolvedView.cpp:453-458` prints `no model: a consumer that asks is
refused` for a transport row with no package model, but
`ThermoPackage.cpp:2180-2191` answers a phase pure in a `pureFluids`
component by the formulation.  Reproduction: purelaws02 plus IF97 for
water: the view says there is no liquid viscosity model, and the operation
returns 3.68461893454e-4 Pa s at 350 K.  All 12 shipped dictionaries with
`pureFluids` have no `transport` block, so the row is false in each of them.

**CV-03 (S2): "window: no window declared" for laws that have a window.**
RowlinsonBondi has a window of Tr 0.25-0.85 (`RowlinsonBondi.H:115-116`),
announced outside it (`.cpp:78-102`), refused at Tr >= 1; AmbroseWalton has
a window of 0..Tc (`AmbroseWalton.H:92`).  `RecordLaws.cpp:71/125` read only
the record's own window keys, so the view prints "no window declared" for
both: the mirror image of SB-04.

**CV-04 (S2): the reactive electrolyte equilibrium is described as ideal
gamma-phi.**  flash12, unmodified: the view prints `liquid activity model:
ideal`, `K-value world: gammaPhi`, no aqueous model (the case declares
davies) and no electrolyte line; its vapour-pressure row prints Antoine for
NH3 and aceticAcid with no mark.  The same run's resolver lines say NH3 and
aceticAcid are priced by the reactive engine (Henry convention, molal), with
acetic-acid dimerisation.  The row reads only `pkg.activity()`,
`vleWorld()` and `hasElectrolyte()` (`ResolvedView.cpp:250-262`).

**CV-05 (S2): the source line names the wrong law, and no record source is
printed.**  `ResolvedView.cpp:524` prints the package word's model citation
as the row's only source: in variant `pinA` that line cites Vogel (1921) in
a row where water runs on Andrade; a row with no model word prints no source
at all.  No line prints a record law's per-law provenance, or whether the
record is a sealed case copy or the catalogue.  `theoryGuide.tex:2703`
promises "with its source and window".

**CV-06 (S2): four remedies name a spelling the same slice refuses.**
`ThermoPackage.cpp:2138`, `2143`, `2172` and `2242` tell the user to write
flat spellings such as `transport { thermalConductivity {...} }`.
Reproduction: purelaws01 prints that remedy; following it is refused as
"the flat spelling of a property block" (exit 1).

**CV-07 (S3): no gate holds the view against the computation.**
`check_variant_same_values` (b) compares two views with each other, plus
two CHOICE rows; `check_record_law_pins` compares numbers only.  Sabotage
request: in `ResolvedView.cpp`, print `L.by` as the constant "the record's
preferred law": all five gates stay OK.  This is why CV-01 to CV-05 pass
today.

**CV-08 (S3): `check_record_law_values` never fails a record it cannot
load.**  Such records are only counted as `notLoaded`
(`check_record_law_values.py:104`): 64 today, and the count is not pinned.
Sabotage request, shown in a scratch home: add a wrong `check {}` to
`H2SO4.dat`: the gate passes.  A unit typo (`Pa*s` instead of `Pa.s`) in
`methanol.dat` makes the whole record `notLoaded`, so all six of methanol's
laws leave the gate in silence.

**CV-09 (S3): `check_record_primitives` matches derived quantities by exact
top-level name only** (`check_record_primitives.py:94`).  Its own `main()`,
on a scratch root, reports none of `dHf -241826;`, `latentHeat 40650;` and
`phaseChange { Hvap_298 43990; }`.  Sabotage request: add `dHf` at the top
level of `water.dat`: the gate should fail; it prints OK.

**CV-10 (S3): `check_provenance_home` flags only entries named after the
seven property blocks** (`check_provenance_home.py:64`).  `Tc { origin
literature; }` filed inside water's `cosmo {}` passes; a `liquidViscosity`
entry in the same place is flagged.

**CV-11 (S3): `check_record_law_pins` has no arm for several paths:** a pin
of `idealGasHeatCapacity` (the SL-05 path), of `solidHeatCapacity`, a
transport pin, and any pin reached through a variant, an inline unit
fragment or a sector dictionary.  The SL-05 number is right today (measured
by hand above), so this is a hole in the evidence, not a wrong number.

**CV-12 (S3): three binaries print no resolved view, and choupoProps prints
none for inline operation fragments.**  `resolvedView::print` is called only
from choupoSolve, choupoProps and the Flowsheet: a batch01 copy at verbosity
3 prints 0 `[properties]` lines.  choupoProps prints no view for an inline
operation fragment (SA-04 still open at this head), so the pin witness
purelaws01 never shows its pin.  `theoryGuide.tex:2690-2694` and
`docs/ai/thermo.md:659` say the engine prints the view of every context the
run uses.

**CV-13 (S3): a heat-capacity hard window checks T but not the reference
temperature.**  `DomainBoundCp::check` (`Component.cpp:1737`) guards `Cp`,
`H(T,Tref)` and `S(T,Tref)` on T only, so a `domain (300 400)` liquid law is
integrated from 298.15 K through its own excluded range with no refusal.
Found by reading the code; not run.

**CV-14 (S4):** `docs/ai/thermo.md:652` says a variant and an inline
fragment replace the `volumetric` phase block; the engine refuses both
(reproduced).  `dict-syntax.md` and the Theory Guide state the refusal
correctly.

**CV-15 (S4): wording the engine prints about itself.**  `Andrade.H:82` and
`Vogel.H:78` still say leaving the window is not announced, printed beside a
per-law line `soft ... (announced outside)` that is in fact announced;
phiPhi prints `liquid activity model: ideal`; a StoredCorrelation row for a
record without a surfaceTension block says "its one law" and repeats the
absence; the hard-window remedy says "beside the property" without naming
`equilibrium { vaporPressure { ... } }`; the NASA7 excursion key is per
component, not per law; the comment at `ThermoPackageBuilder.cpp:2059`
("every variant, selected or not") claims more than `validate()` checks.

## Gate sabotage table

| gate | sabotage (request) | should | does |
|---|---|---|---|
| check_variant_same_values | view prints `L.by` as a constant | FAIL | OK (CV-07) |
| check_record_law_values | water conductivity B = -150 | FAIL | engine half reads rel -0.205; FAILS correctly |
| check_record_law_values | wrong `check {}` in H2SO4 (notLoaded) | FAIL | OK (CV-08) |
| check_record_primitives | `dHf -241826;` at top level of `water.dat` | FAIL | OK (CV-09) |
| check_provenance_home | `Tc { origin ...; }` inside `cosmo {}` | FAIL | OK (CV-10) |
| check_record_law_pins | `loadComponent` skips `idealGasHeatCapacity` pins | FAIL | OK, no arm (CV-11) |

## What I could not reach

* No full sweep and no `--scope` run.
* Whether a hard window refuses at a trial state of a bubble-point or flash
  search whose answer is inside the window (PO-02's class).  Plausible:
  `Psat_Pa` throws before `noteRange`, with no trial-frame distinction.
* CV-13 was not run.
* No GUI, and no lesson pages read.
* The time-integrated binaries were probed only for the refusal and the
  missing view.
* The NASA7 announcement was not run; graphite is the only NASA7 record.
* The caloric pin example from the Theory Guide was exercised only through
  the gate's arms and the 2-propanol case.

(Written into the tree by the coordinator from the reviewer's hand-back: the
harness refuses report files written by a subagent.)

## Addendum (2026-11-14): the fix of CV-01..15, at `origin/c398/slice-b-named-laws` b0a5ffd1c

Built with `make -j2 all` (exit 0); every run used that tree's binaries on
scratch copies, most with `CHOUPO_LAW_TRACE=1`.  Ledger: statuses of CV-01..15
updated (11 fixed, 3 partly fixed: CV-04, CV-07, CV-08); new rows CV-16..23.

Verdict: the fix is real for every row that could be reproduced, but CV-07
is only half true, and the new trial-state code introduces two wrong
behaviours (CV-16, CV-17).

**Is the self-description generated by the code that computes?  Only
partly.**  The `[law-call]` line fires from a hook on the law object that is
actually evaluated (`VaporPressureModel::onFirstUse_`, the wrapper around
every heat-capacity law, `ThermoPackage::firstUse` for transport laws), so
the trace proves which record entry was built and called.  But the line's
fields (law, type, chooser, window, source, home) are taken at construction
from the same metadata the view formats (the record-law `Block` and
`lawChoice` in `Component::firstUse_`; the `LiquidLaw` table in
`ThermoPackage::firstUse`): if object and label drift apart, only a number
gate (`check_record_law_pins`, on the paths it covers) can notice.  Laws
called without describing themselves: predictive transport models
(BrockBird, SatoRiedel); the vapour transport models (Chung, Eucken,
Fuller) and every mixing rule; RowlinsonBondi's internal copy of the
ideal-gas law; pure-fluid vapour pressure, density and enthalpy; Henry
constants in diluteSolution.  No hole in the reactive electrolyte engine's
copies (they go through `Database::loadComponent` and carry the hook; flash12
gives 9 calls).

**The gate `check_view_matches_calls`** passes on the tree (14 witnesses; its
own sabotage arm gives 5 mismatches), but with its own `run()`/`compare()`
on its witnesses each of these edits of the views gave 0 mismatches: the
mixing rule GrunbergNissan -> Li; the predictive surface tension BrockBird ->
SatoRiedel; the vapour viscosity Chung -> ChapmanEnskog; vlle03's activity
model NRTL -> UNIQUAC; acetone06's "consumes ... ideal-gas law" line; the
variant view of variants01 stripped of its vapour-pressure lines (which the
system view also prints: (a) checks each call against the UNION of all views,
not the package's own view).  CV-20.

**"view not built ... the resolver lines are the record"**: `[resolver]`
lines exist only in the reactive case (flash12: 36 lines); flash08
(diluteSolution), evaporator06 (plain electrolyteGammaPhi) and vlle03
(gammaGamma, in its vapour-pressure row) print none, their record being the
`[builder]`, `[henry]` and `[v2 native]` lines; flash08's Henry pair
`CO2-water.dat` is named nowhere in the view.  CV-21.

**CV-01..15 reproduced on the fix**: CV-01 (est2: the flash view lists its
own 6 pairs once each); CV-02 (IAPWS R12-08 named, "no model" only for any
other phase); CV-03 (RowlinsonBondi's built-in window printed); CV-04 (no
activity model or K-value world printed for flash12; the pointer is wrong,
CV-21); CV-05 (each law shows its source and record home; the word's
citation labelled as the word's); CV-06 (the nested remedy); CV-08 partly
(CV-22); CV-09 (`dHf`, `latentHeat`, `Hvap_298` in a block and `dSf`
flagged; misses in CV-23); CV-10 (`Tc` inside cosmo flagged); CV-11 (15 arms
OK; the SL-05 arm moves 525 numbers); CV-12 (batch01 93 view lines,
unsteady01 1 view, pl01 3 inline-operation views); CV-13 (refused at the
298.15 K reference); CV-14 (docs/ai/thermo.md:654 corrected); CV-15 (wording
corrected; the StoredCorrelation wording not re-run).

**Trial states.**  Hold: bubbleT01 (answer 354.4248 K) with a window topping
at 360 K, seed 366.6 K outside, converges in 4 iterations; adiabaticFlash01
(answer 368.6618 K) with windows ending at 381, 380.5 or 370 K: the trials
outside are rejected and it converges.  Fail:
* **CV-16 (S2):** pure water at 5 bar on IF97 converges at 424.9862 K without
  a window; give the record's Antoine law `domain (273 373)` (a law IF97 does
  not use for vapour pressure) and the search is clamped at 373 K, prints
  `T_bubble: 373.0000 K` and fails to converge after 60 iterations (exit 2),
  no refusal naming a law.  Cause: `narrowToVapourPressureWindows` ignores the
  pure-fluid route.
* **CV-17 (S2):** an answer outside the window is not refused by the law in
  the bubbleT unit: windows (290 354) or (360 380), answer 354.4248 K: 60
  iterations, the window bound printed as `T_bubble` (354.0000 or 360.0000
  K), then "failed to converge".
* **CV-18 (S3):** a vapour-pressure window that excludes 298.15 K fails every
  run that prices a liquid enthalpy: bubbleT01 with windows (340 362)
  converges, then exits 2 with "refuses T = 298.15 K"
  (`Component::datumBridge298` calls `Psat_Pa(298.15)`); the message names no
  caller, nothing documents the requirement, the narrowing ignores it.
* **CV-19 (S3):** an inlet whose own temperature is outside the window is
  not refused: adiabaticFlash01 with a feed at 380 K and windows (290 370):
  the inlet temperature is treated as a rejected trial, the search re-seeds
  at 290 K, exits 0 at 368.661802 K (base 368.661804), and the log blames "a
  mixer carrying a two-phase enthalpy".

**New gate arms, one sabotage each.**  CV-08: a wrong check on its own line in
H2SO4 (one of the 64 pinned unloadable records) now FAILS by name; the same
check written inline (`liquidViscosity { andrade { A 0; B 0; check {...} } }`)
gives OK: the detection is a line-start text match (CV-22).  CV-09: `dHf`,
`latentHeat`, `Hvap_298` FAIL; `phaseChange { deltaHvap }` and a top-level
`Hf298` pass (CV-23).  CV-10: `Tc { origin literature; }` inside `cosmo {}`
FAILS.  CV-11 (request, not run): in `Database::loadComponent`, skip pins
whose property is `idealGasHeatCapacity`; expected: the SL-05 arm fails.

**Not reached:** no sweep and no `--scope`; the props-binary `T_bubble` path;
dew-point probes; column solvers with hard windows; the aqueousProperties
formulation; the StoredCorrelation wording.
