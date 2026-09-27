# The salt chosen by its position

*2026-09-27.  DEV.md §5 A1.  Gate: `check_v2_refusals` (the active-salt arm).*

## 1. The defect as filed, and what measuring it changed

The single-salt electrolyte adapter (`buildElectrolyte` in
`src/thermo/ThermoPackageBuilder.cpp`, reached by every case whose
`thermoPhysPropDict` declares `formulation electrolyteGammaPhi;` with a
Pitzer or eNRTL model and no reactive speciation) treats exactly ONE salt.
When `components ( ... )` carries more than one component whose record
declares `dissociatesTo`, something must say which.  What said it was a
formula read from `data/standards/chemistry/salts/<phase>.dat`, where
`<phase>` is the solid phase `constant/chemistryDict` declares.  That
directory has not existed since `chemistry/` went flat on 2026-07-01 (`ls`
fails today).  The formula stayed empty, and an empty formula made EVERY
`dissociatesTo` component eligible, so the FIRST one in the list won.

The filing (DEV.md, 2026-09-07) named the lithium plant's BRINE sector as the
case that mattered: `components ( water NaCl LiCl )`, "so the engine takes
NaCl as the active salt in the sector whose whole subject is lithium".
Measured before building anything, that sentence is wrong in both halves,
and the engine was RIGHT there:

* **The BRINE sector's subject is halite.**  Its one unit is `crystNaCl`,
  its outlets are `halite` and `liquor`, its `chemistryDict` declares
  `solidPhases ( halite )`.  It is the evaporation-pond step that drops the
  sodium chloride out and concentrates the lithium in the liquor.  NaCl IS
  its active salt; LiCl is a spectator by design.
* **The choice was not positional there.**  The plant is sealed and still
  ships the retired snapshot `constant/chemistry/salts/halite.dat` (formula
  `NaCl`).  The resolver walks the case's own `constant/` before the
  catalogue, so on the flagship the "dead" path FOUND a file and the
  disambiguator worked.  Reversing NaCl and LiCl in the plant's list under
  the parent build still gave NaCl.
* **The sector's own list is not the one that reaches the builder.**
  `Flowsheet::thermoFor` replaces a sector's `components ( ... )` with the
  plant's GLOBAL list ("components stay global"), so the order that could
  have decided is the root's, not the sector's.  The first draft of the gate
  reversed the sector's line and a first-wins sabotage passed it untouched.

So the flagship was protected by a legacy file, and no corpus case was
computing on the wrong salt.  The defect was live for every case WITHOUT
that snapshot, and it was reproduced on a two-line fixture under the parent
build:

| `components ( ... )` | `chemistryDict` | parent build |
|---|---|---|
| `water LiCl NaCl` | none | exit 0, gamma_pm(1 m) = 0.7897 (LiCl's) |
| `water NaCl LiCl` | none | exit 0, gamma_pm(1 m) = 0.6572 (NaCl's) |
| `water LiCl NaCl` | `halite` | exit 1, "halite, which no record owns. The package's salt is 'LiCl'" |

Two answers from one declaration at exit 0, and when the case DID declare
the phase, a refusal that blamed the phase instead of the choice.  Nowhere
did the console say which salt had been picked: `saltName` reached the log
only inside an ion Cp line and a solid-phase line, never as the decision.

## 2. The rule

**The active salt is DECLARED, never positional, and the decision is
announced.**  In order:

1. One candidate: it is the salt.  Nothing to decide, and it is announced
   (`the only component carrying dissociatesTo`).
2. The declared solid phase names the salt through the record that OWNS it:
   the candidate whose own `solidPhases {}` block carries that phase.  This
   is the home the data tree already uses for a salt's solid (§5 of CLAUDE.md,
   "Electrolyte data tree"); the builder was the one reader still asking a
   retired home.  Ownership, never name similarity.  Two owners of one phase
   refuse.
3. `[legacy]`: an external case that still ships
   `chemistry/salts/<phase>.dat` names its salt through that record's
   `formula`.  Honoured, announced as legacy with the move that retires it,
   and REFUSED if it disagrees with rule 2 (two homes for one fact).
4. Anything else REFUSES, listing every candidate with the phases it owns
   and the key that settles it (`constant/chemistryDict equilibria {
   solidPhases ( <phase> ); }`).  A salt that owns no phase cannot be named
   this way, and the refusal says so and names the two remedies.

The announcement is one line, `[electrolyte] active salt: NaCl (declared by
constant/chemistryDict solidPhases ( halite ), a phase NaCl's own record
owns); spectator salt(s), ideal molecular contribution: LiCl`, gated like
every other load-time `[builder]` line (`thermoAnnounce()`, verbosity >= 2;
the default is 3) and printed once per run per decision.

## 3. Every read of the retired `chemistry/salts/` home, classified

| Site (parent build) | What it was | Now |
|---|---|---|
| `ThermoPackageBuilder.cpp:176` | the disambiguator | LIVE DEFECT outside the flagship; replaced by rules 1-4, the snapshot kept only as rule 3 |
| `ThermoPackageBuilder.cpp:260` | comment naming `chemistry.salts` | rewritten |
| `ThermoPackageBuilder.cpp:322` | ownership probe of the legacy homes | KEPT: the consumers below still read them, and a check narrower than its consumers refuses valid input |
| `ThermoPackageBuilder.cpp:338` | refusal text naming the legacy homes | KEPT: it is true of what was searched |
| `ThermoPackageBuilder.cpp:486/501` | the saturation anchor fallback | KEPT as a legacy read, now ANNOUNCED when it is what served (it never is in the corpus: every owner carries its `calorimetric` block) |
| (same file) `phases/solid/<phase>.dat` | the crystal-property fallback | KEPT as a legacy read, now ANNOUNCED when it serves |
| `Crystalliser.cpp:206` | advice: "add dissolutionEnthalpy to chemistry/salts/<mineral>.dat" | rewritten: advice that sends a student to a retired home is advice that creates the bug |
| `Component.cpp:1038`, `RecordResolver.H:342` | comments | rewritten |

NOT touched: `bin/choupo-import` still `want()`s `chemistry/salts/<salt>.dat`
and `phases/solid/<salt>.dat` for the importer's closure; an absent file is
simply not staged, so it is harmless, and it is the tooling's mirror of the
legacy reads above.

## 4. What moved

Nothing.  Every case whose thermophysical system names
`electrolyteGammaPhi` -- 42 case roots, 21 of which reach this builder (the rest take the reactive path) --
was run under the parent build and this one, and the result block of every
one is byte-identical (the case path normalised).  Every golden passes.  No
row is offered for re-recording.

## 5. Gate

`check_v2_refusals`, a new arm beside the 2026-09-07 solid-phase arm, because
the two share the fixture and the adapter.  (a) two salts, nothing declared:
REFUSES naming both and `solidPhases`; (a') `halite` declared: NaCl in BOTH
list orders, and the decision ANNOUNCED; (b) the lithium plant with NaCl and
LiCl reversed in its GLOBAL list: NaCl announced, every stream and KPI
reproduced by name to 1e-9.  Three by-hand sabotages are in the gate's
docstring; the one to remember is S10 (ownership disabled), which (b)
SURVIVES because the flagship's legacy snapshot names NaCl too.  That is the
legacy route working, and it is why (a') builds a case without one.

## 6. Not done, said plainly

* A sector's `components ( ... )` line is replaced by the plant's global
  list and so is not read at all.  The BRINE sector's line now carries a
  comment saying so, but a declaration the engine discards is its own
  defect, recorded here and not fixed.
* No key names an active salt directly, so a salt that owns no solid phase
  (LiCl here) cannot be made active beside another salt.  A direct
  `activeSalt` key would be new grammar, and that is Vítor's.
* The lithium plant still ships the retired `chemistry/salts/halite.dat`
  and `phases/solid/{halite,zabuyelite}.dat` snapshots (unclaimed by its
  manifest).  Removing them is a re-import of a sealed case.
* `generated/gateManifest.json` carries `check_v2_refusals`' previous claim
  line until it is regenerated.
