# Benchmark A -- Cavett's recycle train as the reference sample ships it

**Sample:** "Cavett's Problem" (`PlatformFiles/Common/samples/Cavett's
Problem.dwxmz`) of the reference simulator, DWSIM, read at commit
`1abf72d1b6b41d3e9a8cc770d3cc4e8fc76e5766` (2026-07-17; GPL-3.0); the file
says `BuildVersion 8.8.0.0`, `SavedOn 2024-07-09`.  Its stored state is in
`reference`, written by `read_sample.py`; no file of theirs is copied and no
parameter of their property package is read (benchmarks/README.md).

**What it is:** Cavett's (1963) four-flash recycle train -- the problem the
corpus case `tutorials/steady/flowsheets/cavett01_recycle_train` carries on
its PRIMARY specification (Rosen & Pauls 1977; Rosen 2005) -- as the sample
wires and specifies it: four gas-liquid separators at the primary's four
temperatures, THREE COMPRESSORS lifting each recycled vapour to the stage
above (75 % isentropic efficiency, discharge pressure the stage's), THREE
VALVES letting each liquid down, three recycle blocks, and the sample's
reading of the primary's pressures.  The corpus cavett01 (SRK, kij = 0, the
primary's psia) is untouched and is a different case.

## How this case is built

* **Pressures as the sample reads them.**  The primary gives 800 / 270 /
  49 / 13 **psia**.  The sample stores 5617161 / 1962938 / 439196 / 190985 Pa,
  which are (800 / 270 / 49 / 13 **+ 14.7**) psi x 6894.757 Pa/psi to the
  pascal: it read the primary's psia as **psig**.  This case uses the
  sample's pascals (the comparison is with the sample); the dict says so.
* **Thermodynamics:** phi-phi PR78 (Choupo's `PengRobinson`, the 1978
  two-branch slope since 2026-10-21) with the PPR78 group-contribution kij
  of Jaubert, Privat & Mutelet (AIChE J. 56 (2010) 3225, DOI
  10.1002/aic.12232) -- Vitor's ruling for this case ("Usa o PR78"; route
  P, "kij a T declarada").  The table and the group decompositions are a
  cited record, `constant/parameters/PPR78/jaubert2010.dat` (28 group
  pairs, read from the page image by two readers; the PDF text layer drops
  minus signs).  The `ppr78Kij` props op in `kijTables/` evaluates Eq. 7
  ONCE at each separator's declared temperature on Choupo's own PR78 a_i(T)
  and b_i and writes a kij SET record per separator
  (`constant/parameters/PengRobinson/ppr78_<unit>_<T>K.dat`, 105 pairs each,
  every intermediate beside each value); the flowsheet declares them.  The
  global package carries the 322.03 K set (SEP0's); SEP1, SEP2 and SEP3
  carry their own through a `thermo {}` override.  **Stated default:** a
  compressor, valve or mixer declares no temperature and reads the
  inherited 322.03 K set.  No component of this case has omega > 0.491
  (n-decane, the heaviest, is 0.4884), so the 1978 branch is not exercised.
* **Tc, Pc, omega are the catalogue's** (`data/standards/components/`); the
  sample's are its databank's.  A kij from Eq. 7 moves with the critical
  constants it is evaluated on, so the two programs' kij matrices differ
  before anything else does.
* **The compressors declare `P_out`** -- the form built for this case
  (DEV.md 4c C123; the shaft power is the result).  **The tears are the two
  mixer outlets** (cavett01's choice); Newton on the tears.

## Findings on the reference side (stated neutrally, from `reference`)

* **The feed is not the primary's.**  The sample has 15 compounds and NO
  n-undecane; its n-decane mole fraction, 0.0741, is within 0.0007 of the
  primary's n-decane + n-undecane (0.0304 + 0.0444).  Its total, 5908.21
  mol/s, is neither the primary's 27340.6 lbmol/h (3444.9 mol/s) nor that
  number read as kmol/h (7594.6 mol/s); the ratio to the latter is 0.7779.
  This case runs the sample's feed as stored (0/s2).
* **psig for psia**, above.
* **Each recycle block reports `converged true` after `iterationsTaken 1`.**
* **The stored state's own balances** are printed by `compare.py` (feed
  against the two products, component by component; the first law over
  the stored stream enthalpies and duties).

## Comparison

Run `python3 -I benchmarks/dwsim/compare.py recycle01_cavett_as_shipped`
(needs `make all`).  The table it prints is reproduced below.

COMPARISON_TABLE_PLACEHOLDER

## Findings on Choupo's side

CHOUPO_FINDINGS_PLACEHOLDER
