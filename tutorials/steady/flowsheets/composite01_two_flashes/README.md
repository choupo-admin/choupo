# composite01_two_flashes — two units, one graph, one solver problem

A 100 kmol/h equimolar benzene/toluene feed at 365 K and 1 bar into
**flash1** (370 K, 1 bar); flash1's liquid goes on into **flash2** (373 K,
1 bar).  Raoult's law throughout — the same ideal thermodynamics as
`flash01_benzene_toluene`.  What is new is the shape of the case: the root
`flowsheetDict` holds **no units at all**, only `sectors ( flash1 flash2 );`
and a `connections {}` block.  Each child is a folder with its own
`system/flowsheetDict`.

The golden: flash1 splits **V/F = 0.7638** (76.38 kmol/h vapour, 23.62
kmol/h liquid) taking **686.96 kW**; flash2 splits that liquid
**V/F = 0.4359** into 10.30 kmol/h of vapour and 13.33 kmol/h of `bottoms`,
taking **97.36 kW**.

## The lesson

1. **A composite node is a flowsheet of flowsheets.**  `sectors` names the
   children; `connections` wires them, each endpoint being either a bare name
   (this node's own boundary) or a child and one of its ports.  The engine
   flattens the whole tree into ONE flat solver problem with namespaced
   names — the hierarchy is authoring and namespace, never a solver running
   inside a solver.  A child is a leaf here, but the same grammar nests as
   deep as a plant needs.
2. **The stream between them is a file, like every other stream.**
   `liquid1` is produced by flash1 and consumed by flash2, which is the only
   thing that makes it internal; its state lives in `0/liquid1` beside
   `0/feed` and `0/bottoms`.  Nothing about being an intermediate gives a
   stream a different kind of home.
3. **flash1's K-values are `flash01`'s K-values, to the last digit.**
   `K_benzene 1.65136809583` and `K_toluene 0.673501829388` — the same two
   numbers that case pins, because T, P, the components and the model are the
   same.  Yet `flash01` splits at V/F = 0.3040 and this one at 0.7638.  For
   an isothermal flash the K's come from the thermodynamics and V/F comes
   from Rachford-Rice on those K's and the feed composition: 40/60 there,
   50/50 here.  Two different answers from one identical equilibrium — worth
   sitting with, because it is the difference between a property and a
   balance.
4. **The feed's state does not move the split, but it pays for the duty.**
   `flash01`'s feed is already at 370 K and reports `Q_kW = 0`; this feed
   arrives at 365 K and flash1 charges **686.96 kW** to get it there.  Same
   K's, same V/F logic, different heat bill.
5. **The boundary closes over both boxes at once.**  The plant-level
   `Q_boundary_kW` is **784.320784601**, which is exactly flash1's
   686.964038241 plus flash2's 97.3567463602; add it to `H_feeds_kW`
   1154.14146199 and you get `H_products_kW` 1938.46221389.  The first law is
   drawn across the composite, not per box — check that sum by hand, it is
   two additions.

## What to try

Raise flash2's temperature in `flash2/system/flowsheetDict` and watch
`bottoms` shrink while `vapor2` grows; push it far enough and the second drum
stops being a separator at all.  Then open `ammonia01_synthesis_loop`, where
one stream runs backwards and the units can no longer be solved in order.
