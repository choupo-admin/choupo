# nanofiltran_geraldesAlves2008 — one case for one paper

V. Geraldes, A.M. Brites Alves, "Computer program for simulation of mass
transport in nanofiltration membranes", J. Membr. Sci. 321 (2008) 172-182
(doi:10.1016/j.memsci.2008.04.054) — NanoFiltran, and the two comparisons
its paper makes, run by Choupo's DSPM-DE pore in one case.

```
runCase tutorials/props/membrane/nanofiltran_geraldesAlves2008
```

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

## The three studies, in the order the paper makes them

* **A — Code to code: Choupo against NanoFiltran on one model.**  The same
  DSPM-DE model and the same inputs, solved by two independent programs
  (NanoFiltran: Fortran 77, central differences, under-relaxed Newton;
  Choupo: C++, exponentially fitted fluxes, full Newton).  It says the
  equations are solved right; it is NOT a validation — no number here is a
  measurement, and the membrane is NanoFiltran's worked example, which
  describes no real membrane.
* **B — Experiment: Bowen & Mohammad's CA30 rejections (the paper's Fig. 3).**
  A comparison with MEASUREMENTS whose inputs were FITTED to these very
  data by Bowen & Mohammad (AIChE J. 44 (1998) 1799): the pore radius and
  thickness, the membrane charge as a function of the feed (Eq. 43) and the
  permeate flux as a function of the feed (Eqs. 44-45).  Agreement here says
  the pore model, carried by inputs fitted on these data, reproduces them —
  it does not say the model predicts a membrane it was not fitted on.
* **C — The stiff case of Table 2 and Fig. 4, and its grid study.**  A
  numerical study: the paper's "very stiff" pore (Na+ and Mg2+ hindered
  diffusivities two orders of magnitude apart), solved on six node counts,
  and Choupo's answer against Table 2 accounted for one change at a time.
  Nothing here is a measurement.

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
