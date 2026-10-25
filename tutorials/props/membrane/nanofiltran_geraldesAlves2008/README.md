# nanofiltran_geraldesAlves2008 — one case for one paper

<!-- tutorials-guide: card -->

V. Geraldes, A.M. Brites Alves, "Computer program for simulation of mass
transport in nanofiltration membranes", J. Membr. Sci. 321 (2008) 172-182
(doi:10.1016/j.memsci.2008.04.054) — NanoFiltran, and the two comparisons
its paper makes, run by Choupo's DSPM-DE pore in one case.

```
runCase tutorials/props/membrane/nanofiltran_geraldesAlves2008
```

## Where the theory is

The model and the method are the Theory Guide's DSPM-DE chapter (section
19): the whole boundary-value problem one pore solves — the extended
Nernst-Planck equations, electroneutrality at every node, zero current,
the steric, Born and Donnan partitions at both faces, the multi-ionic wall
— in 19.3; the Peclet numbers that decide how hard it is in 19.4; the
numerical method (Scharfetter-Gummel fluxes, the block-tridiagonal Newton,
the local Donnan seed, the continuation in J_v) in 19.5; and the node
counts below, with what they mean, in 19.8.  In the GUI, F1 on any
operation of this case opens that chapter at the model, with the numerical
method offered beside it.

## What this case imposes, and what it computes

**It IMPOSES the permeate flux J_v; it does not compute the flux from the
pressure.**  Every operation is a `poreTransport` bench: it is handed J_v (a
list; in study B, Bowen & Mohammad's fitted function evaluated at each
operation's feed and written in the operation) and solves the extended
Nernst-Planck equations across the pore, with electroneutrality at every
node, steric, Born and Donnan partitions at both faces and the multi-ionic
film at the wall.  So the membrane record's `A_w` (the pure-water permeance,
J_w = A_w (dP - dpi)) is carried because the record grammar requires it and
is not read here.

What it publishes, per J_v point and per ion: the bulk, wall and permeate
concentrations, the observed rejection R_obs = 1 - c_p/c_b and the real
rejection R_real = 1 - c_p/c_wall, the potential across the membrane and the
pore Newton's iteration count.

## The three studies: what each teaches, and which one is stiff

Whether a pore is stiff is read off one number per ion, its pore Peclet
number Pe_i = K_c,i J_v / (K_d,i D_i A_k/dx) — convection against hindered
diffusion across the layer — computed here from the case's own ion records
and membranes.

* **A — Code to code: Choupo against NanoFiltran on one model.**  The same
  DSPM-DE model and the same inputs, solved by two independent programs
  (NanoFiltran: Fortran 77, central differences, under-relaxed Newton;
  Choupo: C++, exponentially fitted fluxes, full Newton).  It teaches that
  the equations are solved right — the two programs' grid limits agree
  within 8e-7 on 35 permeates — and it is NOT a validation: no number here
  is a measurement, and the membrane is NanoFiltran's worked example, which
  describes no real membrane.  The pore runs from nearly linear (J_v 1e-6
  m/s, Pe of Mg2+ 0.7) to stiff (5e-5 m/s, Pe of Mg2+ 33).
* **B — Experiment: Bowen & Mohammad's CA30 rejections (the paper's Fig. 3).**
  It teaches what agreement with measurements means when the inputs were
  FITTED to those very data by Bowen & Mohammad (AIChE J. 44 (1998) 1799):
  the pore radius and thickness, the membrane charge as a function of the
  feed (Eq. 43) and the permeate flux as a function of the feed (Eqs.
  44-45).  Agreement here says the pore model, carried by inputs fitted on
  these data, reproduces them — not that it predicts a membrane it was not
  fitted on.  This study is NOT stiff: Pe is 0.06-0.14 for Na+ and
  0.03-0.07 for Cl-, and the pore profiles are nearly straight.  Its
  physics is at the WALL: the trivalent dye is as large as the pore (lambda
  = 1), so the pore excludes it; it accumulates in the film and sets the
  wall's electroneutrality, and that is what drives Cl- to R_obs = -2.
* **C — The stiff case of Table 2 and Fig. 4, and its grid study.**  A
  numerical study, nothing measured: the paper's "very stiff" pore solved
  on six node counts, and Choupo's answer against Table 2 accounted for one
  change at a time.  It IS stiff: Pe is 33 for Mg2+ against 0.56 for Na+
  and 0.20 for Cl-, because the two counter-ions' hindered diffusivities
  K_d D differ 70 times (Mg2+ at lambda = 0.875 barely diffuses).  Mg2+ is
  carried, the trace Na+ diffuses, and the pore holds an interior front
  where Na+ hands the fixed charge over to Mg2+ (Na+ falls from 12 to 0.16
  mol/m3 between a third of the way in and the permeate face).  The run
  prints the stiffness — the electromigration flux against the net flux —
  as 1.65e3 for every node count.

## How many nodes: it depends on what you report

Measured on study C (re-run 2026-10-25 on a copy of this case whose six N
operations were joined by 801 and 1601 nodes, every operation writing its
pore profile).  Errors against the case's finest grid, 350 nodes, which is
itself within 1e-4 relative of the Richardson limit of 801 and 1601 nodes
on every row:

| quantity (value at 350 nodes) | 10 nodes | 20 | 50 | 100 | 200 |
|---|---:|---:|---:|---:|---:|
| R_obs of Na+ (99.4457 %), in points | -0.073 | -0.017 | -0.0025 | -0.0006 | -0.0001 |
| permeate Na+ (0.05543 mol/m3) | +13.2 % | +3.03 % | +0.45 % | +0.10 % | +0.019 % |
| permeate Mg2+ (8.6317 mol/m3) | -0.64 % | -0.15 % | -0.023 % | -0.005 % | -0.001 % |
| permeate Cl- (17.3188 mol/m3) | -0.59 % | -0.14 % | -0.021 % | -0.005 % | -0.001 % |
| Mg2+ at the pore's permeate end (15.0235 mol/m3) | -0.077 % | -0.018 % | -0.0026 % | -0.0006 % | -0.0001 % |
| psi at the pore's permeate end (0.07217 V) | -4.52 % | -1.08 % | -0.16 % | -0.038 % | -0.007 % |
| potential across the membrane, dPsi_m (0.14496 V) | -2.21 % | -0.53 % | -0.080 % | -0.018 % | -0.003 % |
| Newton iterations (12 at 350 nodes) | 7 | 9 | 9 | 10 | 11 |

The lesson: the rejection forgives a coarse grid; the permeate of a trace
ion — and so any selectivity built on it — does not.  Ten nodes put the
Na+ rejection within 0.1 point and its permeate 13 % high.  The error falls
as the square of the cell size (double the nodes, a quarter of the error),
so declare `nodes` at n and 2n and compare the quantity you report.

## Read the comparisons for what they are

* **Nothing was fitted by this run.**  In study B the parameters were fitted
  by Bowen & Mohammad, before this case existed; Choupo fits nothing.
* **The error bars of Fig. 3 are READING uncertainty.**  The measured
  symbols were digitised from the paper's figure (calibration checked
  against the tick labels; reading error +-1.5 px = 0.32 mol/m3 in c_Cl and
  0.011 in R_obs).  They are not the original experimental uncertainty.
* **The feed chloride of each study-B operation is the mean of its two
  markers' readings** — the Na+ and Cl- symbols of one measurement sit at
  one feed, and were read at slightly different abscissae.
* **The two programs count N differently.**  Choupo's N nodes have N - 1
  intervals; NanoFiltran's N counts the permeate node, so it has N - 2
  intervals inside the membrane.
* **Table 2 carries a factor of ln 10 in its Davies activities**, and Choupo
  deliberately reproduces no such option, so Choupo is NOT pinned to Table 2:
  it is pinned to NanoFiltran with that constant (and its Born constant and
  diffusivity input) corrected.  The grid-study figure's "Davies corrected"
  NanoFiltran line has ONLY the Davies constant corrected, so the gap left
  between it and Choupo is not discretisation alone.
* **12 against 88 iterations is not a speed measurement.**  Choupo runs a
  full Newton with an analytic Jacobian to its own tolerance; NanoFiltran an
  under-relaxed (0.2) Newton to TOL 1e-4.  The criteria, the relaxation and
  the work per iteration differ.

The full account — every difference between the two programs and how each
was handled, the Davies finding, and the term-by-term accounting of Table 2
— is the leading comment of `system/propsDict`.
