# process01_reactor_flash — two units wired by a stream

A 1 kmol/h equimolar ethanol / acetic-acid feed enters a 5-litre CSTR at
350 K; the reactor outlet goes straight into a flash held at 365 K and
1 bar.  Two units, three streams, and one idea: **a flowsheet is a graph
of streams, and information follows them.**

The golden: conversion of ethanol **X = 0.5259** at a residence time of
**310.3 s** (Damköhler number 1.109, k = 3.575e-3 s⁻¹ from the Arrhenius
law), the reactor removing **1.88 kW**; the separator flashes **45.2 %**
of what arrives (0.452 kmol/h vapour, 0.548 kmol/h liquid) with
K_ethanol 1.696, K_ethylAcetate 1.608, K_aceticAcid 0.428, K_water 0.767,
taking **4.98 kW** to hold 365 K.

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
   **Reports** tab shows mass, per-element and energy closures for the
   whole sheet — the flash's 4.98 kW and the reactor's −1.88 kW are both
   in the ledger.

## What to try

Double the reactor volume (`operation { V_R 0.010; }`): conversion rises,
the flash feed changes, and the separator's duty follows — one edit,
three consequences, all visible in **Streams**.  Then open
`process03_recycle`, where a stream loops back and the solver has to
iterate the whole graph.
