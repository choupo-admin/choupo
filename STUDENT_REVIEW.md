# Tutorial review, read in the role of a student — 2026-07-18

Swept ~280 cases (3 reviewers + a personal read).  The **numerical state** of
the cases is clean (values in `0/` and `operation` almost always carry a unit
plus an inline comment).  The clarity debt is in the **narrative layer** —
headers and citations — and in one **too-much-data** bug already fixed.

## ALREADY FIXED in that session (all byte-identical, goldens intact)
- **Spectator pairs in the seal** (invariant 3): Davies was sealing Pitzer/eNRTL
  pairs with no consumer.  39 cases, records 2400 -> 2123.  `83bc9c1e4`.
- **S1 electrolyte headers**: 6 Pitzer/eNRTL cases said "ideal gamma = 1".
  `c882c4673`.
- **#2 factual** (copy-paste from another case): sprayDryer03-07 titles, ctrl08
  sinusoidal -> PRBS, hxWorkflow2 146 -> 105 tubes + backref, evaporator01
  V/F 0.55 -> 0.82.  `b4ca4d352`, `c13fff597`.
- **#3 jargon in descriptions** (roadmap Phase / slice S / gate G / forum #):
  7 cases.  `032dd9c65`.
- **#4 units + label on the toy kinetics** (A [1/s] / Ea [J/mol],
  "ILLUSTRATIVE"): 21 esterification reaction files.  `f8457bce4`.
- **#6 tear-seed footer** (author-owned guess, the solver converges it): 6
  recycle seeds.  `ad1d3a865`.
- **#5 competitor-name policy**: a commercial simulator's block name removed
  from the mheatx01 prose.  `37274a5d7`.

## OPEN, FOR VITOR (a decision / touches goldens / large design)
- **#1 boilerplate headers -> the physical WHY** (~50 gammaPhi cases) —
  mechanical but a matter of judgement; the 6 electrolyte ones were left as
  the pattern.  Recommend one wave per family.
- **#5 renames** `radfrac` / `radfracLite` (unit names, column04/08) and the
  `column08_radfrac` folder — they touch KPI keys in the goldens.
- **recycle_autoinit_tear**: the description says "no authored tear guess" but
  the case has `0/recycle` — check whether that is init0-materialised or a
  contradiction.
- **#7 two thermoPhysPropDict conventions** (gammaPhi vs aqueousProperties)
  among sibling electrolyte cases.

## SYSTEMIC (in order of value)

### #1 [HIGH, ~50 cases] the `thermoPhysPropDict` header is boilerplate, not the physical WHY
Almost all of them repeat *"T1/T2 gamma-phi ... Migrated mechanically from the
v1 flat form; v2 contract 2026-07-17"* plus the undefined codes `T1/T2`.  The
file a student opens to understand the model CHOICE explains internal plumbing
instead.  Cases that motivate the choice (`cstr07`: "UNIQUAC is not free — the
constant was regressed with it") read far better.  **Recommended fix:** replace
it with ONE case-specific line, "why this thermo".  Large, mechanical-but-
judgemental — recommend a wave with a pilot per family (the 6 electrolyte cases
are already done as the pattern).

### #2 [HIGH, factual] headers/descriptions copy-pasted from ANOTHER case
Bugs, not style — the clear ones are fixed:
- `sprayDryer03-07/flowsheetDict` — all still titled `sprayDryer01_sugar`.
- `sprayDryer05_whey` — the header (sucrose) contradicts the description
  and `0/` (whey).
- `hxWorkflow2_rate_designed` — `nTubes 105` against a comment saying "146
  tubes"; back-reference to the wrong Part-1 case; description copied from
  heatExchanger02.
- `evaporator01_brine` — description (V/F = 0.82) against flowsheetDict
  (V/F ~ 0.55): mutually exclusive.
- `ctrl08_prbs_ident` — description copied from ctrl06 (sinusoidal), but the
  case is a binary PRBS.
- `recycle_autoinit_tear` — FALSE description ("no authored tear guess") and it
  says Wegstein while running Newton.

### #3 [HIGH] private dev jargon in student-facing text
`forum #119/#85/#98.3`, `gate G1/G6`, `roadmap Phase A/B`, `slice S6`,
`A3 anchor`, `RUN-A3-ANCHOR`, `Dictionary::deepCopy`, `the old alias bug`.
Meaningless to a student.  Scattered across batch/ctrl/electrolyte.

### #4 [MED-HIGH] the toy kinetics of the FIRST tutorials are magic numbers with no unit or source
The esterification family (`cstr01/04/06`, `pfr01/04`, `batch01`,
`recipe01-03`) shares `A 1.0e8; Ea 7.0e4;` with neither an inline unit nor a
source — while `cstr07` / `batch08` write `// 1/s`, `// J/mol` meticulously.
The first cases a student meets are the least annotated.

### #5 [MED, POLICY] commercial-simulator block names on user-facing surfaces
`radfrac` (unit name in column04/08 plus the folder), one exchanger block name
in mheatx01.  This violates the "never name competitors in manuals / on
user-facing surfaces" policy.  **Renaming touches goldens (unit names appear in
KPI keys) — your call.**

### #6 [MED] `0/` carrying converged values to 9-10 digits, indistinguishable from authored input
A `0/` is the "initial state", but product/outlet streams and recycle seeds
read `benzene 49.0622523 kmol/h` — the student cannot tell a seed-of-the-answer
from real data.  The recycle seeds should carry the "estimate, the solver
rewrites it" footer that `plant02` already has.  **Safe partial fix:** that
footer on the tear seeds.

### #7 [MED] two `thermoPhysPropDict` conventions among sibling cases
Some use `equilibrium/gammaPhi` (the model invisible), others
`aqueousProperties { activityCoefficients { model ... } }` (the model declared,
honest).  Same folder, two answers to "where do I see the model".

### #8 [MED] `description` used as a 150-300 word essay
It is the one-line label of the run header and the GUI; in
`precipitation_ro_brackish`, `rainwater_air`, `flash08/09` it overflows.  The
content is good — it belongs in the README.

## EXEMPLARY CASES (the patterns to copy)
- `reactors/cstr07_lhhw_methylAcetate` — complete primary citation (Popken
  2000, Eq 16, tables + pages), every K0 shown as `K_i/M_i`, each term
  motivated.
- `heat/heatExchanger01_water_water` — eps-NTU worked by hand in the header, a
  unit on every line.
- `flowsheets/ammonia01/02` — the full process story, thermo with its WHY
  (SRK + Henry).
- `credo01_valve_heater_drum` — "information follows the streams", one knob per
  box.
- `vlle01_waterButanol` (README) — the command, a predicted-vs-published table,
  a DOI per value.
- `column09/11/07`, `membrane01/11`, `pitzer_vs_davies` — every printed number
  with its source.
- `combustion/ignition02` — a `provenance{}` block in reactions (DOI,
  kinetics_source, reviewer).

## Recommendation
Two mechanical waves clear most of it: (1) a case-specific
`thermoPhysPropDict` header, dropping `T1/T2` and the forum/gate jargon;
(2) audit the copy-pasted headers/descriptions in the
hxWorkflow / sprayDryer / ctrl / evaporator families (they describe another
case).  The advanced families (combustion, adsorption, cstr07, batch08) are
already the target standard.
