# shortcut01_benzene_toluene — a column in four equations, and a record that it is a shortcut

An equimolar benzene/toluene feed (100 kmol/h at 365 K, 1 atm) is to be
split 99 % / 1 %: 99 % of the benzene overhead, 1 % of the toluene with
it.  Fenske–Underwood–Gilliland answers in one pass, no stages solved.
The golden: **N_min = 10.07** (Fenske), **R_min = 1.294** (Underwood, θ =
1.427), operating **R = 1.682** (declared as 1.3·R_min), **N = 21.6**
theoretical stages with the feed at **10.8** from the top; α_LK/HK =
2.491 at the feed bubble point; D = B = 50 kmol/h; x_D = x_B = 0.99.

## The lesson

1. **Three declared numbers, four printed results.**  `recoveryLK 0.99;
   recoveryHK 0.01; refluxFactor 1.3;` — and the engine will not invent
   the reflux factor for you: a column whose reflux the engine chose is
   one nobody can defend at a viva, so the key is REQUIRED.
2. **The only thermodynamics is one bubble point.**  α is evaluated once,
   at the feed's bubble temperature, and held constant — the method's
   founding assumption, and the run says so in its result block.
3. **A shortcut is recorded as a different question.**  Look at the top
   of the result: `problemDivergence` carries a `declaredApproximation`
   for this unit — *requested: distillation separation; solved:
   Fenske-Underwood-Gilliland shortcut (constant relative volatility at
   the feed bubble point; no azeotrope representable)*.  It is not an
   error and it is not hidden: a stream table cannot show that the column
   was a shortcut, so the record travels with the answer.
4. **Now build the rigorous one.**  `column01_benzene_toluene` puts
   15 real stages with the feed on 8 at R = 2 — read that README and
   compare N = 21.6 at 1.3·R_min with what 15 stages at a higher reflux
   actually deliver.

## What to try

Set `refluxFactor 1.05`: N climbs steeply toward infinity as R → R_min —
Gilliland's curve, in two runs.  Then `recoveryLK 0.999`: N_min jumps,
because Fenske is logarithmic in the split.
