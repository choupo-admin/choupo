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

The first moment is Ruthven's Eq. (8.36) and the two variance terms are
his Eqs. (8.37)/(8.40) and Nicoud's Table 2.4 (section 7 says where they
differ: both books print the dispersion term for open ("simplified") ends,
`(2/Pe) t_R^2`, and the closed-end bracket here is the Danckwerts one, re-derived
from the Laplace transform and checked to 1e-19 against a symbolic series at
Pe = 250 and Pe = 3).

A rectangular injection of length `t_inj` adds `t_inj/2` to the first moment
and `t_inj^2/12` to the variance (the moments of a convolution add).  For a
long column the first bracket is `2/Pe`, and the plate height
`H = L variance / mu1^2` (injection removed) is

    H = 2 D / v + 2 k' v / (k (1 + k')^2).

**The engine's grid.**  The case the page writes declares `convectionScheme
upwind;` (C375: the engine's default became the second-order van Leer scheme,
which has no `v dz / 2` term; the page keeps first-order upwind because the
grid share below is the lesson and its arithmetic is exact for upwind only).
Under that declaration the engine discretises advection first-order upwind.
Its modified equation carries a numerical dispersion `v dz / 2` in the place of
`D`; equivalently, upwind cells with no dispersion are exactly a cascade of
stirred tanks, one plate per cell, `H_grid = dz`.  `linearPulseMoments` takes
an optional `dz` and adds that share; the page lists it as its own column.
The page's own integrator uses a second-order face reconstruction, whose
share is much smaller and falls with the square of the cell.

**Tested**, in `gui/tests/chromatography.test.ts`: the page's integration with
the first-order scheme the engine case declares, on 200 cells, reproduces these moments
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
mass-transfer term written for a solid-film linear driving force.  Read
against the paper itself: its velocity `u` is the interstitial velocity of
the mobile phase (list of symbols, p. 288); its Eq. (48) is
`D = gamma D_m + lambda u d_p` (so the page's `D_L`), its Eq. (38) is
`H = 2D/u + 2 (u F_I/alpha) / (1 + K F_I/F_II)^2` and Eq. (49) is the same
sum as `H/d_p = 2 gamma D_I/(u d_p) + 2 lambda + C u d_p/D_I`, with a
dimensionless `C` made of a film resistance (Eq. 42, Ergun's correlation) and
a particle-diffusion resistance (Eq. 44) added in series (Eq. 45).  The
paper does not use the letters A, B, C: the page's `A = 2 lambda d_p` and
`B = 2 gamma D_m` are its first two terms exactly, and the page's
`C = 2 k'/(k (1+k')^2)` is its Eq. (38) mass-transfer term when its
coefficient `alpha` (per unit volume of packing) is written as a rate
constant on the stationary phase, `alpha = k F_I k'` (derived here; the same
form is Ruthven's Eq. 8.49 and Nicoud's Eq. 2.50); the paper's film and
particle resistances are lumped into `k`.  The paper's `lambda` is not the
page's: they fitted 8, 3 and about 0 to one set of ion-exclusion data (p.
282), and give 0.5 to 1 for the labyrinth factor `gamma` (p. 281); the page
takes `gamma = 0.7` and `lambda = 0.5`, a particle Peclet number of 2.
`lambda = 0.5` is on the low side: Nicoud (p. 39) says the hydrodynamic plate
height `L/J` of a well-packed column is about two particle diameters
(`lambda` about 1), and Wankat's Chung-Wen correlation (Eq. 17-61,
`eps Pe_p = 0.2 + 0.011 Re^0.48`) gives `lambda` of about 1.3 to 2 for
Re between 0.1 and 100.  The page keeps its default (every number in the
guides depends on it) and says so.  The engine's peak gives a point on the
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

**Re-measured at integration** (native, this tree, 2026-11-12, the page's
own case writer at 100, 200 and 400 cells, `t_inj` 2 s, trapezoidal moments of
`bed.c_out_<i>`; run with the case sealed by `choupo-import`): the first
moments are 54.5791 s and 79.3686 s at every grid (theory 54.5791 and
79.3687).  The variances of the first solute at 100/200/400 cells are
71.5108, 57.2732 and 50.1544 s^2 for `Dax = 1e-4`, and a least-squares fit
`var = V0 + s/N` through the three points gives `V0 = 43.0356` against the
closed-form physical 43.0389 (7.7e-5 relative), with residual 4e-5 and
`s = 2847.5`, which is 0.992 of `t_R^2` = 2870.7 (the upwind modified
equation: `v dz/2` in `D` adds `t_R^2 dz/L`).  Second solute: `V0 = 79.0227`
against 79.0175, `s = 6088` against 6142.  At the page's own default
(`Dax = 6.68e-5`, 200 cells) the fitted grid share of the variance is 28.7 %
(first solute) and 32.7 % (second); at 100 cells 44.6 % and 49.3 %; at 400
cells 16.8 % and 19.6 %.  The residual against the closed-form
"theory + grid" is 0.19 %, 0.05 % and 0.01 % at 100, 200, 400 cells.

**Tolerance the page states:** first moments to the third decimal of a
second; variances within 0.5 % once the grid share is counted (200 cells and
finer; 0.2 % at 100).

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
   `writeInterval` (`FixedBedAdsorber::noteTimeAdvanced` calls
   `writeProfile_` whenever the unit's own `writeInterval_`, read from
   `controlDict` in its constructor, is positive; it never consults
   `solutionControl`).  Confirmed at integration: a 144.5 s run writes 290
   time directories each holding `bed.profile`, after the header line
   "write false -> no <t>/ time directories".  The page's run asks for a
   0.5 s grid, so a run writes a few hundred profile files that the page never
   reads.
2. **The Theory Guide's dispersive flux disagreed with the engine by a factor
   eps (corrected at integration).**  `docs/theoryGuide.tex` (subsection "The
   1-D isothermal fixed bed") wrote the dispersive face flux as
   `-eps Dax A dc/dz`; the code writes `Dax (c_R - c_L)/dz` with no `eps`
   (the face flux in the right-hand-side routine and the explicit-scheme
   rows) and divides the whole row by `eps_`, as `gershgorin_` does
   (`Di = Dax_/eps_`).  The moment comparison of section 4 settles which is
   run: with `D = Dax/eps` the variances agree to 0.2 %, 0.05 % and 0.01 % at
   100, 200 and 400 cells; with `D = Dax` they would be low by 19 %, 24 % and
   27 % (first solute).  The guide now follows the code.
3. **The engine's bed has no liquid route.**  A proposal, not a request: a
   concentration-basis isotherm (`loadingBasis molPerKgAdsorbent;
   concentrationBasis molPerM3;`) on the same bed would let the engine run a
   liquid column, and the overloaded integration could then move into the
   engine as a recipe-driven pulse, with the page a drawing over it.

## 7. Checked against the sources in hand (integration review, 2026-11-12)

The first version of this section was a list of forms written from memory,
every one `unchecked`.  Every row below was read in a work in hand
(Wankat 2nd ed., Schmidt-Traub, Schulte and Seidel-Morgenstern 3rd ed.
[S-T], Nicoud, Ruthven 1984 [a scan, read as images], Seader 4th ed., the two
1941 and 1956 papers) and compared with the page's text and code.  Guiochon
(2002, 2006) is not in hand: a row that rests on it is checked against a
book that prints the equation, and marked "original not read".  Page numbers
are the printed ones.

Verdicts: **matches** (the equation is printed, same form); **differs** (how);
**derived** (not printed in a work in hand; re-derived here and said whether
it holds); **not found in hand**.

| # | what the page says | work, equation, page | verdict |
|---|---|---|---|
| 1 | retention time `t_R = t0 (1+k')`, `t0 = L eps/u` | Ruthven Eq. 8.36 p. 242; Wankat Eq. 17-15a p. 624; Seader Eq. 15-171 p. 504; S-T Eq. 2.14 p. 17 | matches |
| 2 | retention factor `k' = rho_b K_c/eps = (1-eps)/eps K`, `K = rho_p K_c`, `rho_p = rho_b/(1-eps)`; which porosity: the bed (interparticle) void, pore fluid counted with the solid | Ruthven Eq. 8.36 (his `K = eps_p + (1-eps_p) K_c` is per particle volume, pores inside); Wankat Eq. 17-15a keeps the pore fluid as a separate term `(1-eps_e) eps_p K_d / eps_e`; S-T Eqs. 2.5, 2.14, 2.40 use the TOTAL porosity `eps_t` and a pore-penetrating tracer for `t0` | matches Ruthven; **differs from S-T / the chromatographic convention** (S-T `k' = H (1-eps_t)/eps_t`, smaller; `t_R` identical). Stated in lesson step 1 since integration |
| 3 | gas: `K_c = H R T` with `H` per bar | Wankat Eq. 17-14c p. 624 | matches (ideal gas, `p_i = c_i R T`, as the engine does) |
| 4 | first moment of the outlet pulse `t_R + t_inj/2` | Ruthven Eq. 8.36; Nicoud Table 2.4 p. 39 (`mu1 = t0 (1+K')`); the half-injection term is the mean of a uniform pulse | matches (the injection term: derived here, trivial, holds) |
| 5 | variance, kinetic term `2 k' L/(v k)` | Nicoud Table 2.4 and Eq. 2.50 p. 39 (`2 K' t_Am t0`, `t_Am = 1/k`); Ruthven Eq. 8.40 p. 243 | matches |
| 6 | variance, dispersion term for CLOSED (Danckwerts) ends `[2/Pe - 2 (1-e^-Pe)/Pe^2] t_R^2` | Ruthven Eqs. 8.37, 8.40 and Nicoud Table 2.4 print `(2/Pe) t_R^2` (open / "simplified" ends); Nicoud App. B Eq. B.8 states the Danckwerts conditions but gives no variance | **differs** by `-2(1-e^-Pe)/Pe^2` (0.4 % of the term at Pe = 250). Derived here and holds: Laplace transform of the bed with Eq. B.8, series at s = 0 in sympy: mean `1+k'` and the variance formula to 1e-19 at Pe = 250 and Pe = 3; engine matches to 0.01 % at 400 cells |
| 7 | mean for closed ends is exactly `t_R` (no `2/Pe` shift) | Nicoud footnote 2 to Table 2.1, p. 29: first moments `t0`, `t0(1+1/Pe)`, `t0(1+2/Pe)` for "simplified, open-closed, closed-closed" | **differs** from the footnote as labelled; derived here and holds for a flux-averaged outlet (the engine's `u c_N`): mean `t_R` to 1e-6 relative (54.5791 s), sympy to 1e-19. The footnote's `1+2/Pe` is the open-open vessel's mean (Levenspiel, not in hand) |
| 8 | injection variance `t_inj^2/12` | uniform pulse; van Deemter et al. treat the finite feed volume in section 2 (p. 279, Fig. 8) | derived, holds |
| 9 | `N = t_R^2/sigma^2 = L/H` | S-T Eqs. 2.16, 2.19 p. 17-18; Wankat Eqs. 17-78b, 17-80a; Ruthven Eqs. 8.48-8.49 p. 249; Nicoud Eqs. 2.49-2.50 | matches |
| 10 | `N = Pe/2`, `H = 2D/v` (the dispersion part of `H`) | Wankat Eq. 17-78a p. 684; Ruthven Eq. 8.48 | matches |
| 11 | van Deemter `H = A + B/v + C v`; `u` interstitial; `A = 2 lambda d_p`, `B = 2 gamma D_m`, `C = 2k'/(k(1+k')^2)` | van Deemter, Zuiderweg and Klinkenberg Eqs. 38 (p. 279), 47-49 (p. 282), list of symbols (p. 288: `u` interstitial velocity); S-T Eq. 2.24 p. 19; Ruthven Eq. 8.49-8.50 p. 249; Nicoud Eq. 2.50 | matches. The paper has no letters A, B, C: its `H/d_p = 2 gamma D_I/(u d_p) + 2 lambda + C u d_p/D_I` (Eq. 49) has the page's first two terms exactly; the page's `C` is the paper's Eq. 38 mass-transfer term with `alpha = k F_I k'` (derived here) and the paper's film (Eq. 42) and particle (Eq. 44) resistances lumped into `k` |
| 12 | `D_L = gamma D_m + lambda d_p v` | van Deemter et al. Eq. 48 p. 282 (`D = gamma D_I + lambda u d_p`) | matches |
| 13 | `gamma = 0.7` | van Deemter et al. p. 281: "of the order of magnitude of 0.5-1.0" | matches (inside the range) |
| 14 | `lambda = 0.5`, "a particle Peclet number of 2" | van Deemter et al. fitted 8, 3, about 0 (p. 282); Nicoud p. 39: `L_col/J` about 2 `d_p` for well-packed columns (`lambda` about 1); Wankat Eq. 17-61 (Chung-Wen) `eps Pe_p = 0.2 + 0.011 Re^0.48`: `lambda` 1.3 to 2 at Re 0.1 to 100 | **differs**: 0.5 is below every printed value (optimistic packing). Kept as the page's labelled assumption; wording corrected (lesson steps 3 and limits, guides) |
| 15 | plate model: the outlet of `N` equal stirred plates is the Erlang (gamma) density, mean `t_R`, variance `t_R^2/N` | Martin and Synge Eq. 1 p. 1360 (`Q_{r+1} = (v/V)^r e^{-v/V}/r!`, from the binomial table of the same page, with plate `r+1 = N`); Ruthven Eq. 8.47 p. 248 (transfer function of `N` stages) | matches (their quantity is the amount in plate `r` as a function of eluent volume, the same function as the effluent concentration); the moments re-derived here and tested |
| 16 | Gaussian limit `sigma = t_R/sqrt(N)`, peak height `m/(sigma sqrt(2 pi))` | Martin and Synge p. 1361-1362 (normal curve for `r > 100`, `v = r + t sqrt(r)`); Wankat Eqs. 17-79, 17-80a | matches |
| 17 | resolution `R_s = (t2 - t1)/(2(sigma1+sigma2))`, base widths `4 sigma`, `R_s = 1.5` baseline | Wankat Eq. 17-82 p. 685 (`= 2 Delta t/(w_A + w_B)`, tangent widths); S-T Eq. 2.25 p. 20 (`w = 4 sigma`) | matches |
| 18 | at `R_s = 1.5` of two equal Gaussians the centres are 6 sigma apart and a midway cut leaves 0.13 % per side | Martin and Synge p. 1362 (tail area 0.13 % at `t = 3`); S-T p. 21 (R_s = 1.5 is the touching-band baseline); Wankat p. 685 (R = 1: about 2 % overlap; S-T says 3 %) | matches (erf: Phi(-3) = 0.00135; the 2 % at R = 1 is Phi(-2) = 2.3 %) |
| 19 | fundamental resolution `(sqrt(N)/4)((alpha-1)/alpha)(k2/(1+k2))`, `alpha = k2'/k1'`, with the page's note that it takes one plate count and the later peak's width for both | S-T Eq. 2.26 p. 21 (same form, "peak width the same for both", `N_j` of the later component); Wankat Eq. 17-83 is the equal-`N` form `(sqrt(N)/4)(u_A - u_B)/u_mean`, which equals the exact `R_s` for equal `N` (checked here) | matches S-T; Wankat's form differs (different approximation, stated in lesson step 4) |
| 20 | purity and recovery of a cut for two Gaussians (erf), and for sampled outlets (trapezoid) | not printed as such; S-T p. 45 and chapter 8 treat yield and purity in words | derived here; holds (tested against the erf form) |
| 21 | competitive Langmuir `q_i = q_s b_i c_i/(1 + sum_j b_j c_j)`, `b = H/q_s`, one `q_s` for all solutes | S-T Eqs. 2.43, 2.48 p. 32-33 (the equal-capacity prerequisite stated, else thermodynamically inconsistent) | matches |
| 22 | direction of displacement: the later solute pushes the earlier ahead | S-T p. 40-41 (a small amount of A displaced by a large amount of B shortens A's retention); Martin and Synge p. 1363 | matches; at equal amounts (what the page injects) both move forward (first moments, load 0.8: first 58.6 to 38.6 s, second 83.4 to 59.5 s; own-Langmuir twins 46.9 and 63.3 s). Wording corrected |
| 23 | tag-along effect "seen here" (old limit text) | S-T p. 43: needs a feed dominated by the FIRST solute; the page injects equal amounts | **differs**: not shown by the page; wording corrected |
| 24 | overload: sharp front and tail, earlier elution, "the concentrated part moves faster" | Martin and Synge p. 1363; S-T Fig. 2.17b, 2.20b, p. 40, 43 | matches |
| 25 | "touching bands" | S-T p. 21 (R_s = 1.5 is baseline resolution at the touching-band situation), p. 45 (the productivity optimum lies beyond it) | matches; now said in steps 4 and 6 |
| 26 | linear-driving-force uptake, `k` lumping film and particle resistances | Ruthven Eq. 8.41 p. 243 (the extension of the Glueckauf approximation, series sum of resistances); Seader Eq. 15-183 p. 506; the engine's `FixedBedAdsorber.H` | matches for the form; the 1955 paper is not in hand (original not read) |
| 27 | load measure `b2 c_inj`: about 0.01 analytical, near 1 far from straight | derived here: `dq/dc = K/(1+bc)^2`, 2 % lower at 0.01, 75 % lower at 1; S-T p. 44 defines the "loading factor" as injected amount over saturation capacity, a different quantity | derived, holds; definition stated on the page |
| 28 | liquid chromatography has no engine route | engine: `FixedBedAdsorber.cpp` `cTot_ = P_/(R T_)` (constructor), the ideal-gas log line, `pIt_[b]->second = cIn_[b] * R * T_`; `IsothermModel.cpp` refuses any `loadingBasis` but `molPerKgAdsorbent` and any `pressureBasis` but the two partial-pressure ones | confirmed (engine fact, not a literature row) |
| 29 | "Seader, Henley and Roper 2011 (chromatography)" for the resolution | Seader 4th ed. section 15.8 (pp. 503-506) prints the wave velocity (Eq. 15-171) and Carta's LDF solution but NO resolution formula | **not found in hand**; the resolution rows are Wankat's and S-T's; reference replaced by the 4th edition, in hand |
| 30 | Guiochon (2002) for overload, purity and recovery, productivity | not in hand | **not found in hand** (original not read); rows 21-25 are checked against S-T chapter 2 |

Counts, by primary verdict, 30 rows: 20 match (1 to 5, 9 to 13, 15 to 19, 21, 22,
24, 25, 26; rows 2, 19 and 22 carry a stated difference of convention or
approximation), 4 differ (6, 7, 14, 23), 3 are derived here and hold (8, 20,
27), 2 are not found in hand (29, 30), and 1 is an engine fact confirmed
against the source (28).

DOIs: the four with DOIs were re-resolved on Crossref on 2026-11-12 (title,
authors, container, volume, issue, pages, year); the PDFs of the 1941 and
1956 papers and of the four books were read as above.  No table or figure
from any of them is reproduced: every number on the page is the page's own
example.

## 8. Not done

Gradient elution, extra-column broadening, a non-isothermal band, the
sorption effect of a concentrated gas pulse (the page holds the velocity
constant and says so), a measured competitive isotherm, simulated moving bed,
and any choice of the "best" load.
