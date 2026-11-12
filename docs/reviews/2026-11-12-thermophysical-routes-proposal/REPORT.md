# Review by measurement of a proposal: thermophysical property routes (C378)

Date: 2026-11-12.  Reviewed: docs/design/thermophysical-property-routes.md
at main 638b61d85, revision 2 WITH its "Amendments after the second
review"; the engine built from 206b33d108 (the later commit touches no
source).  A review of a PROPOSAL: nothing here is built, so its findings
are design points, not defects of running code.  `run_reproductions.sh`,
`independent_density.py`, `independent_transport.py` and `census.py`
regenerate the tables; each was run twice with identical output.

## 1. The record's measured motivation, reproduced (`reproductions.tsv`)

| claim | verdict | numbers |
|---|---|---|
| CO2 liquid volume stored at 273 K read as 25 C | confirmed | +30.5 / +31.8 % at 280 / 298.15 K against Span-Wagner (engine and an own implementation agree to 0.003 %); anchored at its stated 273 K the error falls to +1.0 / +2.0 % |
| water without its reference equation | confirmed | +2.0 / +1.6 / -3.5 / -6.5 % at 273.16 / 277.16 / 373.16 / 573.16 K (own Wagner-Pruss), no 4 C maximum, no pressure effect |
| eleven units bypass the central density | confirmed, plus one | a twelfth constant-density consumer (batch electrodialysis through the carrier constant); four thermo-layer raw volume readers |
| water + ethanol viscosity about -60 % | confirmed | -59.7 % at x = 0.30 (the record compares x = 0.25 computed with x = 0.30 measured: form) |
| Brock-Bird on water +49 % | confirmed | +49.0 % (own Brock-Bird 106.52 mN/m) |
| Brock-Bird declared in 15 cases | differs | 24 case dictionaries + one bench; 9 of them contain water |
| association factor > 1 in 10 records | differs | 3 (recounted by the commander) |
| "water.dat binds IAPWS-95" | differs | today water.dat binds nothing; a case chooses `pureFluids { water { method IF97; } }` (water.dat's own header, read by the commander) |
| solution-file key at ThermoPackageBuilder.cpp:2594 | citation wrong | it is SolutionRegistry.cpp:45; :2594 is the Henry key |

Added by the review: the 273 K CO2 volume is one member of a CLASS (six
records state "at Tb", one 273 K, one 465 K, 32 state no temperature);
liquid N2 at 90 K and CH4 at 120 K are refused although the engine carries
reference equations for both; Wilke-Chang reads CO2's stored 273 K volume
where section 3.8 says a volume at Tb (D of CO2 in water -12.5 % against
the Versteeg-van Swaaij correlation); Brock-Bird is +49 % on ethylene
glycol and +60 % on triethanolamine, which the `associating` derivation
does not flag (43 of 95 hydrogen-bonding records carry none of its three
source facts).

## 2. The counterexample the laptop asked for (attack (a))

The declined objection (a reference equation above a case-declared
correlation) was to reopen only on a case where the order picks badly
WITH the deviation printed.  Four are offered (`attacks.tsv`):

1. **Outside its own domain** (TR-01).  A declared correlation used beyond
   the domain IT declares is "an announced extrapolation" and still wins.
   The record's own caustic fit (20-60 C, w[NaOH] <= 0.30) is extrapolated
   in the triple-effect NaOH case (an effect near 130 C, 50 wt %), while the
   catalogue's Olsson law (0-200 C) is inside its domain.  Respecting a
   deliberate choice does not cover a state the user's own domain excludes.
   Proposed: outside its domain a declared correlation REFUSES where an
   applicable catalogue method exists, and extrapolates only where none
   does.
2. **No constituent set** (TR-02).  At w[NaOH] = 0 that fit captures pure
   water and any other liquid; for an ethanol stream the beaten method
   states no uncertainty, so nothing is counted.  Proposed: a declared
   correlation names its `system ( ... )` and basis, as a solution record
   does.
3. **Outer drivers** (TR-04).  In `optim05_reactor_npv` the optimiser
   varies a CSTR's feed temperature; the caveat block reports one named
   pass and the result JSON and goldens carry only the chosen value, so a
   deviation at any other pass reaches only the console, and a point
   measurement that holds at some iterates and not others makes the
   objective jump.  Proposed: freeze a state-dependent choice for the whole
   run; publish the largest deviation and its state in the result JSON;
   pin it.
4. **The counting threshold is undefined where the catalogue is weakest**
   (TR-03): composites and ideal mixing state no uncertainty, bare Rackett a
   generic 15 %, so on a molecular mixture no deviation is ever counted.

What the review agrees with: case over catalogue, INSIDE the domain and the
constituent set the case declares.  Ties within a tier are not settled
(TR-07: IF97 and IAPWS-95 for water; two measurement files; a case-local
and a standards solution record; whether an explicit `model BrockBird;`
pins the method, which decides whether the nine water cases keep +49 %).

## 3. Point measurements (attack (b))

The pilot's own stream breaks the rule (TR-05): in feed -> pump -> CSTR the
pump reads the fed stream and gets the point, the CSTR reads the pump
outlet and gets the law -- one liquid, two densities across a pump.  A
real non-fixed stream where a point is the right datum exists (an
evaporator product held at a target concentration by a design spec,
measured by a densitometer).  Proposed: decide at the converged answer --
solve without the point, re-solve with it frozen if the answer lies within
its conditions, check again, refuse rather than toggle.  The amended pilot
carries no tolerances (TR-06), so "at the declared state" is decided by
round-off.

## 4. The hypothesis words (attack (c))

`pricedDensity` drops a component only where its pure density is not
finite, `neglectedIn` everywhere (TR-08); a mole-fraction limit on a
polymer passes or refuses on the molar-mass convention (TR-09:
apalutamide01's HPMCAS, 2.3e-3 or 1.3e-4); nothing says what happens when
both words name one component (TR-10).  No third word is needed, but a
measurement tolerance wider than its uncertainty is already a concession
outside the vocabulary: list every concession in one header table.

## 5. Other points and the migration

Composite tiers when a leaf comes from a hypothesis (TR-14); a declared
correlation's result not dimension-checked as the rate laws are (TR-20);
the batch and dynamic binaries and the outer drivers never mentioned
(TR-15); Wilke-Chang's inputs are not a state of one phase (TR-13); the
gas phase's equation of state absent from the methods table (TR-21).
Migration: byte-identical goldens cannot show that a route no case
exercises is unchanged -- a characterisation bench over every record and
route, recorded before slice 0, is proposed (TR-16); the pilot's judgement
point cannot fail in most of its parts (TR-17).

## 6. Findings

21 rows in `findings.tsv` (TR-01..TR-21): none S1; 18 S2; 3 S3.  They are
findings on a PROPOSAL and are entered in the ledger with that cell; they
do not describe running code.

## 7. Not examined

The record's literature citations; the Olsson coefficients; the ThermoML
DOIs; an independent IAPWS-95 at 500 bar; which CO2 cases slice S0b would
move; the values the scripts mark "recalled".
