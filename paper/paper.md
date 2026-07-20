---
title: 'Choupo: a glass-box chemical process simulator for teaching transport phenomena and process engineering'
tags:
  - chemical engineering
  - process simulation
  - thermodynamics
  - education
  - C++
  - WebAssembly
authors:
  - name: Vítor Geraldes
    orcid: 0000-0000-0000-0000   # TODO(Vítor): ORCID real
    affiliation: 1
# TODO(Vítor): decidir coautores (AUTHORS lista Pedro Mendes como co-mantenedor
# das guides; a autoria do PAPER é decisão tua) e afiliações.
affiliations:
  - name: Department of Chemical Engineering, Instituto Superior Técnico, Universidade de Lisboa, Portugal
    index: 1
date: 20 July 2026
bibliography: paper.bib
---

# Summary

Choupo is an open-source, educational chemical process simulator written in
C++17 with **zero external dependencies**: every numerical method it uses —
Newton–Raphson in one and many dimensions, Gauss elimination,
Levenberg–Marquardt regression, Runge–Kutta and Rosenbrock integration,
Wegstein acceleration, Nelder–Mead search and Michelsen's tangent-plane
stability test [@michelsen1982] — is implemented in readable source the
student can open, step through, and modify.  Cases are plain-text
dictionaries on disk, in a file-first layout in which the flowsheet file
declares only topology while every stream's state lives in its own file; the
graphical interface is a runner and visualiser (the same solvers compiled to
WebAssembly run in the browser), never a black-box editor.

The current release ships four solver binaries by problem class
(steady-state flowsheeting, batch campaigns driven by time-triggered
recipes, dynamic simulation with feedback control, and a property
workbench), 49 unit-operation models, a curated thermodynamic catalogue
(247 components, 205 Henry's-law pairs, Pitzer and electrolyte-NRTL
parameter sets), and 288 runnable tutorial cases validated by a regression
suite with golden-master checks on every release.

# Statement of need

Commercial process simulators dominate both industry and the classroom, but
they are pedagogically opaque: the student specifies a column and receives
converged profiles without ever seeing a residual, a Jacobian, or the
reference state of an enthalpy.  Existing open-source alternatives
prioritise breadth and industrial workflows over readability of the
computation itself.  Choupo takes the opposite stance — *transparency over
breadth*: at the default verbosity every Newton iteration, every K-value
and every convergence aid is printed and attributed, and the engine refuses
to silently substitute defaults for missing data (a missing binary pair is
announced; a missing formation enthalpy makes an energy balance refuse
rather than fabricate a zero).

Three design decisions serve that goal.  First, **conservation is the
curriculum**: every converged steady run emits a plant-boundary element
balance (atoms of each element in versus out — the true invariant of a
reacting system), batch campaigns carry material and energy ledgers whose
closures are exact state differences on the elements-of-formation datum,
and dynamic runs integrate a conservation ledger on accepted integrator
steps.  Claims are tri-state (full, partial, unavailable) with named
reasons, never silent zeros.  Second, **thermodynamics is declared, not
defaulted**: a case carries a single thermophysical-system dictionary that
names its equilibrium formulation (activity–fugacity, dilute-solution
Henry, a single cubic equation of state serving both phases
[@soave1972; @peng1976], or aqueous electrolyte), and the run log announces
every assembled model and parameter source.  The model library spans NRTL
[@renon1968], UNIQUAC [@abrams1975], predictive UNIFAC [@fredenslund1975]
and COSMO-SAC [@lin2002; @bell2019], Pitzer [@pitzer1973] and
electrolyte-NRTL [@chen1986] electrolytes, and a validated non-associating
PC-SAFT core [@gross2001].  Third, **cases are self-contained**: an
importer seals each case's property records into the case directory under
a checksummed manifest, so a tutorial archived with a thesis reruns
byte-for-byte years later with no installation catalogue present.

Choupo is an independent personal project, conceived, self-funded and
developed by the author in his free time, on personal equipment; it is not
an institutional product.  It is designed for teaching transport phenomena
and process engineering — and for the LLM era of case authoring: the
documentation ships a machine-oriented reference so a student can author
dictionaries with an assistant while the engine remains the sole arbiter
of the physics.

# Acknowledgements

Substantial parts of the initial implementation, documentation and tutorial
corpus were produced with assistance from Anthropic Claude; the published
project is human-curated, reviewed and maintained by the authors.  The
*Choupo* name is a trademark of TalentGround Lda.; the code is
GPL-3.0-or-later.

# References
