# process01_reactor_flash — two units wired by a stream

A 1 kmol/h equimolar ethanol / acetic-acid feed enters a 5-litre CSTR at
350 K; the reactor outlet goes straight into a flash held at 365 K and
1 bar.  Two units, three streams, and one idea: **a flowsheet is a graph
of streams, and information follows them.**

The golden: conversion of ethanol **X = 0.5075**<!--golden: kpi reactor X_limiting--> at a residence time of
**288.3 s**<!--golden: kpi reactor tau_s--> (Damköhler number 1.030<!--golden: kpi reactor Da_kTau-->, k = 3.575e-3<!--golden: kpi reactor k--> from the Arrhenius
law), the reactor removing a small **0.148 kW**<!--golden: kpi reactor Q_kW *-1--> (the liquid esterification
is only mildly exothermic); the separator flashes **21.2 %**<!--golden: kpi separator V_over_F *100-->
of what arrives (0.212 kmol/h<!--golden: kpi separator F_beta *3600--> vapour, 0.788 kmol/h<!--golden: kpi separator F_alpha *3600--> liquid) with
K_ethanol 1.658<!--golden: kpi separator K_ethanol-->, K_ethylAcetate 1.572<!--golden: kpi separator K_ethylAcetate-->, K_aceticAcid 0.305<!--golden: kpi separator K_aceticAcid-->, K_water 0.736<!--golden: kpi separator K_water-->,
taking **2.67 kW**<!--golden: kpi separator Q_kW--> to hold 365 K.  Acetic acid's K is the low one: its
liquid is referenced to the monomer's saturation pressure, because its
vapour associates into dimers (the theory guide's paragraph *Which vapour
the latent heat speaks*).

## The lesson

1. **The topology is the whole of `flowsheetDict`.**  Two `units`, each
   naming its `in` and `outputs`; the stream `reactorOut` is produced by
   one and consumed by the other, and that is what makes it internal.
   No stream values live there — they live in `0/`, one file per stream.
2. **The reaction is a named record**, `constant/reactions`
   (`esterification_etac`): stoichiometry, which reactant is limiting,
   and an Arrhenius `A`/`Ea`.  Its own header says the kinetics are
   ILLUSTRATIVE pseudo-first-order — read that before quoting a rate.
3. **Units run in declared order**, reactor first.  Reverse the two
   entries and the engine refuses, naming the stream that would be read
   before it was produced.
4. **Every balance is drawn from the engine, by default.**  The
   **Reports** tab carries the mass closure and the plant-boundary first
   law (`Q_boundary 2.5216 kW`<!--golden: boundary global Q_boundary_kW--> — the NET heat crossing the boundary, not
   either unit's duty); the flash's 2.67 kW<!--golden: kpi separator Q_kW--> appears there under
   **Utilities**, as the steamLP that serves it.  The **per-element**
   closure is drawn in the **Plots** tab, not in Reports.  The reactor's
   −0.148 kW<!--golden: kpi reactor Q_kW *-1--> is in neither: it is a per-unit duty, and the engine writes it
   to `reports/balances/energyBalance_byUnit.csv`, which the CLI leaves in
   the case directory.  Three numbers, three surfaces — worth knowing
   before you go looking for one in the wrong place.

## What to try

Double the reactor volume (`operation { V_R 0.010; }`): conversion rises,
the flash feed changes, and the separator's duty follows — one edit,
three consequences, all visible in **Streams**.  Then open
`process03_recycle`, where a stream loops back and the solver has to
iterate the whole graph.
