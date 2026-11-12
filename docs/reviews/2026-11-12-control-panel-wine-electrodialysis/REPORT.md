# A control panel kept in the case: prior analysis on a wine electrodialysis unit

Date: 2026-11-12.  Measured at main 4a3d79cca0.  A PROPOSAL asked for by
Vitor before anything is built; nothing here is read by the engine or the
GUI.  The reviewer changed no tracked file.  Everything said about real
practice is unverified against the literature.

## 1. The idea

An operator panel is a human-in-the-loop exercise: it is good when a person
can tell from it what the process is doing, and no engine can grade that.
The panel is DECLARED IN THE CASE (`system/panelDict`), DRAFTED by the
engine from what the case declares, with a reason per element, then tuned by
the person -- sizes, style, limits -- the last change kept, and LOCKED when
final.  It grows from the simplest panel that works (Gall): few elements,
each added only because a test showed it was missed.

## 2. The process taken as the first tutorial

A once-through electrodialysis unit on a stratified vat, declared for this
proposal: wine drawn at the bottom of a 10 000 L vat, deionised by 20 % in
one pass through a stack of 50 m2 cell-pair area, returned at the top
through a diffuser so that the lighter treated wine stays on top; the vat is
finished when the conductivity of the wine entering the unit falls.  The
operator sets the treated-wine conductivity; the current is held and the
voltage rises as the membranes foul, up to 2 V per cell pair, after which
the current falls: stop and clean.  A 200 L brine tank acidified with citric
acid is drained to 50 L at a conductivity set point and refilled with water
at 500 L/h.  The operator wants a predicted end time, remote messages, and
to see whether the treated wine is in its band.

## 3. What today's engine can represent (`tables/part1_pieces.tsv`)

| piece | verdict |
|---|---|
| stack, once through, 20 % conductivity removal, thirteen-ion wine | RUNS (steady stack wrapped `quasiSteady`): 6.710 A, 11.40 V, 0.114 V per pair, i/i_lim 0.060 |
| stratified (displacement) vat | no such vessel; every vessel is well mixed |
| fall of the inlet conductivity at the end of the vat | cannot be produced |
| conductivity -> current -> voltage loop with a voltage limit | cannot be built: the stack takes a current or a removal target, voltage is an output only; a `quasiSteady` unit exposes neither the outlet conductivity as a controlled variable nor the target as a manipulated one |
| membrane fouling | NOT MODELLED anywhere in the electrodialysis units -- the central gap, since it is what ends a campaign |
| brine drain-and-refill cycle | cannot be built: no conditional event; `recipe` is ignored by this binary (finding TI-03) |
| citric acid, brine pH | not in the catalogue |
| ethanol | refused |

Expected campaign: 10 m3 at the stack record's design flow of 3 m3/h =
3.33 h.  With the membrane resistance multiplied by hand (current held) the
voltage per pair reads 0.114 / 0.179 / 0.324 / 0.542 / 0.831 V at factors
1 / 10 / 30 / 60 / 100; 2 V needs about 261.  The clean prediction is about
18 times below the declared cleaning limit -- to be confronted with the
voltage a clean stack shows at the start of a real campaign.

The conductivity the electrodialysis units compute is the infinite-dilution
sum with diffusivities at 25 C and no temperature or concentration
correction: a colder wine reads MORE conductive.

## 4. The minimal panel (`tables/part2_minimal_panel.tsv`, `panelDict.proposed`)

Six elements, each derived from a decision the operator takes:

| element | shows | why |
|---|---|---|
| treatedInBand | trend of the treated-wine conductivity on its band | the band is the product specification |
| voltageHeadroom | voltage per cell pair against its limit, and time to the limit | the only visible sign of fouling |
| currentHeld | lamp HELD / FALLING | the stop-and-clean signal |
| vatEnd | predicted end time, confirmed by the inlet conductivity falling | the operator plans around it |
| brineCycle | brine conductivity against its drain set point; cycle state | a stalled cycle stops the unit quietly |
| abnormal | one lamp each for flow, temperature, brine pH, i/i_lim; count of active alarms | everything outside the normal story in one place, silent while normal |

Left off on purpose (`tables/part2_left_off.tsv`): per-ion removals,
dimensionless groups, the limiting current itself, resistances, energy.

Remote messages are a display kind of their own; only four events earn one:
end predicted soon, vat finished, cleaning due, brine cycle fault.

Alarm rules proposed: every alarm names the action it asks for; a normal end
is a message, never an alarm; one cause, one alarm; the count of active
alarms is always shown.  The standards on alarm management and operator
displays are to be cited by the session that holds them.

Checks an engine could report on a declared panel AS FACTS, never as a
grade (`scripts/check_panel_proto.py`): a shown quantity the case does not
publish; a limit outside its range; a limit the run never approaches or
always violates; a controller or target with no element; too many alarms on
one cause.

## 5. The file

`panelDict.proposed`: `draft {}` (engine draft or edited, by whom, when),
`lock {}`, `grid {}`, `style {}`, `elements ( ... )` each with its
measurement named as a controller names one, display kind, range, band or
limit with `source` and `reason`, alarms with their action, placement and
size, and a reason; `messages ( ... )`.  Persistence mirrors the flowsheet
arrangement: the first drawing is the draft, the reader's last change wins
in the browser, ONE explicit write to the case, and a locked panel writes
nothing until explicitly unlocked.

## 6. What it would take

Engine pieces the process needs, in the order they matter: (1) fouling as a
resistance that grows, declared in the case with its reason; (2) a voltage
drive with a limit, and the stack's conductivity exposed to a controller;
(3) a displacement vessel; (4) conditional events for the brine cycle.  All
are new physics or architecture: Vitor's to decide.

Smallest first slice, independent of all four: the engine reads `panelDict`
and reports the facts of section 4 (first of all "not published"); the GUI
draws number, bar and trend elements read-only -- on the recirculating batch
electrodialysis that already runs (appendix tables).

## 7. The tutorial, in outline

Run blind with the raw outputs; receive the draft panel with its reasons;
meet a disturbance and diagnose from the panel alone; change the panel and
read the engine's facts about it; lock it.  Disturbances the engine produces
today on the batch rig: a more conductive wine, a voltage past the limiting
current, a cold wine, a degraded current efficiency.

`tables/ctrl_minimalPanels.tsv` applies the general recipe (a controller
gives a faceplate, a declared disturbance an event marker, an inventory a
trend) to three control cases.

## 8. Correction received after the analysis (same day)

Two declared values of section 2 are corrected, and the correction changes
the reading of section 3.  A CLEAN stack of this kind starts at about 2 V
per cell pair (about 100 V over 50 cell pairs in series, in two hydraulic
passes of 25), and the stop-and-clean limit is 3 V per cell pair, not 2.

So fouling raises the voltage by a factor of about 1.5 over a campaign, not
by the factor of about 260 computed in section 3 -- and the gap is in the
CLEAN prediction: the engine gives 0.114 V per cell pair where about 2 V is
observed, a factor of about 18.  The engine under-predicts the clean
resistance (or the current) of a stack on wine; fouling is a modest
increment on top.  The tables, `panelDict.proposed` and the scratch case
still carry the 2 V limit and are to be read with this section.

Not yet known, and needed to tell resistance from current: the current the
clean stack draws at that voltage, and whether the stack is the catalogue
record's (which states 100 cell pairs) or another of 50.

## 9. The clean stack's operating point, and what it says about the model

Further operating figures received the same day: the clean stack draws
about 50 A at about 100 V (50 cell pairs in series, 2 V per pair) at the
3000 L/h of section 3; the brine is water kept at pH 3.0 by a pH meter and
a dosing pump of citric acid at half its saturation concentration.

Read against the engine's run of section 3 (6.710 A over 100 cell pairs,
0.114 V per pair) this separates into TWO disagreements:

* **Resistance.**  2 V at 50 A is 0.04 ohm per cell pair; with 1 m2 per
  pair (50 m2 over 50 pairs) that is about 0.04 ohm m2 at 50 A/m2, against
  the engine's 0.0085 ohm m2 -- a factor of about 5.  A hand estimate
  reaches the observed value with three corrections the engine does not
  make (each to be checked, none measured here): a wine conductivity of
  about 0.2 S/m where the engine computes 0.479 (infinite dilution, every
  acid taken as fully ionised, no ethanol); a brine that is nearly water
  with citric acid at pH 3 (about 0.04 S/m by hand: 1 mmol/L of H+ and of
  dihydrogen citrate), whose channel then dominates the cell-pair
  resistance; membranes in a dilute medium.  Sum by hand: 0.03 to 0.05
  ohm m2 per pair.
* **Charge.**  50 A over 50 pairs is 2500 A of cell-pair current, 93 eq/h,
  31 meq per litre of wine at 3000 L/h.  The engine needs 671 A (8.3 meq/L)
  for a 20 % drop of ITS conductivity: a factor of 3.7.  Either the real
  unit removes more than 20 %, or its current efficiency is far below the
  engine's, or 20 % of a real wine's conductivity is more charge than 20 %
  of the engine's.  Not resolved here.

Consequences for the panel: the voltage rises for TWO reasons -- fouling,
and a brine just refilled with water -- so the voltage element must sit
beside the brine conductivity or an operator may send clean membranes to be
washed; and the brine has its own control loop (pH meter, dosing pump, set
point 3.0), which gives the panel a pump state and a pH reading.  The
catalogue has no citric acid and no citrate, so neither the brine's pH nor
its conductivity can be computed today.

Still to be settled: whether the 50-pair stack is the catalogue's
industrial record (which states 100 cell pairs) or another unit.

## 10. Sections 8 and 9 corrected: the stack has 100 cell pairs

The cell-pair count behind sections 8 and 9 was wrong.  The unit IS the
catalogue's industrial record: 100 cell pairs in two hydraulic passes of
50, 0.5 m2 per pair.  About 100 V on a clean stack is therefore about 1 V
per cell pair, not 2, and section 9's two conclusions change:

* **Resistance: no disagreement to speak of.**  1 V at 50 A on 0.5 m2 is
  0.010 ohm m2 per cell pair at 100 A/m2; the engine's run gives
  0.0085 ohm m2.  The hand estimate of section 9, which "reached" 0.04, was
  matched to a wrong figure and is WITHDRAWN as an explanation; its three
  ingredients (the wine's real conductivity, the brine at pH 3, membranes
  in a dilute medium) remain things the engine does not model, but the
  operating point does not show that they are needed.
* **Charge: the whole disagreement, and larger.**  50 A over 100 pairs is
  5000 A of cell-pair current, 62 meq per litre of wine at 3000 L/h,
  against the engine's 8.3 meq/L for a 20 % drop in its conductivity: a
  factor of 7.5.  Taken literally it would mean a current efficiency near
  13 %, or far more than 20 % removed, and 62 meq/L is more than a wine's
  whole cation content as the reviewer understands it -- so at least one of
  the four operating figures (50 A, 100 V, 3000 L/h, 20 %) does not belong
  with the others.  Unresolved; the figures are recollections.

The stop-and-clean voltage per cell pair is to be re-stated on the same
basis (the limit was given as a figure per pair computed with 50 pairs).

## 11. The declared voltages, on the 100-pair basis

Clean stack: about 1 V per cell pair (about 100 V).  Stop and clean: 1.5 V
per cell pair (about 150 V).  Fouling therefore raises the voltage at held
current by a factor of 1.5 over a campaign, as section 8 said; only the
per-pair figures change.  Wherever the tables, `panelDict.proposed` or the
scratch case write a limit of 2 V per cell pair, read 1.5 V.

## 12. The current figure of section 9 is withdrawn

The 50 A of sections 9 and 10 is WITHDRAWN: it was a figure the reviewer
suggested first and that was then agreed to, and it cannot be right -- at
3000 L/h it is seven times the charge a 20 % deionisation of a wine holds.
The charge balance fixes the current at about 5 to 10 A over 100 cell
pairs (the engine computes 6.7 A), which the case author now takes as the
right order.  NO MEASURED CURRENT IS IN HAND.

What then stands, and with what weight:

* declared and coherent: 100 cell pairs, 0.5 m2 per pair, 3000 L/h, 20 %
  deionisation, about 100 V clean (1 V per pair), stop at 150 V (1.5 V per
  pair);
* an inference, not a measurement: if the current is 7 to 10 A, the clean
  cell-pair resistance is 0.05 to 0.07 ohm m2, six to eight times the
  engine's 0.0085 -- the gap would then be in the RESISTANCE (the wine's
  real conductivity, a brine that is nearly water at pH 3, membranes in a
  dilute medium), as section 9's hand estimate of 0.03 to 0.05 suggested;
* needed to settle it: one reading of voltage and current at the same
  instant from the unit.

Sections 9 and 10 are to be read with this one; their arithmetic on 50 A
describes a point that does not exist.
