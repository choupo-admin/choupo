# A dryer that ended wetter than it started

*Record of the 2026-09-04 slice.  Found by Vítor, on the live site, by opening
the flagship sugar plant and looking at the mass-balance plot.*

## 1.  What he saw, and the question he asked

The plot showed inputs 22 032 kg/h against outputs 24 980 — matter not
conserved, on the plant a visiting professor would open first.  His question
was the right one and it is the whole of this record:

> *Um caso que tenha violação de balanço tem de dar fail, não é?*

It did not.  It could not.

## 2.  The wrong answer I gave first

I checked the plant's non-sweep twin (`ChemicalPlantTutorial`), found it
closes to +0.0 kg/h, and told him the plant was fine and the GUI was
double-counting boundary aliases.  **That was wrong**, and the way it was
wrong is worth keeping: I reasoned from a DIFFERENT CASE to the one in front
of me.  The two share a flowsheet verbatim; they differ in the feed the sweep
walks, and the defect is composition-dependent.

Summing only the root boundary edges — no aliases, no double counting — the
swept case gives IN 22 031.3 / OUT 24 979.5 = **+2948.2 kg/h (+13.38 %)**,
matching his screen to the kilogram.  The GUI was summing correctly.  The
plant leaked.

## 3.  One unit, and the two lines

Reproduced outside the tree by giving `ChemicalPlantTutorial` the swept feed
(sucrose x = 0.118 against the base 0.06).  Then the reports run, and the
engine says it plainly:

```
massBalance.csv        global closure 113.382 %
elementBalance         worst element off by 41.2485 %
massBalance_byUnit.csv
    DRYING.SD        in 13128.08  out 16076.30  +2948.22  122.4573 %
    the other 10                                +-0.02    100.0000 %
```

The global gap IS the dryer's.  Its own streams:

```
IN   Magma      4724.2 kg/h  ->  water   685 kg/h + sucrose 4039 kg/h
     DryingAir  8403.9 kg/h  ->  N2
OUT  WetPowder  7672.4 kg/h  ->  water  3633 kg/h + sucrose 4039 kg/h
     Exhaust    8403.9 kg/h  ->  N2, unchanged
```

685 kg/h of water in, 3633 out, and `water_evaporated = 0`: a dryer that
dries nothing and invents water.  The cause is two lines:

```cpp
n_water_resid = max(n_resid_kinetic, n_resid_energy);   // a MODEL quantity
n_evap        = max(0.0, n_solv_feed - n_water_resid);  // clamps only the vapour
```

`n_resid_kinetic` is `X_final * m_solid` — a moisture RATIO carried by the dry
solid.  Nothing in it knows how much water the feed brought.  Fed a stream
already drier than the model's equilibrium moisture at the declared water
activity (here the crystalliser's magma, 85.5 % solids), it asks the powder to
hold more water than exists.  The `max(0, …)` protected the vapour from going
negative and let the surplus leave as powder moisture.

## 4.  The fix, and why it announces

**A dryer cannot end wetter than it started.**  The residual is held at the
feed water.  But it is NOT a silent clamp: a model asked for a state its
inputs cannot supply is a model outside its domain, and this project announces
that rather than quietly amending it — the posture of the extrapolated Antoine
and the out-of-band Davies.  The run now says which equilibrium the model
wanted and why nothing evaporates.  Closure: 122.46 % → 100.0000 %.

## 5.  Three silences, and they are the substance

The dryer is one bug.  Why a student met it before we did is three:

1. **Under an outerDict driver the balance reports do not run.**  The case
   DECLARES `reports { massBalance … }`; a sweep has no single representative
   pass, so the chain is skipped — and until today it was skipped in silence.
   The one instrument that catches a violation of conservation was switched
   off on exactly the case that needed it.
2. **The case ships no golden.**
3. **Nothing in `bin/runTests` looked at closure at all.**  A golden pins what
   a run PRINTS, so a stable wrong answer passes by construction.

(1) is now announced by name: *"nothing here has been verified by those
reports — a declared balance that does not run is not a balance."*  Whether a
sweep SHOULD report on its final point is a design question and is NOT
answered here; inventing a representative pass would answer it by accident.

(3) is `bin/curate/check_mass_closure.py`.

## 6.  What building the gate found — in the gate

Two defects, both mine, both caught before it shipped:

* **The discovery grepped the file for `choupoSolve`** and swept in a
  choupoBatch combustion case and a choupoCtrl brine case, because each
  mentions the steady binary in a COMMENT.  It reads the `application` FIELD
  now.  *A gate that measures cases it was never meant to measure reports
  coverage it does not have.*
* **The first version collapsed four states into two and accused three honest
  cases.**  A closed Rankine cycle has no material boundary, so its report
  runs and states exactly that; two userOps tutorials do not run at all
  without a user-compiled unit type.  Four states are now kept apart — checked
  / no-boundary / did-not-run / declared-but-never-emitted — and only the last
  fails.  *A gate that accuses the innocent teaches the reader to ignore it.*

## 7.  The limitation, declared rather than hidden

**No corpus case, at the feeds it ships, triggers the dryer bug.**  With the
fix reverted, `check_mass_closure` PASSES.  What catches it is the
conjunction — the gate, plus the announcement, plus the report actually
running — and the real hole was the sweep, which now fails by name the moment
it goes quiet again.  Closing that properly means deciding whether a sweep
reports on its final point, and that is Vítor's call.

Also not checked: energy closure, and PER-UNIT closure.  The by-unit ledger is
what turned "the plant leaks" into "the dryer leaks" in under a minute, and
two units can still cancel globally.  Named as the next slice.

## 8.  Sabotages

1. dryer cap reverted → the reproducer returns to 113.3819 %.
2. the driver's announcement removed → the gate FAILS naming the sweep.
3. the report's own `totOut` inflated 3 % → the gate FAILS naming three real
   corpus plants, then passes again once restored.
