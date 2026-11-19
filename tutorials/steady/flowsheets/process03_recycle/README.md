# process03_recycle — a stream that feeds back, and the solver that closes it

`process01` with a loop: reactor → flash → **splitter**, and 60 % of the
flash liquid is sent *back* to a mixer ahead of the reactor.  The reactor
is four times larger (20 litres).  The golden: the reactor now sees
**1.823 kmol/h**<!--golden: kpi reactor F_in_kmol_h--> (1.0 fresh + 0.823 recycle<!--golden: stream recycle F *3600-->), converts **78.2 %**<!--golden: kpi reactor X_limiting *100--> per
pass at **τ = 658 s**<!--golden: kpi reactor tau_s-->, and the loop closes with the recycle stream at
**0.8231 kmol/h**<!--golden: stream recycle F *3600-->, **364 K**<!--golden: stream recycle T-->.

## The lesson

1. **A cycle needs a cut, and the author declares it.**
   `system/solverDict` says `tearStreams ( recycle );` — the engine
   detects cycles, but *which* stream to tear is a choice, so it is
   written down.  Reverse the units or forget the tear and the run
   refuses by name (`INVALID ORDER`, `MISSING TEAR`), never silently.
2. **The tear starts from `0/recycle`, a guess, and the log says so.**
   `Tear streams (initial guesses): recycle F = 0.7876 kmol/h …` — then
   a Newton over five variables (F, three compositions, T).  The
   **Log** tab prints `|r|2` per iteration: 4.0e-2 → 5.0e-4 →
   converged in **2 iterations** at 6.8e-7.  The seed was 4 % too low
   and it did not matter.
3. **`[plan]` announces the cut before anything runs.**  `material
   recycle: tear 'recycle' cuts mixer01 → reactor → separator →
   split01 --recycle--> mixer01` — read that line first; it is the
   whole topology in one sentence.
4. **The recycle changes what the reactor is asked to do.**  Conversion
   per pass is 78.2 % because the reactor is larger and the feed is
   richer in what came back; overall, less ethanol leaves in `liqProd`.
   Compare the Streams tab against `process01` line by line.

## What to try

Change `fractions ( 0.6 0.4 )` to `( 0.8 0.2 )`: more recycle, a bigger
loop flow, and watch whether the Newton still closes in two steps.
`recycle_autoinit_tear` shows what happens when you give it *no* guess
at all.
