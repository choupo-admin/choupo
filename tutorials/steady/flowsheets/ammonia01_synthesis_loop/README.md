# ammonia01_synthesis_loop — the answer stops being a sequence

The Haber-Bosch loop, five units: a `mixer`, a `gibbsReactor` converter at
**700 K and 200 bar**, an `isothermalFlash` separator chilled to **250 K** at
200 bar, a let-down drum flashing the separator's liquid to **20 bar** at the
same 250 K, and a `splitter` that sends **5 %** of the unreacted gas to purge
and **95 %** back to the mixer.  The makeup is 1 kmol/h — `N2 0.2475`,
`H2 0.7425`, `Ar 0.01` kmol/h — a 1:3 stoichiometric ratio with a trace of
inert argon.

Every case before this one could be solved by running its units in declared
order.  This one cannot: `recycle` leaves the splitter and re-enters the
mixer, so the mixer's inlet depends on an answer that is four units
downstream of it.

The golden: the converter reaches **y_NH3 = 0.3108** at equilibrium
(y_H2 0.4998, y_N2 0.1632, y_Ar 0.0262); the separator condenses
**V/F = 0.6931** with **K_NH3 = 0.01626**; the let-down boils off
**V/F = 0.008021** with **K_NH3 = 0.09469**; the mixer leaves at
**274.38 K**.

## The lesson

1. **The cut is declared, and the seed is yours.**  `system/solverDict` says
   `tearStreams ( recycle );` with `recycleSolver Newton;`,
   `recycleTol 1e-5;`, `recycleMaxIter 200;` — the topology stays in
   `flowsheetDict` and the numerical strategy sits here.  `0/recycle` carries
   the starting guess, and its own header says in so many words that it is an
   estimate and not a specification: the solver converges it and announces
   what it did.  Nothing about closing this loop happens behind your back.
2. **The recycle is visible in the arithmetic of the pinned numbers.**  One
   kmol/h of makeup enters, and the converter sees **2.02566484668 kmol/h**.
   The difference is the recycle, and it is what turns a per-pass equilibrium
   of about 31 % ammonia into a loop that recovers far more of the makeup
   than any single pass could.  The reason the loop exists is a subtraction
   you can do in your head.
3. **The converter is told elements, not a conversion.**  `gibbsReactor`
   takes `elements ( N H Ar )` and a species list with their atom counts, and
   minimises Gibbs energy: no rate constant, no declared extent, no
   conversion specification anywhere.  What comes back is
   `y_NH3 0.310807360284` plus the element potentials `lambda_N`, `lambda_H`,
   `lambda_Ar` — the Lagrange multipliers of the atom balances, printed
   because they are the answer's own arithmetic.
4. **Two flashes, one temperature, two pressures.**  The separator at 250 K
   and 200 bar condenses ammonia out of the loop gas (`K_NH3 0.01626`); the
   let-down drum holds the same 250 K at 20 bar and boils dissolved light gas
   back out of that liquid (`K_NH3 0.09469`, `V/F 0.008021`).  The liquid
   world is declared as a dilute solution — ammonia as the solvent on the
   pure-liquid rung, N2 and H2 as Henry solutes on the infinite-dilution rung
   with their own pair files in `constant/parameters/Henry/` — while the
   vapour is `fugacityModel SRK;`, a real gas at 200 bar.  Read
   `constant/thermoPhysPropDict`: one stream, two reference rungs in its
   liquid, and both of them declared.
5. **The purge is a splitter and nothing else, and it is what makes the loop
   finite.**  Argon enters with the makeup at 0.01 kmol/h, takes part in no
   reaction, and would otherwise circulate for ever.  `fractions ( 0.05 0.95 )`
   is the entire mechanism.  Then do the balance yourself: add the argon on
   every stream that leaves the plant boundary — `purge`, `letdownGas` and
   `productNH3` — and check it against the 0.01 kmol/h that came in.  It
   closes, and the exit carrying most of it may not be the one you would have
   guessed from the diagram.

## What to try

Change the splitter to `fractions ( 0.02 0.98 );` — a smaller purge.  The
recycle grows, the argon in the loop climbs, and the converter's `y_Ar` rises
at the expense of everything it is diluting.  Push it far enough and the loop
chokes on its own inert, which is the whole argument for spending reactants
on a purge.  Then open `tutorials/plant/acetonePlant`, the last case on this
path: a published industrial process, closed, with a recycle, and a written
account of where its errors come from.
