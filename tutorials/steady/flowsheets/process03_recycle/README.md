# process03_recycle — a stream that feeds back, and the solver that closes it

`process01` with a loop: reactor → flash → **splitter**, and 60 % of the
flash liquid is sent *back* to a mixer ahead of the reactor.  The reactor
is four times larger (20 litres).  The golden: the reactor now sees
**1.497 kmol/h** (1.0 fresh + 0.497 recycle), converts **80.9 %** per
pass at **τ = 870 s**, and the loop closes with the recycle stream at
**0.4967 kmol/h, 364 K**.

## The lesson

1. **A cycle needs a cut, and the author declares it.**
   `system/solverDict` says `tearStreams ( recycle );` — the engine
   detects cycles, but *which* stream to tear is a choice, so it is
   written down.  Reverse the units or forget the tear and the run
   refuses by name (`INVALID ORDER`, `MISSING TEAR`), never silently.
2. **The tear starts from `0/recycle`, a guess, and the log says so.**
   `Tear streams (initial guesses): recycle F = 0.7876 kmol/h …` — then
   a Newton over five variables (F, three compositions, T).  The
   **Log** tab prints `|r|2` per iteration: 1.34e-1 → 4.25e-3 →
   converged in **2 iterations** at 3.9e-6.  The seed was 60 % too high
   and it did not matter.
3. **`[plan]` announces the cut before anything runs.**  `material
   recycle: tear 'recycle' cuts mixer01 → reactor → separator →
   split01 --recycle--> mixer01` — read that line first; it is the
   whole topology in one sentence.
4. **The recycle changes what the reactor is asked to do.**  Conversion
   per pass is 80.9 % because the reactor is larger and the feed is
   richer in what came back; overall, less ethanol leaves in `liqProd`.
   Compare the Streams tab against `process01` line by line.

## What to try

Change `fractions ( 0.6 0.4 )` to `( 0.8 0.2 )`: more recycle, a bigger
loop flow, and watch whether the Newton still closes in two steps.
`recycle_autoinit_tear` shows what happens when you give it *no* guess
at all.
