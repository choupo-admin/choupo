# bubbleT01_ethanol_water — the first non-ideal mixture

30/70 ethanol/water (100 kmol/h) at 1 atm: at what temperature does the
first bubble form, and what is in it?  The answer from the golden:
**T_bubble = 354.57 K**<!--golden: kpi bubble01 T_bubble--> (81.42 °C<!--golden: kpi bubble01 T_bubble +-273.15-->), and the first vapour is
**58.5 mol%<!--golden: kpi bubble01 y_ethanol *100--> ethanol** from a liquid that is 30 % — the enrichment every
distillation column lives on.

## The lesson

1. **Raoult would get this wrong, so the case declares NRTL.**  Open
   `constant/thermoPhysPropDict`: the liquid activity model is named,
   and the run announces it at the top of the log
   (`liquid activity.NRTL; vapour idealGas`).  Nothing is chosen for you.
2. **One equation, one unknown.**  Σ y_i = Σ K_i x_i = 1, solved for T by
   Newton.  The **Log** tab prints the whole table: five iterations from
   a 366.6 K guess, |f| driven to 3.1e-12.  Count them; read ΔT shrink.
3. **K carries the non-ideality.**  The result table gives
   K_ethanol = 1.951<!--golden: kpi bubble01 y_ethanol *3.333333333--> and K_water = 0.593<!--golden: kpi bubble01 y_water *1.428571429--> at 354.6 K<!--golden: kpi bubble01 T_bubble-->.  With Raoult alone
   (K = Psat/P) ethanol's K would be far smaller here — the difference is
   the activity coefficient, and it is why the vapour is ethanol-rich.
4. **This is one point on a curve.**  `dewT01_ethanol_water` asks the
   mirror question (Σ x = Σ y/K = 1) for a vapour of the same composition,
   and the two together bracket the two-phase region at 1 atm.

## What to try

Change the feed to 90/10 ethanol/water in `0/feed` and run again: the
bubble point moves toward ethanol's boiling point, and the vapour is
barely richer than the liquid — you are near the azeotrope, which is what
`column03_azeotrope_mesh` is about.
