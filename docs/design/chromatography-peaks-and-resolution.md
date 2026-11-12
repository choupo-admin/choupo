# Chromatography: peaks, plates and resolution (the `chromatography` EduTool)

The page answers one question a student brings to a column: *I want to
separate two solutes on a column: when does each come out, how wide are the
peaks, are they resolved, and what changes when I load more?*  It sits on the
shelf of `breakthrough` (the same kind of bed fed a step) and `lub-scaleup`,
and its Theory Guide anchor is `sec:chromatography`, a subsection of the
adsorption chapter `ch:adsorption`.

This record says who computes what, derives the arithmetic the page carries,
records the measurement that decided how the engine is used, and lists every
published form the page relies on with its checking status (section 7).

## 1. The split, and why it is route A

There is no chromatography unit in the engine.  What there is: the gas-phase
`fixedBedAdsorber` (`src/unitOperations/batch/FixedBedAdsorber.{H,cpp}`, run
by `choupoBatch`), a 1-D isothermal bed with a declared axial dispersion and a
linear-driving-force uptake, on `henry` and `langmuir` isotherm records
(`src/thermo/adsorbent/IsothermModel.cpp`), and a recipe that can re-declare
the feed composition mid-run (`batch19_feed_switch_purge`).  A pulse is a feed
switched on and then off.

Before choosing, the pulse was MEASURED natively (section 4): a two-solute
injection on a synthetic Henry sorbent runs in 0.75 s (100 cells) to 7.4 s
(800 cells), closes its mass balance to 1e-13, puts the first moments where
the mass balance says to 1e-6 relative, and puts the variances where the
moment formulas say to 0.4 % or better once the grid's own dispersion is
counted.  So the decision is **route A**:

* **the ENGINE runs the linear pulse.**  The page writes a `choupoBatch` case
  (`chromCaseFiles` in `gui/src/case/chromatography.ts`): one
  `fixedBedAdsorber` of 200 cells, a synthetic case-local sorbent whose Henry
  constants are the page's knobs, a feed of 0.5 % of each of two solutes in
  helium, and a recipe that sets both solute fractions to zero at `t_inj`.  It
  runs in the browser like every other page's witness.  The page reads the
  outlet histories `bed.c_out_<i>` and the KPIs `t_stoichiometric_<i>`, `Pe`,
  `t_end`, `mass_closure_<i>` off the run, and draws an answer only when its
  own t_st, Pe and end time match the knobs (`engineMatches`), so a run that
  finishes after a knob moved is never drawn as the current one.
* **the PAGE carries the closed forms** -- retention, the moments of a linear
  pulse, the plate model, the van Deemter curve, resolution, the cut
  arithmetic -- and **its own integration** of the same two bed equations for
  what the engine cannot be asked: a pulse on a Langmuir isotherm at high
  load, in concentration units, swept over load (`solveColumn`).
* **liquid chromatography has no engine route**, and the page says so (the
  first limit).  The engine's bed is a gas: its isotherms are written on
  partial pressures and its feed is a gas.  The overloaded column is the
  page's integration of equations whose form is that of a liquid column.

The two solutes carry the names CH4 and CO2 because the engine needs catalogue
components for a gas; their isotherm records are synthetic (the knobs) and say
so in their provenance, and nothing on the page is a claim about methane or
carbon dioxide on any real adsorbent.

## 2. The moments of a linear pulse (derived here and tested)

The engine's bed equations (`FixedBedAdsorber.H`, superficial basis, `c` in
mol per m3 of fluid, `q` in mol per kg of adsorbent):

    eps dc/dt + rho_b dq/dt = -u dc/dz + Dax d2c/dz2
    dq/dt = k (q*(c) - q)

so with `v = u/eps` and `D = Dax/eps` (the engine's own `gershgorin_` writes
`Di = Dax_/eps_`, `FixedBedAdsorber.cpp` line 1334):

    dc/dt + (rho_b/eps) dq/dt = -v dc/dz + D d2c/dz2.

For a straight isotherm `q* = K_c c`, with `k' = rho_b K_c / eps`, the Laplace
transform in time (zero initial state) gives `q = k K_c c / (s + k)` and

    D c'' - v c' - G(s) c = 0,    G(s) = s [1 + k' k / (s + k)].

The outlet transfer function depends on `s` only through `G(s) L / v` and on
the Peclet number `Pe = v L / D`.  For closed (Danckwerts) ends -- the
engine's inlet face carries exactly `u c_in`, its outlet face no dispersive
flux -- the non-adsorbing vessel with dimensionless time has mean 1 and
variance `2/Pe - 2(1 - e^-Pe)/Pe^2`.  The chain rule on `G` then gives, with
`G'(0) = 1 + k'` and `G''(0) = -2 k'/k`:

    mu1      = L (1 + k') / v
    variance = [2/Pe - 2(1 - e^-Pe)/Pe^2] (L (1 + k')/v)^2  +  2 k' L / (v k).

A rectangular injection of length `t_inj` adds `t_inj/2` to the first moment
and `t_inj^2/12` to the variance (the moments of a convolution add).  For a
long column the first bracket is `2/Pe`, and the plate height
`H = L variance / mu1^2` (injection removed) is

    H = 2 D / v + 2 k' v / (k (1 + k')^2).

**The engine's grid.**  The engine discretises advection first-order upwind.
Its modified equation carries a numerical dispersion `v dz / 2` in the place of
`D`; equivalently, upwind cells with no dispersion are exactly a cascade of
stirred tanks, one plate per cell, `H_grid = dz`.  `linearPulseMoments` takes
an optional `dz` and adds that share; the page lists it as its own column.
The page's own integrator uses a second-order face reconstruction, whose
share is much smaller and falls with the square of the cell.

**Tested**, in `gui/tests/chromatography.test.ts`: the page's integration with
the engine's own first-order scheme on 200 cells reproduces these moments
(grid share included) to 1e-5 in the first moment and 2e-3 in the variance;
with its own second-order scheme the variance error is under 3 % on 100 cells
and falls by more than three times on 200.  Against the engine itself, see
section 4.

## 3. The van Deemter terms from the bed's parameters

The engine lumps axial dispersion into one declared coefficient.  The page
writes it from the particle and the solute:

    D_L = gamma D_m + lambda d_p v,    Dax = eps D_L,

with `gamma = 0.7` and `lambda = 0.5` (a particle Peclet number `v d_p / D_L`
of 2 at high velocity) taken as fixed assumptions, said on the page.  With the
plate height of section 2:

    H = 2 lambda d_p + 2 gamma D_m / v + [2 k' / (k (1 + k')^2)] v
      = A + B/v + C v,
    v_opt = sqrt(B/C),  H_min = A + 2 sqrt(B C).

These are the van Deemter, Zuiderweg and Klinkenberg form with the
mass-transfer term written for a solid-film linear driving force; the
original paper resolves film and particle terms separately, which the engine
(and so the page) lumps into `k`.  The engine's peak gives a point on the
curve: `L (variance - t_inj^2/12) / (mu1 - t_inj/2)^2 - dz`; it differs from
the long-column curve by the closed-end `1/Pe` correction, which the page
says.

## 4. The measurement behind route A (native, this tree)

Case: `L = 0.5 m`, `eps = 0.4`, `u = 0.05 m/s`, `area = 0.01 m2`,
`rho_b = 500 kg/m3`, `T = 298.15 K`, `P = 1 bar`, `Dax = 1e-4 m2/s`,
`k = 5 1/s` for both solutes, Henry constants 0.4 (first) and 0.6 (second)
mol/(kg bar), injection 0.5 % of each for 2 s, sampling 0.5 s,
`timeStepping adaptive`.  Theory columns are section 2's formulas with the
upwind grid share; moments of the engine's peaks are trapezoidal integrals of
`trajectory.csv`.

| cells | wall time | solute | mu1 engine | mu1 theory | variance engine | variance theory |
|---|---|---|---|---|---|---|
| 100 | 0.75 s | first  | 54.5791 | 54.5791 | 71.51 | 71.84 (long-column) |
| 200 | 1.5 s  | first  | 54.5791 | 54.5791 | 57.273 | 57.242 |
| 200 | 1.5 s  | second | 79.3686 | 79.3687 | 109.471 | 109.403 |
| 400 | 3.2 s  | first  | 54.5791 | 54.5791 | 50.154 | 50.31 (long-column) |
| 800 | 7.4 s  | first  | 54.5791 | 54.5791 | 46.595 | 46.72 (long-column) |

(The 200-cell theory column includes the closed-end correction; the other
rows were compared before it was written and show the long-column value,
which is the larger by about 0.3 %.)  The engine's `mass_closure_<i>` KPIs
were 3.2e-13 and 2.3e-13; its `t_stoichiometric_<i>` printed 53.579 s and
78.369 s, which are `t_R` exactly (on a straight isotherm the step's
stoichiometric time is the pulse's retention time).  The physical variance
without the grid is 43.13 (first) and 79.21 (second): on 200 cells the
engine's grid adds 33 % and 38 % to the variance -- which the page shows
rather than hides, as the "theory + engine grid" column.

The page's own integrator, in Node on the same machine: 100 cells
second-order, 0.28 s; 200 cells, 0.87 s; 400 cells, 5.0 s; the engine's
first-order scheme on 200 cells, 0.77 s, matching the engine's variance to
0.01 % (57.278 against 57.273).

**Tolerance the page states:** first moments to the third decimal of a
second; variances within 0.5 % once the grid share is counted.

## 5. The overloaded column (the page's integration)

`solveColumn` integrates the two bed equations on `N` equal cells: the inlet
face carries `u c_in` (the engine's Danckwerts form), interior faces
`u c_face - Dax dc/dz` with `c_face` reconstructed by MUSCL with the van Leer
limiter (first order at the first interior face), the outlet face `u c_N`;
explicit Heun steps of `1 / (2v/dz + 4D/dz^2 + max k(1+k'))` -- the Gershgorin
bound the engine prints for its own explicit route, which also keeps the
MUSCL Courant number below one half.  The inlet is held at its value at the
start of each step and `t_inj` falls on a step boundary, so exactly
`u A c_inj t_inj` is fed.  The mass ledger (fed, out) is integrated with the
same stages as the state, so the closure is telescopic: 1e-14 in every run.
The isotherm is competitive Langmuir with one saturation capacity
`q* = q_s b_i c_i / (1 + sum_j b_j c_j)`, `b_i = K_c,i / q_s`; a switch
replaces it by each solute's own Langmuir to show what competition does.  The
load is measured by `b_2 c_inj`.

Integration is spread over frames (`startColumn` + `advance`, about 12 ms a
slice), so the page never holds the browser.

**Tests** (`gui/tests/chromatography.test.ts`): ledger closure under 1e-12;
at `b_2 c_inj = 1e-4` the Langmuir pulse's first moments agree with the
linear pulse to 2e-4 and variances to 2e-3; at 0.8 every peak elutes earlier
than on the straight isotherm, its maximum sits before its first moment (a
sharp front and a tail), and competition moves the first solute earlier than
its non-competitive twin; grid convergence of the overloaded peak on 100,
200 and 400 cells (the 100-cell peak height within 5 % of the 400-cell one,
the 200-cell one closer, the 99 % recovery within 3 points).  The page states
its grid (100 cells) and offers a button that re-integrates on 200 and prints
the change.

**Numbers at the page's defaults** (`L 0.5 m`, `u 0.05 m/s`, Henry 0.4 and
0.6, `k 5`, `d_p 2 mm`, `D_m 6e-5 m2/s`, so `Dax = 6.68e-5 m2/s`, `q_s 2
mol/kg`, injection 10 s, 99 % purity), measured in Node:

| b2 c_inj | injected, mol each | recovery 1 | recovered 1, mol | recovery 2 | recovered 2, mol |
|---|---|---|---|---|---|
| 0.02 | 0.0134 | 80.2 % | 0.0108 | 81.7 % | 0.0110 |
| 0.05 | 0.0336 | 79.4 % | 0.0267 | 80.6 % | 0.0271 |
| 0.1  | 0.0672 | 78.0 % | 0.0524 | 78.0 % | 0.0525 |
| 0.2  | 0.134  | 73.8 % | 0.0992 | 70.8 % | 0.0952 |
| 0.4  | 0.269  | 63.4 % | 0.170  | 53.2 % | 0.143  |
| 0.8  | 0.538  | 42.7 % | 0.230  | 31.6 % | 0.170  |
| 1.6  | 1.08   | 13.4 % | 0.144  | 17.0 % | 0.183  |

The first product's recovered amount rises to the 0.8 load and falls at 1.6:
the trade the page exists to show.  The page picks no best load.

At the defaults the linear column gives `R_s = 0.893` (exact), 0.784 from the
fundamental equation with the second peak's `N = 98`, and needs 1.41 m for
`R_s = 1.5` at the same velocity.

## 6. Engine findings met (reported, not fixed)

1. **`solutionControl { write false; }` does not stop the fixed bed's
   profiles.**  `choupoBatch` announces "no <t>/ time directories
   (trajectory.csv only)", and the run then writes `<t>/bed.profile` at every
   `writeInterval` (`FixedBedAdsorber::writeProfile_`, `FixedBedAdsorber.cpp`
   around line 1900, called unconditionally).  The page's run asks for a
   0.5 s grid, so a run writes a few hundred profile files that the page never
   reads.
2. **The Theory Guide's dispersive flux disagrees with the engine by a factor
   eps.**  `docs/theoryGuide.tex` (subsection "The 1-D isothermal fixed bed")
   writes the dispersive face flux as `-eps Dax A dc/dz`; the code writes
   `Dax (c_R - c_L)/dz` with no `eps` (`FixedBedAdsorber.cpp` line 1451 and
   lines 1662-1674), as does `FixedBedAdsorber.H`.  The moment comparison of
   section 4 settles which is run: with `D = Dax/eps` the variances agree to
   0.05 %; with `D = Dax` they would be off by 25 %.  This page's guide text
   follows the code.
3. **The engine's bed has no liquid route.**  A proposal, not a request: a
   concentration-basis isotherm (`loadingBasis molPerKgAdsorbent;
   concentrationBasis molPerM3;`) on the same bed would let the engine run a
   liquid column, and the overloaded integration could then move into the
   engine as a recipe-driven pulse, with the page a drawing over it.

## 7. To check against the source

Nothing below was read in the source during this work; every form is written
from the published form as commonly stated, and its status says what was
done instead.

| what | the work | where on the page | status |
|---|---|---|---|
| plate model: a column as N equilibrium plates; sigma = t_R/sqrt(N) | Martin & Synge, Biochem. J. 35 (1941) 1358, doi:10.1042/bj0351358 | step 2 | unchecked against the paper; the Erlang/gamma form and its moments derived here and tested (plate model: area 1, mean t_R, variance t_R^2/N to 1e-3) |
| H = A + B/v + C v; u_opt and H_min | van Deemter, Zuiderweg & Klinkenberg, Chem. Eng. Sci. 5 (1956) 271, doi:10.1016/0009-2509(56)80003-1 | step 3 | unchecked against the paper; the three terms DERIVED here from the bed equations (section 2-3) and tested numerically (the integration reproduces the variance) |
| linear-driving-force uptake | Glueckauf, Trans. Faraday Soc. 51 (1955) 1540, doi:10.1039/tf9555101540 | steps 1, 3, 5 | checked against tree: `FixedBedAdsorber.H` (governing equations) |
| moments of a linear pulse with dispersion and LDF; closed-vessel variance 2/Pe - 2(1-e^-Pe)/Pe^2 | Ruthven, Principles of Adsorption and Adsorption Processes, Wiley 1984 (moment analysis) | step 1 panel, step 3 | derived here (section 2) and tested against the page's integration and the engine (section 4); not read in the book |
| D_L = gamma D_m + lambda d_p v, gamma = 0.7, lambda = 0.5 | Ruthven 1984; Seader, Henley & Roper, Separation Process Principles, 3rd ed., Wiley 2011 | step 3 | unchecked: typical values used as stated assumptions |
| resolution R_s with 4-sigma base widths; R_s = 1.5 baseline; fundamental resolution equation | Seader, Henley & Roper 2011 (chromatography) | step 4 | unchecked in the book; the 0.13 % per side at R_s = 1.5 computed here (erf) and tested |
| competitive Langmuir with one q_s; front sharpening and tailing at overload; displacement | Guiochon, J. Chromatogr. A 965 (2002) 129, doi:10.1016/S0021-9673(01)01471-6 | step 5 | unchecked against the review; the behaviour shown is the page's integration, tested for the low-load limit, the ledger and the grid |
| purity and recovery of a cut; productivity at a purity target | Guiochon 2002 | step 6 | unchecked; arithmetic is the page's own (integrals of the outlet histories), tested on sampled Gaussians against the erf form |

DOIs resolved on Crossref on 2026-11-12 (authors, title, journal, volume,
pages and year matched); the two books by Open Library ISBN records.  No table
or figure from any of them is reproduced: every number on the page is the
page's own example.

## 8. Not done

Gradient elution, extra-column broadening, a non-isothermal band, the
sorption effect of a concentrated gas pulse (the page holds the velocity
constant and says so), a measured competitive isotherm, simulated moving bed,
and any choice of the "best" load.
